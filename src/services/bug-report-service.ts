import { z } from "zod";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { Board, BoardColumn, BoardGroup, BugReportInput, BugReportReceipt, ColumnValue, EntityId, WorkspaceMember } from "@/domain";
import { BUG_BOARD, COLUMN_TYPE_LABELS, BUG_BOARD_OWNER_EMAIL, BUG_CATEGORIES, BUG_COLUMN_NAMES, BUG_GROUP, MAX_BUG_DESCRIPTION, MAX_BUG_SCREENSHOTS, SPECIAL_BOARD_COLUMN_TYPES, bugBoardColumns, bugCategoryName, bugReportTitle } from "@/domain";
import type { BoardService } from "./board-service";
import type { ItemService } from "./item-service";
import type { NotificationService } from "./notification-service";

/** A screenshot as it is linked from the board: a stored file, or (local mode) the image itself. */
const screenshotUrl = z.string().max(3_000_000).refine((url) => /^https:\/\//i.test(url) || /^data:image\/(webp|png|jpeg);base64,/i.test(url), "A screenshot has to be an uploaded image.");

export const bugReportSchema = z.object({
  category: z.enum(BUG_CATEGORIES.map((c) => c.id) as [BugReportInput["category"], ...BugReportInput["category"][]]),
  description: z.string().trim().min(1, "Say what happened.").max(MAX_BUG_DESCRIPTION, `Keep it under ${MAX_BUG_DESCRIPTION} characters.`),
  screenshots: z.array(screenshotUrl).max(MAX_BUG_SCREENSHOTS).default([]),
  pageUrl: z.string().max(2000).nullable().default(null),
  appVersion: z.string().max(40).nullable().default(null),
  userAgent: z.string().max(400).nullable().default(null),
  viewport: z.string().max(40).nullable().default(null),
});

/** How a report reaches the server when the browser cannot write to the board itself (Supabase). */
export interface BugReportTransport {
  submit(input: { workspaceSlug: string; report: BugReportInput }): Promise<BugReportReceipt>;
}

/**
 * Bug reports, filed by anybody into a board only the app's keeper sees.
 *
 * `submit` is what the dialog calls. `file` does the work, wherever it may
 * write to that board: in the browser in local mode, and on the server with the
 * service role for Supabase (src/server/bug-report.ts).
 */
export class BugReportService {
  constructor(
    private readonly repos: Repositories,
    private readonly boards: BoardService,
    private readonly items: ItemService,
    private readonly notifications: NotificationService,
    private readonly transport: BugReportTransport | null,
  ) {}

  async submit(input: { workspaceId: EntityId; workspaceSlug: string; report: BugReportInput; reporterId: EntityId }): Promise<BugReportReceipt> {
    if (this.transport) return this.transport.submit({ workspaceSlug: input.workspaceSlug, report: input.report });
    return this.file(input.workspaceId, input.report, input.reporterId);
  }

  async file(workspaceId: EntityId, raw: BugReportInput, reporterId: EntityId): Promise<BugReportReceipt> {
    const report = bugReportSchema.parse(raw) as BugReportInput;
    const members = await this.repos.workspaces.listMembers(workspaceId);
    if (!members.some((m) => m.userId === reporterId && m.status === "ACTIVE")) throw new Error("Only members of this workspace can report a bug.");

    const keeperId = await this.keeperOf(workspaceId, members);
    const board = await this.ensureBoard(workspaceId, keeperId);
    const [columns, groups] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.boards.listGroups(board.id)]);
    const group = await this.bugsGroup(board.id, groups);

    const item = await this.items.createItem(
      { boardId: board.id, groupId: group.id, name: bugReportTitle(report.description), description: null, values: placeValues(columns, report, reporterId, keeperId) },
      reporterId,
    );
    // Kept on the task as well, as a booking's brief is, so a Brief column added back later arrives filled.
    await this.repos.items.setBookingBrief(item.id, composeBugBrief(report));

    if (keeperId !== reporterId) {
      const reporter = await this.repos.users.getById(reporterId);
      await this.notifications.deliver([
        {
          userId: keeperId,
          type: "ASSIGNED",
          title: `${reporter?.firstName ?? "Someone"} reported a bug: ${item.name}`,
          body: `${bugCategoryName(report.category)} · ${board.name}`,
          entityType: "ITEM",
          entityId: item.id,
          boardId: board.id,
          actorId: reporterId,
        },
      ]);
    }
    return { itemId: item.id, itemName: item.name };
  }

  /** The person who looks after the app, by email; the workspace owner where nobody has that address. */
  private async keeperOf(workspaceId: EntityId, members: readonly WorkspaceMember[]): Promise<EntityId> {
    const user = await this.repos.users.getByEmail(BUG_BOARD_OWNER_EMAIL);
    if (user && members.some((m) => m.userId === user.id && m.status === "ACTIVE")) return user.id;
    const owner = members.find((m) => m.role === "OWNER" && m.status === "ACTIVE") ?? members.find((m) => m.role === "OWNER");
    if (!owner) throw new NotFoundError("Workspace owner", workspaceId);
    return owner.userId;
  }

  /** The board the workspace remembers, while it is still there; otherwise a new one, remembered. */
  private async ensureBoard(workspaceId: EntityId, keeperId: EntityId): Promise<Board> {
    const workspace = await this.repos.workspaces.getById(workspaceId);
    if (!workspace) throw new NotFoundError("Workspace", workspaceId);
    const known = workspace.bugBoardId ? await this.repos.boards.getById(workspace.bugBoardId) : null;
    if (known && known.workspaceId === workspaceId && !known.archivedAt) return known;

    const columns = bugBoardColumns();
    // The special columns every board holds, which a bug has no use for, arrive hidden rather than left for the board to add in plain view.
    const extras = SPECIAL_BOARD_COLUMN_TYPES.filter((type) => !columns.some((c) => c.type === type)).map((type) => ({ name: COLUMN_TYPE_LABELS[type], type, hidden: true }));
    const { board } = await this.boards.createBoard(
      { workspaceId, name: BUG_BOARD.name, description: BUG_BOARD.description, teamId: null, visibility: "PRIVATE", templateId: "blank", color: BUG_BOARD.color, icon: BUG_BOARD.icon },
      keeperId,
      {
        version: 1,
        parts: ["groups", "columnSettings", "layout"],
        board: null,
        groups: [{ key: "bugs", name: BUG_GROUP.name, color: BUG_GROUP.color }],
        columns: [...columns, ...extras].map((column, index) => ({ ...column, key: `c${index}` })),
        automations: [],
        tasks: [],
      },
    );
    await this.repos.workspaces.update(workspaceId, { bugBoardId: board.id });
    return board;
  }

  /** The Bugs group, found by name so a board that has been rearranged still works; made again if it has gone. */
  private async bugsGroup(boardId: EntityId, groups: readonly BoardGroup[]): Promise<BoardGroup> {
    const found = groups.find((g) => g.name.trim().toLowerCase() === BUG_GROUP.name.toLowerCase());
    if (found) return found;
    return this.repos.boards.createGroup({ boardId, name: BUG_GROUP.name, color: BUG_GROUP.color, position: -1, collapsed: false });
  }
}

/** Each part of the report in the column meant for it: by type, and by name where a board has several of a type. */
function placeValues(columns: readonly BoardColumn[], report: BugReportInput, reporterId: EntityId, keeperId: EntityId): Array<{ columnId: EntityId; value: ColumnValue }> {
  const live = columns.filter((c) => !c.removed).sort((a, b) => a.position - b.position);
  const named = (name: string) => live.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  const values: Array<{ columnId: EntityId; value: ColumnValue }> = [];
  const put = (column: BoardColumn | undefined, value: ColumnValue) => {
    if (column) values.push({ columnId: column.id, value });
  };

  const category = named(BUG_COLUMN_NAMES.category) ?? live.find((c) => c.type === "DROPDOWN");
  if (category?.type === "DROPDOWN" && category.settings.kind === "dropdown" && category.settings.labels.some((l) => l.id === report.category)) put(category, { type: "DROPDOWN", labelId: report.category });
  put(live.find((c) => c.type === "REQUESTER"), { type: "REQUESTER", userIds: [reporterId] });
  put(live.find((c) => c.type === "PERSON"), { type: "PERSON", userIds: [keeperId] });
  put(live.find((c) => c.type === "BRIEF"), { type: "RICH_TEXT", text: composeBugBrief(report) });

  const shots = live.filter((c) => c.type === "LINK" && /^screenshot/i.test(c.name.trim()));
  report.screenshots.forEach((url, index) => put(shots[index], { type: "LINK", url, text: `Screenshot ${index + 1}` }));
  const page = named(BUG_COLUMN_NAMES.page);
  if (page?.type === "LINK" && report.pageUrl && /^https?:\/\//i.test(report.pageUrl)) put(page, { type: "LINK", url: report.pageUrl, text: pagePath(report.pageUrl) });
  const version = named(BUG_COLUMN_NAMES.version);
  if (version?.type === "TEXT" && report.appVersion) put(version, { type: "TEXT", text: report.appVersion });
  return values;
}

function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search || "/";
  } catch {
    return url;
  }
}

/** The report as the Brief column shows it: what happened, then where. */
export function composeBugBrief(report: BugReportInput): string {
  const facts = [
    `- **Category:** ${bugCategoryName(report.category)}`,
    report.pageUrl ? `- **Page:** ${report.pageUrl}` : null,
    report.appVersion ? `- **Version:** ${report.appVersion}` : null,
    report.viewport ? `- **Screen:** ${report.viewport}` : null,
    report.userAgent ? `- **Browser:** ${report.userAgent}` : null,
    report.screenshots.length ? `- **Screenshots:** ${report.screenshots.length}` : null,
  ].filter(Boolean);
  return ["## What happened", report.description.trim(), "", "## Where", ...facts].join("\n");
}

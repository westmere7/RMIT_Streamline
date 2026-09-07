import type { Board, BoardColumn, BookingForm, BookingReceipt, BookingRequest, BookingTeamOption, EntityId, Item, NotificationInput, PriorityColumnSettings, Team } from "@/domain";
import { BOOKING_ASSET_TYPES, bookingReference, formatAssetLine } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { bookingRequestSchema, describeBooking, extraFieldsFor, mapBookingToColumns } from "./booking";
import type { ItemLinkService } from "./item-link-service";
import type { ItemService } from "./item-service";
import type { NotificationService } from "./notification-service";
import type { WorkspaceService } from "./workspace-service";

/**
 * How the browser reaches the booking endpoints when it cannot run the service
 * itself. With Supabase a public booking has no session behind it, so the form
 * is loaded and submitted through the app's own route handlers, which run this
 * same service with the service role. Local mode needs no transport: the
 * browser store is right there.
 */
export interface BookingTransport {
  getForm(input: { workspaceSlug: string; key: string | null }): Promise<BookingForm>;
  submit(input: BookingSubmission): Promise<BookingReceipt>;
}

export interface BookingSubmission {
  workspaceSlug: string;
  /** The secret from the public link; null from inside the app. */
  key: string | null;
  request: BookingRequest;
  /**
   * The signed-in member booking, when there is one: the item is recorded as
   * theirs. Only honoured where the caller is trusted (local mode, or the server
   * after checking the session); the HTTP transport drops it and the server
   * reads the session instead.
   */
  actorId?: EntityId | null;
}

export class BookingAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingAccessError";
  }
}

export class BookingService {
  constructor(
    private readonly repos: Repositories,
    private readonly workspace: WorkspaceService,
    private readonly items: ItemService,
    private readonly links: ItemLinkService,
    private readonly notifications: NotificationService,
    private readonly transport: BookingTransport | null,
  ) {}

  // ---- the public form -----------------------------------------------------

  /**
   * What the booking page shows. `key` is the secret from the public link; pass
   * null from inside the app, where the person is already signed in (the
   * transport carries their session instead).
   */
  async getForm(input: { workspaceSlug: string; key: string | null }): Promise<BookingForm> {
    if (this.transport) return this.transport.getForm(input);
    const workspace = await this.requireWorkspace(input.workspaceSlug, input.key);
    return this.buildForm(workspace.id);
  }

  async submit(input: BookingSubmission): Promise<BookingReceipt> {
    if (this.transport) return this.transport.submit(input);
    const workspace = await this.requireWorkspace(input.workspaceSlug, input.key);
    return this.book(workspace.id, input.request, input.actorId ?? null);
  }

  /** The form for a workspace, once the caller has been allowed in. */
  async buildForm(workspaceId: EntityId): Promise<BookingForm> {
    const { workspace } = await this.workspace.ensureSystemEntities(workspaceId);
    const [allocation, teams, boards] = await Promise.all([
      this.taskAllocationBoard(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.boards.listByWorkspace(workspaceId),
    ]);
    const columns = await this.repos.boards.listColumns(allocation.id);
    const priorityColumn = columns.find((c) => c.type === "PRIORITY");
    const priorities = priorityColumn ? (priorityColumn.settings as PriorityColumnSettings).labels.map((l) => ({ name: l.name, color: l.color })) : [];
    const assetColumn = columns.find((c) => c.type === "TAGS" && c.settings.kind === "tags" && c.name.toLowerCase().includes("asset"));
    const assetTypes = assetColumn && assetColumn.settings.kind === "tags" && assetColumn.settings.options.length ? assetColumn.settings.options : BOOKING_ASSET_TYPES;

    const options: BookingTeamOption[] = [];
    for (const team of teams.filter((t) => t.archivedAt === null && !t.system).sort((a, b) => a.name.localeCompare(b.name))) {
      const board = team.bookingBoardId ? boards.find((b) => b.id === team.bookingBoardId && b.archivedAt === null && !b.system) : undefined;
      const fields = board ? extraFieldsFor(await this.repos.boards.listColumns(board.id)) : [];
      options.push({ id: team.id, name: team.name, description: team.description, color: team.color, icon: team.icon, boardName: board?.name ?? null, fields });
    }
    return { workspaceId, workspaceName: workspace.name, workspaceSlug: workspace.slug, assetTypes, priorities, teams: options };
  }

  /**
   * Writes a booking onto its board: the chosen team's receiving board when it
   * has one, otherwise Task Allocation with the requested team noted. Each asset
   * line becomes a subitem. The item is recorded as the signed-in member when
   * one booked it, else as the workspace owner (a public booking has no account
   * behind it); the requester is in the columns and the description regardless.
   */
  async book(workspaceId: EntityId, rawRequest: BookingRequest, memberId: EntityId | null = null): Promise<BookingReceipt> {
    const request = bookingRequestSchema.parse(rawRequest) as BookingRequest;
    const { board: allocation } = await this.workspace.ensureSystemEntities(workspaceId);
    const team = request.teamId ? await this.repos.teams.getById(request.teamId) : null;
    if (request.teamId && (!team || team.workspaceId !== workspaceId || team.archivedAt || team.system)) throw new Error("That team is no longer taking bookings. Pick another, or leave it blank.");

    const receiving = team?.bookingBoardId ? await this.repos.boards.getById(team.bookingBoardId) : null;
    const direct = !!receiving && receiving.workspaceId === workspaceId && receiving.archivedAt === null && !receiving.system;
    const board = direct ? receiving! : allocation;

    const [columns, groups, actorId] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.boards.listGroups(board.id), this.actorFor(workspaceId, board, memberId)]);
    const group = groups.slice().sort((a, b) => a.position - b.position)[0];
    if (!group) throw new Error(`${board.name} has no group to receive bookings.`);

    const placement = mapBookingToColumns(request, columns, { team });
    const item = await this.items.createItem(
      { boardId: board.id, groupId: group.id, name: request.title, values: placement.values.map((v) => ({ columnId: v.columnId, value: v.value })) },
      actorId,
    );
    const description = describeBooking(request, placement);
    if (description) await this.repos.items.update(item.id, { description });
    for (const asset of request.assets) {
      const sub = await this.items.createItem({ boardId: board.id, groupId: group.id, name: formatAssetLine({ ...asset, spec: null }), parentItemId: item.id }, actorId);
      if (asset.spec?.trim()) await this.repos.items.update(sub.id, { description: asset.spec.trim() });
    }

    await this.notifyAdmins(workspaceId, board, item, request, team, actorId);
    return {
      itemId: item.id,
      itemName: item.name,
      boardId: board.id,
      boardName: board.name,
      boardSlug: board.slug,
      teamName: direct ? team!.name : null,
      reference: bookingReference(item.id),
      submittedAt: item.createdAt,
      assetCount: request.assets.length,
    };
  }

  // ---- allocation ----------------------------------------------------------

  /**
   * A manager places a request from Task Allocation onto a team's board: a new
   * item is created there, filled from the request through the boards' column
   * mapping, and the two are linked so progress on the team's board shows on
   * Task Allocation (and to the stakeholder later). The request moves to the
   * "Allocated" group and records where it went.
   */
  async allocate(itemId: EntityId, targetBoardId: EntityId, actorId: EntityId): Promise<{ item: Item; created: Item; board: Board }> {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const [source, target] = await Promise.all([this.repos.boards.getById(item.boardId), this.repos.boards.getById(targetBoardId)]);
    if (!source || !target) throw new NotFoundError("Board", targetBoardId);
    if (source.system !== "TASK_ALLOCATION") throw new Error("Only requests on the Task Allocation board can be allocated.");
    if (target.system || target.archivedAt || target.workspaceId !== source.workspaceId) throw new Error("Pick an active team board in this workspace.");

    const groups = (await this.repos.boards.listGroups(target.id)).sort((a, b) => a.position - b.position);
    const group = groups[0];
    if (!group) throw new Error(`${target.name} has no group to receive the task.`);

    const placeholder = await this.items.createItem({ boardId: target.id, groupId: group.id, name: item.name }, actorId);
    // Linking fills the new item from the request (name, description and every
    // column the two boards have in common) and keeps them in step from now on.
    await this.links.link(item.id, placeholder.id, actorId, { seedFrom: "item" });
    const created = (await this.repos.items.getById(placeholder.id)) ?? placeholder;
    // The asset lines travel as subitems of the new item; they are not linked one by one.
    const subitems = (await this.repos.items.listByBoard(source.id)).filter((i) => i.parentItemId === item.id).sort((a, b) => a.position - b.position);
    for (const sub of subitems) {
      const copy = await this.items.createItem({ boardId: target.id, groupId: group.id, name: sub.name, parentItemId: created.id }, actorId);
      if (sub.description) await this.repos.items.update(copy.id, { description: sub.description });
    }

    const columns = await this.repos.boards.listColumns(source.id);
    const allocatedTo = columns.find((c) => c.type === "TEXT" && c.name.toLowerCase().includes("allocated"));
    if (allocatedTo) await this.repos.items.setValue(item.id, allocatedTo.id, { type: "TEXT", text: target.name });
    const sourceGroups = await this.repos.boards.listGroups(source.id);
    const allocated = sourceGroups.find((g) => g.name.toLowerCase() === "allocated");
    let updated = item;
    if (allocated && item.groupId !== allocated.id) {
      const siblings = (await this.repos.items.listByBoard(source.id)).filter((i) => i.groupId === allocated.id && i.parentItemId === null);
      updated = await this.repos.items.update(item.id, { groupId: allocated.id, position: siblings.length });
      // The asset lines belong with their request: left in "Incoming" they would
      // be deleted with that group and counted against it.
      const stranded = subitems.filter((s) => s.groupId !== allocated.id);
      if (stranded.length) await this.repos.items.updateMany(stranded.map((s) => ({ id: s.id, patch: { groupId: allocated.id } })));
    }
    return { item: updated, created, board: target };
  }

  // ---- helpers -------------------------------------------------------------

  private async requireWorkspace(slug: string, key: string | null) {
    const workspace = await this.repos.workspaces.getBySlug(slug);
    if (!workspace) throw new BookingAccessError("This booking link does not point at a workspace.");
    // In local mode the browser is the whole system, so a signed-in person may
    // book without the key; a public visitor must carry the right one.
    if (key !== null && workspace.bookingKey && key !== workspace.bookingKey) throw new BookingAccessError("This booking link is no longer valid. Ask the studio for the current one.");
    return workspace;
  }

  private async taskAllocationBoard(workspaceId: EntityId): Promise<Board> {
    const { board } = await this.workspace.ensureSystemEntities(workspaceId);
    return board;
  }

  /** Who a booking is recorded as: the member who booked it if they belong here, else the workspace owner, else the board's owner. */
  private async actorFor(workspaceId: EntityId, board: Board, memberId: EntityId | null): Promise<EntityId> {
    const members = await this.repos.workspaces.listMembers(workspaceId);
    if (memberId && members.some((m) => m.userId === memberId && m.status === "ACTIVE")) return memberId;
    const owner = members.find((m) => m.role === "OWNER" && m.status === "ACTIVE") ?? members.find((m) => m.role === "OWNER");
    return owner?.userId ?? board.ownerId;
  }

  private async notifyAdmins(workspaceId: EntityId, board: Board, item: Item, request: BookingRequest, team: Team | null, actorId: EntityId): Promise<void> {
    const members = await this.repos.workspaces.listMembers(workspaceId);
    const admins = members.filter((m) => m.status === "ACTIVE" && (m.role === "OWNER" || m.role === "ADMIN"));
    const where = team ? `for ${team.name}` : "to Task Allocation";
    const inputs: NotificationInput[] = admins.map((m) => ({
      userId: m.userId,
      type: "TASK_BOOKED",
      title: `${request.requesterName} booked “${item.name}” ${where}`,
      body: request.dueDate ? `Due ${request.dueDate}. Open it on ${board.name} to review and allocate.` : `Open it on ${board.name} to review and allocate.`,
      entityType: "ITEM",
      entityId: item.id,
      boardId: board.id,
      actorId,
    }));
    if (inputs.length) await this.notifications.deliver(inputs);
  }
}

/** Columns the Task Allocation board is created with. Kept here so the form and the board agree. */
export function taskAllocationColumns(teamNames: readonly string[]): Array<Pick<BoardColumn, "name" | "type"> & { settings?: BoardColumn["settings"] }> {
  return [
    { name: "Requester", type: "TEXT" },
    { name: "Email", type: "TEXT" },
    { name: "Department", type: "TEXT" },
    { name: "Asset type", type: "TAGS", settings: { kind: "tags", options: BOOKING_ASSET_TYPES.map((o) => ({ ...o })) } },
    { name: "Assets & specs", type: "LONG_TEXT" },
    { name: "Requested team", type: "TAGS", settings: { kind: "tags", options: teamNames.map((name, i) => ({ name, color: TEAM_TAG_COLORS[i % TEAM_TAG_COLORS.length]! })) } },
    { name: "Status", type: "STATUS" },
    { name: "Priority", type: "PRIORITY" },
    { name: "Due Date", type: "DATE" },
    { name: "Reference", type: "LINK" },
    { name: "Allocated to", type: "TEXT" },
  ];
}

const TEAM_TAG_COLORS = ["blue", "orange", "violet", "green", "sky", "amber", "teal", "pink", "rose", "cyan"] as const;

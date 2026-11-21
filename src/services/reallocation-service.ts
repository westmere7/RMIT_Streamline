import type { Board, BoardColumn, BoardGroup, ColumnValue, EntityId, Item } from "@/domain";
import { intakeGroupOf } from "@/domain";
import { NotFoundError, type Repositories } from "@/data/repositories";
import type { ItemAssetService } from "./item-asset-service";
import type { ItemLinkService } from "./item-link-service";
import { planMove, type MoveLoss } from "./item-move-service";
import type { NotificationService } from "./notification-service";

/** Longest name a new Task Allocation group takes, as everywhere else. */
const MAX_GROUP_NAME = 60;

/** Columns whose values are the team's, cleared on the way back: the people in charge, and the status (it starts again). */
const RESET_TYPES: ReadonlySet<BoardColumn["type"]> = new Set(["PERSON", "PEOPLE", "STATUS"]);

/** What re-allocating a task would remove and keep, shown before anything happens. */
export interface ReallocationPreview {
  board: Pick<Board, "id" | "name">;
  /** Task Allocation's groups it can go to: every one but Booked by Form. */
  groups: BoardGroup[];
  /** When it was booked (or made), which stays. */
  bookedAt: string;
  /** Values that come back with it, by column name on Task Allocation. */
  kept: string[];
  /** Values with no column on Task Allocation, or no matching label there: they go. */
  lost: MoveLoss[];
  updates: number;
  activity: number;
  subitems: number;
  links: number;
  followers: number;
  /** The tracker sheet holding its assets, unlinked on the way (its assets stay on the task). */
  sheet: string | null;
  /** Deliverables that have someone in charge or a done mark, cleared. */
  assetsReset: number;
}

export interface ReallocationTransport {
  reallocate(input: { itemId: EntityId; groupId?: EntityId; newGroupName?: string }): Promise<{ item: Item; board: Board }>;
}

/**
 * Sends a task back to Task Allocation to be allocated again, as if it had
 * just been booked: into a group the reader picks (never Booked by Form, which
 * is the form's), with the team's part taken off.
 *
 * Kept: the task, its name, description, ticket, booking time, the booking's
 * first entry in the log, and its deliverables (the work that was asked for).
 * Taken off: the people in charge and the status, every update, the rest of
 * the log (so its journey starts again at the booking), subitems, links to
 * other tasks (the linked task keeps its own thread and values), follows, and
 * the deliverables' people and done marks; a tracker sheet holding its assets
 * is unlinked, its assets kept on the task.
 *
 * On Supabase the work runs on the server (src/server/reallocation.ts): a
 * member cannot delete activity or other people's updates, and the route
 * checks the caller can edit both boards first.
 */
export class ReallocationService {
  constructor(
    private readonly repos: Repositories,
    private readonly assets: ItemAssetService,
    private readonly links: ItemLinkService,
    private readonly notifications: NotificationService,
    private readonly transport: ReallocationTransport | null = null,
  ) {}

  async preview(itemId: EntityId): Promise<ReallocationPreview> {
    const { item, board, queue, groups, plan, subitems, resetSources, resetNames } = await this.prepare(itemId);
    const [comments, activity, links, follows, sheet, assets] = await Promise.all([
      this.repos.comments.listByItem(item.id),
      this.repos.activities.listByItem(item.id),
      this.repos.links.listByItems([item.id, ...subitems.map((s) => s.id)]),
      this.repos.subscriptions.listByBoards([board.id]),
      this.repos.trackers.getSheetByItem(item.id),
      this.repos.itemAssets.listByItem(item.id),
    ]);
    return {
      board: { id: queue.id, name: queue.name },
      groups,
      bookedAt: this.firstEntry(activity)?.createdAt ?? item.createdAt,
      kept: plan.kept.filter((k) => !resetNames.has(k.to)).map((k) => k.to),
      // The people and status are cleared on purpose, not lost.
      lost: plan.lost.filter((l) => !resetSources.has(l.columnId)),
      updates: comments.length,
      activity: activity.filter((a) => a.id !== this.firstEntry(activity)?.id).length,
      subitems: subitems.length,
      links: links.length,
      followers: follows.filter((f) => f.itemId === item.id).length,
      sheet: sheet?.name ?? null,
      assetsReset: assets.filter((a) => a.assigneeIds.length > 0 || a.completedAt).length,
    };
  }

  async reallocate(itemId: EntityId, actorId: EntityId, options: { groupId?: EntityId; newGroupName?: string }): Promise<{ item: Item; board: Board }> {
    if (this.transport) return this.transport.reallocate({ itemId, ...options });
    const { item, board, queue, groups, plan, subitems } = await this.prepare(itemId);

    // Where it lands: a group of Task Allocation's other than Booked by Form, or a new one.
    let group = options.groupId ? groups.find((g) => g.id === options.groupId) : undefined;
    if (options.groupId && !group) throw new Error("Pick a group on Task Allocation other than Booked by Form.");
    if (!group) {
      const name = options.newGroupName?.trim().slice(0, MAX_GROUP_NAME);
      if (!name) throw new Error("Pick a group, or name a new one.");
      const all = await this.repos.boards.listGroups(queue.id);
      group = await this.repos.boards.createGroup({ boardId: queue.id, name, color: "gray", position: all.length ? Math.max(...all.map((g) => g.position)) + 1 : 0, collapsed: false, role: null });
    }

    // Links first, while both ends are where the partner's log expects them: the
    // linked task keeps its values and its own copy of any shared update.
    for (const link of await this.repos.links.listByItems([item.id, ...subitems.map((s) => s.id)])) await this.links.unlink(link.id, actorId);

    const queueItems = await this.repos.items.listByBoard(queue.id);
    const position = queueItems.filter((i) => i.groupId === group.id && i.parentItemId === null).length;
    if (subitems.length) await this.repos.items.deleteMany(subitems.map((s) => s.id));
    const moved = await this.repos.items.moveToBoard(item.id, { boardId: queue.id, groupId: group.id, position });

    // Values: what Task Allocation has a column for comes back, except the team's
    // people and status; the status starts again at the column's default.
    const queueColumns = await this.repos.boards.listColumns(queue.id);
    const typeOf = new Map(queueColumns.map((c) => [c.id, c.type] as const));
    const carried = plan.carried.filter((c) => c.itemId === item.id && !RESET_TYPES.has(typeOf.get(c.columnId)!));
    const defaults: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> = queueColumns
      .filter((c) => c.settings.kind === "status" && c.settings.defaultLabelId)
      .map((c) => ({ itemId: item.id, columnId: c.id, value: { type: "STATUS", labelId: (c.settings as { defaultLabelId: string }).defaultLabelId } }));
    if (carried.length || defaults.length) await this.repos.items.setValues([...carried, ...defaults]);
    if (plan.briefToDescription) await this.repos.items.update(item.id, { description: item.description?.trim() ? `${plan.briefToDescription}\n\n${item.description.trim()}` : plan.briefToDescription });

    // A tracker sheet is the team's: let go of it, its assets kept on the task as its own.
    const sheet = await this.repos.trackers.getSheetByItem(item.id);
    if (sheet) {
      await this.repos.itemAssets.detachFromSheet(sheet.id);
      await this.repos.trackers.updateSheet(sheet.id, { itemId: null });
    }
    // The deliverables stay (they are what was asked for), without anyone in charge or anything ticked.
    for (const asset of await this.repos.itemAssets.listByItem(item.id)) {
      if (asset.assigneeIds.length > 0 || asset.completedAt) await this.repos.itemAssets.update(asset.id, { assigneeIds: [], completedAt: null });
    }
    await this.assets.recompute(item.id, queue.id);

    // Updates, follows and the log, so the journey opens on the booking again.
    for (const comment of await this.repos.comments.listByItem(item.id)) await this.repos.comments.delete(comment.id);
    for (const follow of (await this.repos.subscriptions.listByBoards([board.id, queue.id])).filter((f) => f.itemId === item.id)) await this.repos.subscriptions.delete(follow.id);
    const log = await this.repos.activities.listByItem(item.id);
    const first = this.firstEntry(log);
    await this.repos.activities.deleteMany(log.filter((a) => a.id !== first?.id).map((a) => a.id));

    await this.tellAllocators(queue, moved, actorId);
    return { item: moved, board: queue };
  }

  private async prepare(itemId: EntityId) {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    if (item.parentItemId) throw new Error("A subitem goes with its task. Re-allocate the task instead.");
    // Only what came in through the form goes back: a team's own task was never Task Allocation's.
    if (!item.bookedVia) throw new Error("Only tasks that came in through the booking form can be re-allocated.");
    const board = await this.repos.boards.getById(item.boardId);
    if (!board) throw new NotFoundError("Board", item.boardId);
    if (board.system) throw new Error("This task is not on a team's board.");
    const queue = (await this.repos.boards.listByWorkspace(board.workspaceId)).find((b) => b.system === "TASK_ALLOCATION" && !b.archivedAt);
    if (!queue) throw new Error("This workspace has no Task Allocation board.");
    const [allGroups, sourceColumns, queueColumns, sourceItems] = await Promise.all([
      this.repos.boards.listGroups(queue.id),
      this.repos.boards.listColumns(board.id),
      this.repos.boards.listColumns(queue.id),
      this.repos.items.listByBoard(board.id, { includeArchived: true }),
    ]);
    const intake = intakeGroupOf(allGroups);
    const groups = allGroups.filter((g) => g.id !== intake?.id).sort((a, b) => a.position - b.position);
    const subitems = sourceItems.filter((i) => i.parentItemId === item.id);
    const values = await this.repos.items.listValuesByItem(item.id);
    // Only the task's own values: its subitems are removed, not carried.
    const plan = planMove({ items: [item], values, sourceColumns, targetColumns: queueColumns });
    const resetSources = new Set(sourceColumns.filter((c) => RESET_TYPES.has(c.type)).map((c) => c.id));
    const resetNames = new Set(queueColumns.filter((c) => RESET_TYPES.has(c.type)).map((c) => c.name));
    return { item, board, queue, groups, plan, subitems, resetSources, resetNames };
  }

  /** The booking (or creation) entry the journey starts from: kept when the rest goes. */
  private firstEntry<T extends { id: string; eventType: string; createdAt: string }>(log: readonly T[]): T | undefined {
    return [...log].filter((a) => a.eventType === "ITEM_CREATED").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  }

  private async tellAllocators(queue: Board, item: Item, actorId: EntityId): Promise<void> {
    const [members, actor] = await Promise.all([this.repos.workspaces.listMembers(queue.workspaceId), this.repos.users.getById(actorId)]);
    const admins = members.filter((m) => m.status === "ACTIVE" && (m.role === "OWNER" || m.role === "ADMIN") && m.userId !== actorId);
    if (!admins.length) return;
    await this.notifications.deliver(
      admins.map((m) => ({
        userId: m.userId,
        type: "TASK_BOOKED" as const,
        title: `${actor?.displayName ?? "Someone"} re-allocated “${item.name}”`,
        body: `It is back on ${queue.name} to be allocated again.`,
        entityType: "ITEM" as const,
        entityId: item.id,
        boardId: queue.id,
        actorId,
      })),
    );
  }
}

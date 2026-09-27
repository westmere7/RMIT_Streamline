import type { Board, BoardColumn, BoardGroup, ColumnLabel, EntityId, ISODate, Item, ItemAsset, ItemColumnValue } from "@/domain";
import { columnLabels, resolveColumnRoles } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { bucketDate, type DateBucket } from "@/lib/dates/dates";

export interface MyWorkItem {
  item: Item;
  board: Board;
  group: BoardGroup | null;
  status: ColumnLabel | null;
  isDone: boolean;
  priority: ColumnLabel | null;
  dueDate: ISODate | null;
  /** Column used for the due date, for editing from My Work. */
  dueColumn: BoardColumn | null;
  statusColumn: BoardColumn | null;
  /** Other boards where this task appears as a linked (synced) item. */
  linkedBoards: Board[];
  /** Everyone on the item's person columns, the reader included: who is in charge and who shares it. */
  people: EntityId[];
}

/** One asset line the reader is in charge of, with the task it belongs to. */
export interface MyWorkAsset {
  asset: ItemAsset;
  item: Item;
  board: Board;
  group: BoardGroup | null;
  isDone: boolean;
  dueDate: ISODate | null;
}

export type MyWorkSection = DateBucket | "completed";

export const MY_WORK_SECTIONS: MyWorkSection[] = ["overdue", "today", "thisWeek", "later", "noDate", "completed"];

export const MY_WORK_SECTION_LABELS: Record<MyWorkSection, string> = {
  overdue: "Overdue",
  today: "Today",
  thisWeek: "This Week",
  later: "Later",
  noDate: "No Date",
  completed: "Completed",
};

export function sectionFor(entry: Pick<MyWorkItem, "isDone" | "dueDate">, now: Date): MyWorkSection {
  if (entry.isDone) return "completed";
  return bucketDate(entry.dueDate, now);
}

/** Soonest due first, undated last, then by name. */
function sortByDue(entries: MyWorkItem[]): MyWorkItem[] {
  return entries.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.item.name.localeCompare(b.item.name);
  });
}

export class MyWorkService {
  constructor(private readonly repos: Repositories) {}

  /** All non-archived items across the workspace where a PERSON column includes the user. */
  async listAssigned(workspaceId: EntityId, userId: EntityId): Promise<MyWorkItem[]> {
    const boards = (await this.repos.boards.listByWorkspace(workspaceId)).filter((b) => b.archivedAt === null);
    const results = (
      await Promise.all(
        boards.map((board) =>
          this.entriesOn(board, (_item, itemValues, personColumnIds) => itemValues.some((v) => personColumnIds.has(v.columnId) && v.value.type === "PERSON" && v.value.userIds.includes(userId))),
        ),
      )
    ).flat();
    return this.collapseLinked(sortByDue(results));
  }

  /**
   * The tasks the user starred in this workspace, read like their own work:
   * each board's status, priority, people and due date through its column
   * roles, so boards laid out differently still make one list. Only boards
   * holding a star are read. Archived tasks are left out.
   */
  async listStarred(workspaceId: EntityId, userId: EntityId): Promise<MyWorkItem[]> {
    const favourites = await this.repos.itemFavourites.listByUser(userId);
    if (favourites.length === 0) return [];
    const starred = new Set(favourites.map((f) => f.itemId));
    const boardIds = new Set(favourites.map((f) => f.boardId));
    const boards = (await this.repos.boards.listByWorkspace(workspaceId)).filter((b) => b.archivedAt === null && boardIds.has(b.id));
    const results = (await Promise.all(boards.map((board) => this.entriesOn(board, (item) => starred.has(item.id))))).flat();
    return sortByDue(results);
  }

  /** Stars a task for this person. */
  async star(userId: EntityId, item: Pick<Item, "id" | "boardId">): Promise<void> {
    await this.repos.itemFavourites.add({ userId, itemId: item.id, boardId: item.boardId });
  }

  /** Unstars these tasks for this person: one, or every done one at once. */
  async unstar(userId: EntityId, itemIds: EntityId[]): Promise<void> {
    await this.repos.itemFavourites.remove(userId, itemIds);
  }

  /** The tasks this person starred, anywhere, each with its board. */
  async starredIds(userId: EntityId): Promise<Map<EntityId, EntityId>> {
    return new Map((await this.repos.itemFavourites.listByUser(userId)).map((f) => [f.itemId, f.boardId]));
  }

  /** One board's tasks that `include` picks, as My Work rows. */
  private async entriesOn(board: Board, include: (item: Item, itemValues: ItemColumnValue[], personColumnIds: ReadonlySet<EntityId>) => boolean): Promise<MyWorkItem[]> {
    const [columns, groups, items, values] = await Promise.all([
      this.repos.boards.listColumns(board.id),
      this.repos.boards.listGroups(board.id),
      this.repos.items.listByBoard(board.id),
      this.repos.items.listValuesByBoard(board.id),
    ]);
    const roles = resolveColumnRoles(columns);
    const personColumnIds = new Set(columns.filter((c) => c.type === "PERSON").map((c) => c.id));
    const statusColumn = roles.status;
    const priorityColumn = roles.priority;
    const dueColumn = roles.dueDate?.type === "DATE" ? roles.dueDate : null;
    const timelineColumn = roles.timeline;
    const valuesByItem = new Map<EntityId, ItemColumnValue[]>();
    for (const v of values) valuesByItem.set(v.itemId, [...(valuesByItem.get(v.itemId) ?? []), v]);

    const results: MyWorkItem[] = [];
    for (const item of items) {
      if (item.archivedAt) continue;
      const itemValues = valuesByItem.get(item.id) ?? [];
      if (!include(item, itemValues, personColumnIds)) continue;
      const statusValue = statusColumn ? itemValues.find((v) => v.columnId === statusColumn.id)?.value : undefined;
      const statusLabelId = statusValue?.type === "STATUS" ? statusValue.labelId : null;
      const status = statusColumn ? (columnLabels(statusColumn).find((l) => l.id === statusLabelId) ?? null) : null;
      const isDone = statusColumn?.settings.kind === "status" && statusLabelId !== null ? statusColumn.settings.doneLabelIds.includes(statusLabelId) : false;
      const priorityValue = priorityColumn ? itemValues.find((v) => v.columnId === priorityColumn.id)?.value : undefined;
      const priority = priorityColumn && priorityValue?.type === "PRIORITY" ? (columnLabels(priorityColumn).find((l) => l.id === priorityValue.labelId) ?? null) : null;
      const people = [...new Set(itemValues.flatMap((v) => (personColumnIds.has(v.columnId) && v.value.type === "PERSON" ? v.value.userIds : [])))];
      const dueValue = dueColumn ? itemValues.find((v) => v.columnId === dueColumn.id)?.value : undefined;
      let dueDate = dueValue?.type === "DATE" ? dueValue.date : null;
      if (!dueDate && timelineColumn) {
        const tl = itemValues.find((v) => v.columnId === timelineColumn.id)?.value;
        if (tl?.type === "TIMELINE") dueDate = tl.end;
      }
      results.push({ item, board, group: groups.find((g) => g.id === item.groupId) ?? null, status, isDone, priority, dueDate, dueColumn, statusColumn, linkedBoards: [], people });
    }
    return results;
  }

  /**
   * Every asset line across the workspace the user is in charge of, on tasks
   * that are not archived, soonest due first.
   *
   * A line shared between linked tasks is stored on one of them and listed
   * once, against that one. Only boards with such a line read their items.
   */
  async listAssignedAssets(workspaceId: EntityId, userId: EntityId): Promise<MyWorkAsset[]> {
    const boards = (await this.repos.boards.listByWorkspace(workspaceId)).filter((b) => b.archivedAt === null);
    const results: MyWorkAsset[] = [];
    await Promise.all(
      boards.map(async (board) => {
        const lines = (await this.repos.itemAssets.listByBoard(board.id)).filter((line) => line.assigneeIds.includes(userId));
        if (lines.length === 0) return;
        const [items, groups] = await Promise.all([this.repos.items.listByBoard(board.id), this.repos.boards.listGroups(board.id)]);
        const byId = new Map(items.map((item) => [item.id, item]));
        for (const asset of lines) {
          const item = byId.get(asset.itemId);
          if (!item || item.archivedAt) continue;
          results.push({ asset, item, board, group: groups.find((g) => g.id === item.groupId) ?? null, isDone: asset.completedAt !== null, dueDate: asset.dueDate });
        }
      }),
    );
    results.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return !a.dueDate ? 1 : !b.dueDate ? -1 : a.dueDate.localeCompare(b.dueDate);
      return a.item.name.localeCompare(b.item.name) || a.asset.position - b.asset.position;
    });
    return results;
  }

  /**
   * Linked items are the same task mirrored on several boards. Showing each copy
   * would double up the list, so the first copy (earliest due) stands for the set
   * and remembers the other boards it lives on.
   */
  private async collapseLinked(entries: MyWorkItem[]): Promise<MyWorkItem[]> {
    const byId = new Map(entries.map((e) => [e.item.id, e]));
    const links = await this.repos.links.listByItems([...byId.keys()]);
    if (links.length === 0) return entries;

    const leader = new Map<EntityId, EntityId>();
    const find = (id: EntityId): EntityId => {
      const parent = leader.get(id);
      if (!parent || parent === id) return id;
      const root = find(parent);
      leader.set(id, root);
      return root;
    };
    for (const link of links) {
      if (!byId.has(link.itemAId) || !byId.has(link.itemBId)) continue;
      const a = find(link.itemAId);
      const b = find(link.itemBId);
      if (a !== b) leader.set(b, a);
    }

    const shown = new Map<EntityId, MyWorkItem>();
    for (const entry of entries) {
      const root = find(entry.item.id);
      const first = shown.get(root);
      if (!first) shown.set(root, entry);
      else if (!first.linkedBoards.some((b) => b.id === entry.board.id)) first.linkedBoards.push(entry.board);
    }
    return [...shown.values()];
  }
}

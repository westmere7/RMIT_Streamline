import type { Board, BoardColumn, BoardGroup, ColumnLabel, EntityId, ISODate, Item } from "@/domain";
import { columnLabels } from "@/domain";
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

export function sectionFor(entry: MyWorkItem, now: Date): MyWorkSection {
  if (entry.isDone) return "completed";
  return bucketDate(entry.dueDate, now);
}

export class MyWorkService {
  constructor(private readonly repos: Repositories) {}

  /** All non-archived items across the workspace where a PERSON column includes the user. */
  async listAssigned(workspaceId: EntityId, userId: EntityId): Promise<MyWorkItem[]> {
    const boards = (await this.repos.boards.listByWorkspace(workspaceId)).filter((b) => b.archivedAt === null);
    const results: MyWorkItem[] = [];

    await Promise.all(
      boards.map(async (board) => {
        const [columns, groups, items, values] = await Promise.all([
          this.repos.boards.listColumns(board.id),
          this.repos.boards.listGroups(board.id),
          this.repos.items.listByBoard(board.id),
          this.repos.items.listValuesByBoard(board.id),
        ]);
        const personColumnIds = new Set(columns.filter((c) => c.type === "PERSON").map((c) => c.id));
        const statusColumn = columns.find((c) => c.type === "STATUS") ?? null;
        const priorityColumn = columns.find((c) => c.type === "PRIORITY") ?? null;
        const dueColumn = columns.find((c) => c.type === "DATE") ?? null;
        const timelineColumn = columns.find((c) => c.type === "TIMELINE") ?? null;

        const assignedItemIds = new Set<EntityId>();
        for (const v of values) {
          if (personColumnIds.has(v.columnId) && v.value.type === "PERSON" && v.value.userIds.includes(userId)) {
            assignedItemIds.add(v.itemId);
          }
        }
        for (const item of items) {
          if (!assignedItemIds.has(item.id)) continue;
          const itemValues = values.filter((v) => v.itemId === item.id);
          const statusValue = statusColumn ? itemValues.find((v) => v.columnId === statusColumn.id)?.value : undefined;
          const statusLabelId = statusValue?.type === "STATUS" ? statusValue.labelId : null;
          const status = statusColumn ? (columnLabels(statusColumn).find((l) => l.id === statusLabelId) ?? null) : null;
          const isDone =
            statusColumn?.settings.kind === "status" && statusLabelId !== null
              ? statusColumn.settings.doneLabelIds.includes(statusLabelId)
              : false;
          const priorityValue = priorityColumn ? itemValues.find((v) => v.columnId === priorityColumn.id)?.value : undefined;
          const priority =
            priorityColumn && priorityValue?.type === "PRIORITY"
              ? (columnLabels(priorityColumn).find((l) => l.id === priorityValue.labelId) ?? null)
              : null;
          const dueValue = dueColumn ? itemValues.find((v) => v.columnId === dueColumn.id)?.value : undefined;
          let dueDate = dueValue?.type === "DATE" ? dueValue.date : null;
          if (!dueDate && timelineColumn) {
            const tl = itemValues.find((v) => v.columnId === timelineColumn.id)?.value;
            if (tl?.type === "TIMELINE") dueDate = tl.end;
          }
          results.push({
            item,
            board,
            group: groups.find((g) => g.id === item.groupId) ?? null,
            status,
            isDone,
            priority,
            dueDate,
            dueColumn,
            statusColumn,
          });
        }
      }),
    );

    return results.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.item.name.localeCompare(b.item.name);
    });
  }
}

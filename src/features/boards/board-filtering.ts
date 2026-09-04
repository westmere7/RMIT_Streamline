import type { BoardColumn, ColumnValue, Item } from "@/domain";
import { columnLabels } from "@/domain";
import { bucketDate } from "@/lib/dates/dates";
import type { BoardFilters, BoardSort } from "@/stores/board-ui-store";

export type ValueLookup = (itemId: string, columnId: string) => ColumnValue | undefined;

export interface FilterContext {
  columns: BoardColumn[];
  getValue: ValueLookup;
  now: Date;
}

function personColumnIds(columns: BoardColumn[]): string[] {
  return columns.filter((c) => c.type === "PERSON").map((c) => c.id);
}

/** Primary due date for an item: the first DATE column, else the end of the first TIMELINE. */
export function primaryDueDate(itemId: string, columns: BoardColumn[], getValue: ValueLookup): string | null {
  const dateColumn = columns.find((c) => c.type === "DATE");
  if (dateColumn) {
    const v = getValue(itemId, dateColumn.id);
    if (v?.type === "DATE" && v.date) return v.date;
  }
  const timeline = columns.find((c) => c.type === "TIMELINE");
  if (timeline) {
    const v = getValue(itemId, timeline.id);
    if (v?.type === "TIMELINE" && v.end) return v.end;
  }
  return null;
}

export function matchesSearch(item: Item, search: string): boolean {
  const q = search.trim().toLowerCase();
  return !q || item.name.toLowerCase().includes(q);
}

export function matchesFilters(item: Item, filters: BoardFilters, ctx: FilterContext): boolean {
  if (filters.groupIds.length && !filters.groupIds.includes(item.groupId)) return false;

  if (filters.personIds.length) {
    const assigned = new Set<string>();
    for (const columnId of personColumnIds(ctx.columns)) {
      const v = ctx.getValue(item.id, columnId);
      if (v?.type === "PERSON") v.userIds.forEach((id) => assigned.add(id));
    }
    if (!filters.personIds.some((id) => assigned.has(id))) return false;
  }

  if (filters.statusIds.length) {
    const statusColumn = ctx.columns.find((c) => c.type === "STATUS");
    const v = statusColumn ? ctx.getValue(item.id, statusColumn.id) : undefined;
    const labelId = v?.type === "STATUS" ? v.labelId : null;
    if (!labelId || !filters.statusIds.includes(labelId)) return false;
  }

  if (filters.priorityIds.length) {
    const priorityColumn = ctx.columns.find((c) => c.type === "PRIORITY");
    const v = priorityColumn ? ctx.getValue(item.id, priorityColumn.id) : undefined;
    const labelId = v?.type === "PRIORITY" ? v.labelId : null;
    if (!labelId || !filters.priorityIds.includes(labelId)) return false;
  }

  if (filters.date) {
    const due = primaryDueDate(item.id, ctx.columns, ctx.getValue);
    const bucket = bucketDate(due, ctx.now);
    if (filters.date === "thisWeek") {
      if (bucket !== "today" && bucket !== "thisWeek") return false;
    } else if (bucket !== filters.date) return false;
  }

  return true;
}

/** Applies search + filters to top-level items. Subitems follow their parent. */
export function filterItems(items: Item[], search: string, filters: BoardFilters, ctx: FilterContext): Item[] {
  return items.filter((item) => matchesSearch(item, search) && matchesFilters(item, filters, ctx));
}

function labelRank(column: BoardColumn | undefined, value: ColumnValue | undefined): number {
  if (!column || !value || (value.type !== "STATUS" && value.type !== "PRIORITY")) return Number.MAX_SAFE_INTEGER;
  const index = columnLabels(column).findIndex((l) => l.id === value.labelId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function compareItems(a: Item, b: Item, sort: BoardSort, ctx: Pick<FilterContext, "columns" | "getValue">): number {
  const dir = sort.direction === "asc" ? 1 : -1;
  switch (sort.field) {
    case "name":
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt) * dir;
    case "dueDate": {
      const da = primaryDueDate(a.id, ctx.columns, ctx.getValue);
      const db = primaryDueDate(b.id, ctx.columns, ctx.getValue);
      if (da === db) return 0;
      if (da === null) return 1; // empty dates always last
      if (db === null) return -1;
      return da.localeCompare(db) * dir;
    }
    case "priority": {
      const column = ctx.columns.find((c) => c.type === "PRIORITY");
      const ra = labelRank(column, column ? ctx.getValue(a.id, column.id) : undefined);
      const rb = labelRank(column, column ? ctx.getValue(b.id, column.id) : undefined);
      return (ra - rb) * dir;
    }
    case "status": {
      const column = ctx.columns.find((c) => c.type === "STATUS");
      const ra = labelRank(column, column ? ctx.getValue(a.id, column.id) : undefined);
      const rb = labelRank(column, column ? ctx.getValue(b.id, column.id) : undefined);
      return (ra - rb) * dir;
    }
  }
}

export function sortItems(items: Item[], sort: BoardSort | null, ctx: Pick<FilterContext, "columns" | "getValue">): Item[] {
  if (!sort) return [...items].sort((a, b) => a.position - b.position);
  return [...items].sort((a, b) => compareItems(a, b, sort, ctx) || a.position - b.position);
}

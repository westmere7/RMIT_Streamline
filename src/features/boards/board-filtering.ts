import type { BoardColumn, ColumnValue, Item } from "@/domain";
import { columnLabels, T_SHIRT_SIZES } from "@/domain";
import { bucketDate } from "@/lib/dates/dates";
import { richTextToPlain } from "@/lib/rich-text";
import { sortFieldColumnId, type BoardFilters, type BoardSort } from "@/stores/board-ui-store";

export type ValueLookup = (itemId: string, columnId: string) => ColumnValue | undefined;

export interface FilterContext {
  columns: BoardColumn[];
  getValue: ValueLookup;
  now: Date;
  /** Display name for a user id, so PERSON columns sort by name rather than id. */
  userName?: (userId: string) => string | undefined;
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

/**
 * The board's search box: the name, and the booking code.
 *
 * The code is what people have to hand — it is what an email or a corridor
 * conversation quotes — so typing "TA-4F2K" has to find the task. A hyphen is
 * dropped from both sides, because nobody remembers whether the code has one.
 */
export function matchesSearch(item: Item, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (item.name.toLowerCase().includes(q)) return true;
  const reference = item.reference?.toLowerCase();
  if (!reference) return false;
  const loose = (value: string) => value.replace(/[\s-]/g, "");
  return reference.includes(q) || loose(reference).includes(loose(q));
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

  if (filters.tags.length) {
    const wanted = new Set(filters.tags.map((tag) => tag.toLowerCase()));
    let found = false;
    for (const column of ctx.columns) {
      if (column.type !== "TAGS") continue;
      const v = ctx.getValue(item.id, column.id);
      if (v?.type === "TAGS" && v.tags.some((tag) => wanted.has(tag.toLowerCase()))) {
        found = true;
        break;
      }
    }
    if (!found) return false;
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

/**
 * What a cell sorts by: a string, a number, or null for "empty". Empty cells
 * always sort last, whichever direction is chosen.
 */
function cellSortKey(column: BoardColumn, value: ColumnValue | undefined, ctx: Pick<FilterContext, "userName">): string | number | null {
  if (!value) return null;
  switch (value.type) {
    case "TEXT":
    case "LONG_TEXT":
      return value.text.trim() || null;
    case "RICH_TEXT":
      // Sorted by what it reads as, not by the markup it is stored in.
      return richTextToPlain(value.text) || null;
    case "STATUS":
    case "DROPDOWN":
    case "PRIORITY": {
      // By the order the board put the labels in, not alphabetically: a list of
      // stages sorts as stages.
      const rank = labelRank(column, value);
      return rank === Number.MAX_SAFE_INTEGER ? null : rank;
    }
    case "PERSON": {
      const names = value.userIds.map((id) => ctx.userName?.(id) ?? "").filter(Boolean).sort((x, y) => x.localeCompare(y));
      return names.length ? names.join(", ") : null;
    }
    case "DATE":
      return value.date;
    case "TIMELINE":
      return value.start ?? value.end;
    case "NUMBER":
      return value.number;
    case "CHECKBOX":
      // Ticked first when ascending.
      return value.checked ? 0 : 1;
    case "LINK":
      return value.text?.trim() || value.url.trim() || null;
    case "TAGS":
      return value.tags.length ? [...value.tags].sort((x, y) => x.localeCompare(y)).join(", ") : null;
    case "STAKEHOLDER":
      return value.group;
    case "SIZE":
      return value.size ? T_SHIRT_SIZES.indexOf(value.size) : null;
    case "ASSETS_RECAP":
      // Sorted by how much is being produced.
      return value.lines ? value.quantity : null;
    case "DEPENDENCY":
      return value.itemIds.length || null;
  }
}

function compareKeys(ka: string | number | null, kb: string | number | null, dir: number): number {
  if (ka === kb) return 0;
  if (ka === null) return 1;
  if (kb === null) return -1;
  if (typeof ka === "number" && typeof kb === "number") return (ka - kb) * dir;
  return String(ka).localeCompare(String(kb), undefined, { sensitivity: "base", numeric: true }) * dir;
}

export function compareItems(a: Item, b: Item, sort: BoardSort, ctx: Pick<FilterContext, "columns" | "getValue" | "userName">): number {
  const dir = sort.direction === "asc" ? 1 : -1;
  const columnId = sortFieldColumnId(sort.field);
  if (columnId !== null) {
    const column = ctx.columns.find((c) => c.id === columnId);
    if (!column) return 0;
    return compareKeys(cellSortKey(column, ctx.getValue(a.id, column.id), ctx), cellSortKey(column, ctx.getValue(b.id, column.id), ctx), dir);
  }
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
    default:
      return 0;
  }
}

export function sortItems(items: Item[], sort: BoardSort | null, ctx: Pick<FilterContext, "columns" | "getValue" | "userName">): Item[] {
  if (!sort) return [...items].sort((a, b) => a.position - b.position);
  return [...items].sort((a, b) => compareItems(a, b, sort, ctx) || a.position - b.position);
}

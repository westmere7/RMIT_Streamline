import type { BoardColumn, BoardGroup, ColumnValue, Item } from "@/domain";
import type { BoardSnapshot } from "@/services";
import type { BoardFilters, BoardSort } from "@/stores/board-ui-store";
import { filterItems, primaryDueDate, sortItems, type ValueLookup } from "./board-filtering";

export interface BoardModel {
  snapshot: BoardSnapshot;
  groups: BoardGroup[];
  columns: BoardColumn[];
  visibleColumns: BoardColumn[];
  statusColumn: BoardColumn | null;
  priorityColumn: BoardColumn | null;
  dateColumn: BoardColumn | null;
  timelineColumn: BoardColumn | null;
  personColumns: BoardColumn[];
  dependencyColumn: BoardColumn | null;
  itemById: Map<string, Item>;
  /** Top-level items per group after search, filters and sort. */
  itemsByGroup: Map<string, Item[]>;
  /** Subitems per parent id (position order). */
  subitemsByParent: Map<string, Item[]>;
  getValue: ValueLookup;
  isDone: (itemId: string) => boolean;
  /** True when the item depends on at least one item that is not done. */
  isBlocked: (itemId: string) => boolean;
  dueDateOf: (itemId: string) => string | null;
  totalTopLevel: number;
  visibleTopLevel: number;
  isFiltered: boolean;
}

export interface BoardModelOptions {
  search: string;
  filters: BoardFilters;
  sort: BoardSort | null;
  now: Date;
}

export function buildValueLookup(snapshot: Pick<BoardSnapshot, "values">): {
  getValue: ValueLookup;
  valuesByItem: Map<string, Map<string, ColumnValue>>;
} {
  const valuesByItem = new Map<string, Map<string, ColumnValue>>();
  for (const v of snapshot.values) {
    let bucket = valuesByItem.get(v.itemId);
    if (!bucket) {
      bucket = new Map();
      valuesByItem.set(v.itemId, bucket);
    }
    bucket.set(v.columnId, v.value);
  }
  return { valuesByItem, getValue: (itemId, columnId) => valuesByItem.get(itemId)?.get(columnId) };
}

export function buildBoardModel(snapshot: BoardSnapshot, options: BoardModelOptions): BoardModel {
  const { getValue } = buildValueLookup(snapshot);
  const columns = [...snapshot.columns].sort((a, b) => a.position - b.position);
  const groups = [...snapshot.groups].sort((a, b) => a.position - b.position);
  const statusColumn = columns.find((c) => c.type === "STATUS") ?? null;

  const itemById = new Map(snapshot.items.map((i) => [i.id, i]));
  const topLevel = snapshot.items.filter((i) => i.parentItemId === null);
  const subitemsByParent = new Map<string, Item[]>();
  for (const item of snapshot.items) {
    if (!item.parentItemId) continue;
    const list = subitemsByParent.get(item.parentItemId) ?? [];
    list.push(item);
    subitemsByParent.set(item.parentItemId, list);
  }
  for (const list of subitemsByParent.values()) list.sort((a, b) => a.position - b.position);

  const isDone = (itemId: string): boolean => {
    if (!statusColumn || statusColumn.settings.kind !== "status") return false;
    const v = getValue(itemId, statusColumn.id);
    return v?.type === "STATUS" && v.labelId !== null && statusColumn.settings.doneLabelIds.includes(v.labelId);
  };

  const ctx = { columns, getValue, now: options.now };
  const filtered = filterItems(topLevel, options.search, options.filters, ctx);
  const sorted = sortItems(filtered, options.sort, ctx);
  const itemsByGroup = new Map<string, Item[]>();
  for (const group of groups) itemsByGroup.set(group.id, []);
  for (const item of sorted) {
    const list = itemsByGroup.get(item.groupId);
    if (list) list.push(item);
  }

  const dependencyColumn = columns.find((c) => c.type === "DEPENDENCY") ?? null;
  const isBlocked = (itemId: string): boolean => {
    if (!dependencyColumn) return false;
    const v = getValue(itemId, dependencyColumn.id);
    if (v?.type !== "DEPENDENCY") return false;
    return v.itemIds.some((id) => itemById.has(id) && !isDone(id));
  };

  return {
    snapshot,
    groups,
    columns,
    visibleColumns: columns.filter((c) => !c.hidden),
    statusColumn,
    priorityColumn: columns.find((c) => c.type === "PRIORITY") ?? null,
    dateColumn: columns.find((c) => c.type === "DATE") ?? null,
    timelineColumn: columns.find((c) => c.type === "TIMELINE") ?? null,
    personColumns: columns.filter((c) => c.type === "PERSON"),
    dependencyColumn,
    itemById,
    itemsByGroup,
    subitemsByParent,
    getValue,
    isDone,
    isBlocked,
    dueDateOf: (itemId) => primaryDueDate(itemId, columns, getValue),
    totalTopLevel: topLevel.length,
    visibleTopLevel: sorted.length,
    isFiltered: sorted.length !== topLevel.length,
  };
}

/** Fixed widths for the leading (sticky) part of every table row. */
export const TABLE_LAYOUT = {
  selectWidth: 36,
  handleWidth: 24,
  nameWidth: 320,
  trailingWidth: 48,
  rowHeight: 36,
} as const;

export function leadingWidth(): number {
  return TABLE_LAYOUT.selectWidth + TABLE_LAYOUT.handleWidth + TABLE_LAYOUT.nameWidth;
}

export function tableWidth(columns: BoardColumn[]): number {
  return leadingWidth() + columns.reduce((sum, c) => sum + c.width, 0) + TABLE_LAYOUT.trailingWidth;
}

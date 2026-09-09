import type { CSSProperties } from "react";
import type { BoardColumn, BoardGroup, ColumnType, ColumnValue, Item, ItemLink } from "@/domain";
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
  /** `groups`, minus the ones a search or filter has emptied. */
  visibleGroups: BoardGroup[];
  /** Subitems per parent id (position order). */
  subitemsByParent: Map<string, Item[]>;
  /** Task links per item id (either side of the link). */
  linksByItem: Map<string, ItemLink[]>;
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
  /** Display name for a user id; lets PERSON columns sort by name. */
  userName?: (userId: string) => string | undefined;
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
  const linksByItem = new Map<string, ItemLink[]>();
  for (const link of snapshot.links ?? []) {
    for (const id of [link.itemAId, link.itemBId]) {
      if (!itemById.has(id)) continue;
      const list = linksByItem.get(id) ?? [];
      list.push(link);
      linksByItem.set(id, list);
    }
  }

  const isDone = (itemId: string): boolean => {
    if (!statusColumn || statusColumn.settings.kind !== "status") return false;
    const v = getValue(itemId, statusColumn.id);
    return v?.type === "STATUS" && v.labelId !== null && statusColumn.settings.doneLabelIds.includes(v.labelId);
  };

  const ctx = { columns, getValue, now: options.now, userName: options.userName };
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

  const isFiltered = sorted.length !== topLevel.length;
  return {
    snapshot,
    groups,
    // While a search or a filter is on, a group with nothing left in it is a
    // heading over an empty space — three of them turn one result into a page
    // of scrolling. Unfiltered they all stay: an empty group is somewhere to
    // put the next item.
    visibleGroups: isFiltered ? groups.filter((group) => (itemsByGroup.get(group.id) ?? []).length > 0) : groups,
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
    linksByItem,
    getValue,
    isDone,
    isBlocked,
    dueDateOf: (itemId) => primaryDueDate(itemId, columns, getValue),
    totalTopLevel: topLevel.length,
    visibleTopLevel: sorted.length,
    isFiltered,
  };
}

/** Fixed widths for the leading (sticky) part of every table row. */
export const TABLE_LAYOUT = {
  selectWidth: 36,
  /** No separate drag handle: rows are dragged by their name cell. */
  handleWidth: 0,
  /** The ID# column: wide enough for a seven-character code and not a pixel more. */
  referenceWidth: 78,
  nameWidth: 320,
  trailingWidth: 48,
  rowHeight: 40,
} as const;

/**
 * Anything whose value is short — a chip, a date, an icon, a number, a link, a
 * word or two of text — reads better centred under its header. Only the two that
 * are long by nature stay against the left edge: a long text column, and a
 * dependency column that lists item names. The assets recap is a badge of two
 * short figures, so it centres with the rest.
 */
const LEFT_ALIGNED_COLUMNS = new Set<ColumnType>(["LONG_TEXT", "DEPENDENCY"]);

export function columnAlign(type: ColumnType): "left" | "center" {
  return LEFT_ALIGNED_COLUMNS.has(type) ? "left" : "center";
}

/**
 * The frozen head of a row: the tick box, the ID# code when it is shown, and the
 * item name. Its width is fixed so the header, the rows, the group bars and the
 * add-item row all end at the same place.
 */
export function leadingWidth(showReference = true): number {
  return TABLE_LAYOUT.selectWidth + TABLE_LAYOUT.handleWidth + (showReference ? TABLE_LAYOUT.referenceWidth : 0) + TABLE_LAYOUT.nameWidth;
}

export function tableWidth(columns: BoardColumn[], showReference = true): number {
  return leadingWidth(showReference) + columns.reduce((sum, c) => sum + c.width, 0) + TABLE_LAYOUT.trailingWidth;
}

/**
 * A board with few columns leaves the right half of a wide screen blank. Rows share that surplus
 * out with flexbox instead: the item name takes the biggest share because names truncate first,
 * and the caps stop a three-column board from stretching a status pill across the screen.
 */
export const TABLE_STRETCH = { nameGrow: 3, nameMaxWidth: 720, columnGrow: 1, columnMaxScale: 1.7 } as const;

/** Style for the sticky leading (item name) cell of a table row. */
export function leadingCellStyle(showReference = true): CSSProperties {
  const width = leadingWidth(showReference);
  return { width, minWidth: width, maxWidth: TABLE_STRETCH.nameMaxWidth + (showReference ? TABLE_LAYOUT.referenceWidth : 0), flexGrow: TABLE_STRETCH.nameGrow };
}

/** Style for the ID# cell: a fixed, unresizable slot in front of the name. */
export function referenceCellStyle(): CSSProperties {
  return { width: TABLE_LAYOUT.referenceWidth, minWidth: TABLE_LAYOUT.referenceWidth, maxWidth: TABLE_LAYOUT.referenceWidth };
}

/** Style for a column cell of a table row — data cells, header cells and blank spacers alike. */
export function columnCellStyle(width: number): CSSProperties {
  return { width, minWidth: width, maxWidth: Math.round(width * TABLE_STRETCH.columnMaxScale), flexGrow: TABLE_STRETCH.columnGrow };
}

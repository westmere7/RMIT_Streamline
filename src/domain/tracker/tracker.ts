import type { EntityId, Timestamps } from "@/domain/common/types";

/**
 * Trackers are lightweight spreadsheets that live inside the workspace so teams
 * no longer keep a separate Excel file for asset tracking. A tracker is a
 * workbook; each sheet is a grid of typed columns and rows, stored as one
 * document because sheets stay small (hundreds of rows, not hundreds of
 * thousands). The shape maps 1:1 to .xlsx on import/export.
 */

export type TrackerCellValue = string | number | boolean | null;

export const TRACKER_COLUMN_TYPES = ["text", "longText", "list", "date", "url", "number", "checkbox", "person"] as const;
export type TrackerColumnType = (typeof TRACKER_COLUMN_TYPES)[number];

export const TRACKER_COLUMN_TYPE_LABELS: Record<TrackerColumnType, string> = {
  text: "Text",
  longText: "Long text",
  list: "Dropdown",
  date: "Date",
  url: "Link",
  number: "Number",
  checkbox: "Checkbox",
  person: "People",
};

/**
 * What the footer of a column adds up. "none" hides it; the others become an
 * Excel formula in the totals row on export (COUNTA, SUM, AVERAGE, MIN, MAX,
 * COUNTIF for checked boxes, and a percentage for checkbox columns).
 */
export const TRACKER_SUMMARY_KINDS = ["none", "count", "sum", "average", "min", "max", "checked", "percentChecked", "empty"] as const;
export type TrackerSummaryKind = (typeof TRACKER_SUMMARY_KINDS)[number];

export const TRACKER_SUMMARY_LABELS: Record<TrackerSummaryKind, string> = {
  none: "No summary",
  count: "Count filled",
  empty: "Count empty",
  sum: "Sum",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
  checked: "Count checked",
  percentChecked: "Percent checked",
};

/** How a number column shows (and exports) its values. */
export const TRACKER_NUMBER_FORMATS = ["plain", "integer", "decimal", "currency", "percent"] as const;
export type TrackerNumberFormat = (typeof TRACKER_NUMBER_FORMATS)[number];

export const TRACKER_NUMBER_FORMAT_LABELS: Record<TrackerNumberFormat, string> = {
  plain: "As typed",
  integer: "Whole number (1,234)",
  decimal: "Two decimals (1,234.50)",
  currency: "Currency ($1,234.50)",
  percent: "Percent (12.5%)",
};

export interface TrackerColumn {
  id: EntityId;
  name: string;
  type: TrackerColumnType;
  /** Pixel width in the grid; exported as an Excel column width. */
  width: number;
  /** Allowed values for `list` columns (becomes an Excel data-validation list). */
  options?: string[];
  /** Hex fill (no #) per option, mirrored as conditional formatting in Excel. */
  optionColors?: Record<string, string>;
  /** Footer aggregate; when unset, a sensible default for the type is shown. */
  summary?: TrackerSummaryKind;
  /** Display format for `number` columns. */
  numberFormat?: TrackerNumberFormat;
}

export type TrackerRowKind = "data" | "section" | "subsection";

export interface TrackerRow {
  id: EntityId;
  /** "section"/"subsection" rows are full-width bands (phase, channel) like the merged rows in the template. */
  kind: TrackerRowKind;
  /** Band label for section rows. */
  label?: string;
  /** Values keyed by column id; missing keys are empty cells. */
  cells: Record<EntityId, TrackerCellValue>;
}

export interface TrackerSheet extends Timestamps {
  id: EntityId;
  trackerId: EntityId;
  name: string;
  position: number;
  columns: TrackerColumn[];
  rows: TrackerRow[];
  /** Leading columns that stay put while scrolling horizontally (Excel freeze panes). */
  frozenColumns: number;
  /**
   * The task this sheet holds the deliverables of, or null. One task a sheet and
   * one sheet a task: while linked, each data row is one of the task's asset
   * lines (see tracker-assets.ts), counted everywhere asset lines are.
   */
  itemId?: EntityId | null;
  /** How rows become asset lines: which column holds the name, type, PIC and so on. */
  assetMapping?: TrackerAssetMapping | null;
}

/**
 * Where one detail of an asset comes from: a column, a value for every row, or
 * both, in which case the value fills the column's empty cells. "Every row is
 * Jane's" is a value with no column; "mostly Jane's" is a column and a value.
 */
export interface TrackerAssetSource<T> {
  columnId: EntityId | null;
  value: T | null;
}

export interface TrackerAssetMapping {
  /** The column naming each asset. A row with neither a name nor a type is not an asset. */
  name: EntityId | null;
  type: TrackerAssetSource<string>;
  quantity: TrackerAssetSource<number>;
  /** People column ids, or a text column of names; the value is user ids. */
  pic: TrackerAssetSource<EntityId[]>;
  /** A date column; the value is an ISO date. */
  due: TrackerAssetSource<string>;
  /** A checkbox (ticked is done) or a dropdown, with the choices that count as done. */
  done: { columnId: EntityId | null; values: string[] };
  /** Columns written into the line's spec, "Format: HTML5 · Size: 300x250". */
  spec: EntityId[];
  /** Link columns, each becoming a link on the line under the column's name. */
  links: EntityId[];
}

export interface Tracker extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  teamId: EntityId | null;
  name: string;
  description: string | null;
  createdBy: EntityId;
}

export type TrackerInput = Pick<Tracker, "workspaceId" | "teamId" | "name" | "description" | "createdBy">;
export type TrackerSheetInput = Pick<TrackerSheet, "trackerId" | "name" | "columns" | "rows" | "frozenColumns"> & { position?: number; assetMapping?: TrackerAssetMapping | null };

/** Column letters the way Excel names them (A, B, …, Z, AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** A People cell holds user ids, comma separated, so a cell stays one plain value. */
export function personIds(value: TrackerCellValue | undefined): string[] {
  if (typeof value !== "string" || !value) return [];
  return [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function personValue(ids: readonly string[]): string | null {
  const unique = [...new Set(ids.filter(Boolean))];
  return unique.length ? unique.join(",") : null;
}

export function isBlankCell(value: TrackerCellValue | undefined): boolean {
  return value === null || value === undefined || value === "" || value === false;
}

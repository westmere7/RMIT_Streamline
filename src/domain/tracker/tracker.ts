import type { EntityId, Timestamps } from "@/domain/common/types";

/**
 * Trackers are lightweight spreadsheets that live inside the workspace so teams
 * no longer keep a separate Excel file for asset tracking. A tracker is a
 * workbook; each sheet is a grid of typed columns and rows, stored as one
 * document because sheets stay small (hundreds of rows, not hundreds of
 * thousands). The shape maps 1:1 to .xlsx on import/export.
 */

export type TrackerCellValue = string | number | boolean | null;

export const TRACKER_COLUMN_TYPES = ["text", "longText", "list", "date", "url", "number", "checkbox"] as const;
export type TrackerColumnType = (typeof TRACKER_COLUMN_TYPES)[number];

export const TRACKER_COLUMN_TYPE_LABELS: Record<TrackerColumnType, string> = {
  text: "Text",
  longText: "Long text",
  list: "Dropdown",
  date: "Date",
  url: "Link",
  number: "Number",
  checkbox: "Checkbox",
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
export type TrackerSheetInput = Pick<TrackerSheet, "trackerId" | "name" | "columns" | "rows" | "frozenColumns"> & { position?: number };

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

export function isBlankCell(value: TrackerCellValue | undefined): boolean {
  return value === null || value === undefined || value === "" || value === false;
}

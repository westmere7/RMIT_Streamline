import type { ColorToken, EntityId } from "@/domain/common/types";

export const COLUMN_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "STATUS",
  "PERSON",
  "DATE",
  "TIMELINE",
  "NUMBER",
  "PRIORITY",
  "CHECKBOX",
  "LINK",
  "TAGS",
  "FILES",
  "DEPENDENCY",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export interface ColumnLabel {
  id: string;
  name: string;
  color: ColorToken;
}

export interface StatusColumnSettings {
  kind: "status";
  labels: ColumnLabel[];
  /** Label ids that count as "done" (used for de-emphasis and My Work completion). */
  doneLabelIds: string[];
  /** Label used when no value exists. */
  defaultLabelId: string | null;
}

export interface PriorityColumnSettings {
  kind: "priority";
  labels: ColumnLabel[];
}

export interface PersonColumnSettings {
  kind: "person";
  allowMultiple: boolean;
}

export interface NumberColumnSettings {
  kind: "number";
  unit: string | null;
  decimals: number;
}

export interface TagsColumnSettings {
  kind: "tags";
  suggestions: string[];
}

export interface EmptyColumnSettings {
  kind: "none";
}

export type ColumnSettings =
  | StatusColumnSettings
  | PriorityColumnSettings
  | PersonColumnSettings
  | NumberColumnSettings
  | TagsColumnSettings
  | EmptyColumnSettings;

export interface BoardColumn {
  id: EntityId;
  boardId: EntityId;
  name: string;
  type: ColumnType;
  settings: ColumnSettings;
  position: number;
  width: number;
  hidden: boolean;
  createdAt: string;
}

export type BoardColumnInput = Pick<BoardColumn, "boardId" | "name" | "type"> &
  Partial<Pick<BoardColumn, "settings" | "width" | "hidden">>;

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  TEXT: "Text",
  LONG_TEXT: "Long text",
  STATUS: "Status",
  PERSON: "People",
  DATE: "Date",
  TIMELINE: "Timeline",
  NUMBER: "Number",
  PRIORITY: "Priority",
  CHECKBOX: "Checkbox",
  LINK: "Link",
  TAGS: "Tags",
  FILES: "Files",
  DEPENDENCY: "Dependency",
};

export const DEFAULT_COLUMN_WIDTHS: Record<ColumnType, number> = {
  TEXT: 180,
  LONG_TEXT: 240,
  STATUS: 150,
  PERSON: 130,
  DATE: 130,
  TIMELINE: 190,
  NUMBER: 110,
  PRIORITY: 130,
  CHECKBOX: 90,
  LINK: 170,
  TAGS: 180,
  FILES: 130,
  DEPENDENCY: 180,
};

export const DEFAULT_STATUS_LABELS: ColumnLabel[] = [
  { id: "not_started", name: "Not Started", color: "gray" },
  { id: "working", name: "Working On It", color: "orange" },
  { id: "waiting", name: "Waiting", color: "sky" },
  { id: "stuck", name: "Stuck", color: "red" },
  { id: "done", name: "Done", color: "green" },
];

export const DEFAULT_PRIORITY_LABELS: ColumnLabel[] = [
  { id: "critical", name: "Critical", color: "rose" },
  { id: "high", name: "High", color: "orange" },
  { id: "medium", name: "Medium", color: "blue" },
  { id: "low", name: "Low", color: "gray" },
];

export function defaultSettingsFor(type: ColumnType): ColumnSettings {
  switch (type) {
    case "STATUS":
      return {
        kind: "status",
        labels: DEFAULT_STATUS_LABELS.map((l) => ({ ...l })),
        doneLabelIds: ["done"],
        defaultLabelId: "not_started",
      };
    case "PRIORITY":
      return { kind: "priority", labels: DEFAULT_PRIORITY_LABELS.map((l) => ({ ...l })) };
    case "PERSON":
      return { kind: "person", allowMultiple: true };
    case "NUMBER":
      return { kind: "number", unit: null, decimals: 0 };
    case "TAGS":
      return { kind: "tags", suggestions: [] };
    default:
      return { kind: "none" };
  }
}

export function statusSettings(column: BoardColumn): StatusColumnSettings | null {
  return column.settings.kind === "status" ? column.settings : null;
}

export function prioritySettings(column: BoardColumn): PriorityColumnSettings | null {
  return column.settings.kind === "priority" ? column.settings : null;
}

/** Labels for STATUS/PRIORITY columns, or an empty list for other types. */
export function columnLabels(column: BoardColumn): ColumnLabel[] {
  if (column.settings.kind === "status" || column.settings.kind === "priority") {
    return column.settings.labels;
  }
  return [];
}

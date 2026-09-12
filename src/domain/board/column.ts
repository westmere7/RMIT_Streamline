import type { ColorToken, EntityId } from "@/domain/common/types";

export const COLUMN_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "RICH_TEXT",
  "STATUS",
  "PERSON",
  "DATE",
  "TIMELINE",
  "NUMBER",
  "PRIORITY",
  "CHECKBOX",
  "LINK",
  "TAGS",
  "STAKEHOLDER",
  "SIZE",
  "ASSETS_RECAP",
  "DEPENDENCY",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

/** T-shirt sizing, the quick way to say how big a piece of work is. */
export const T_SHIRT_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type TShirtSize = (typeof T_SHIRT_SIZES)[number];

/** Cool for small, warm for large, so a glance down the column reads as a scale. */
export const T_SHIRT_SIZE_COLORS: Record<TShirtSize, ColorToken> = { XS: "sky", S: "green", M: "blue", L: "orange", XL: "rose" };

export function isTShirtSize(value: unknown): value is TShirtSize {
  return typeof value === "string" && (T_SHIRT_SIZES as readonly string[]).includes(value);
}

export interface ColumnLabel {
  id: string;
  name: string;
  color: ColorToken;
}

/**
 * What a status label means, over and above its name. Every board words these
 * differently — "Done" may be "Shipped", "Stuck" may be "Blocked" — so the
 * meaning is a property of the label, not of its text. A label carries at most
 * one role, and most labels carry none.
 */
export const STATUS_LABEL_ROLES = ["done", "stuck", "progress"] as const;
export type StatusLabelRole = (typeof STATUS_LABEL_ROLES)[number];

export interface StatusColumnSettings {
  kind: "status";
  labels: ColumnLabel[];
  /** Label ids that count as "done" (used for de-emphasis and My Work completion). */
  doneLabelIds: string[];
  /** Label ids that mean the work is stuck. Their chips are striped. */
  stuckLabelIds?: string[];
  /** Label ids that mean the work is under way. */
  progressLabelIds?: string[];
  /** Label used when no value exists. */
  defaultLabelId: string | null;
}

/** The ids carrying `role`. Boards saved before roles existed have only "done". */
export function statusRoleIds(settings: StatusColumnSettings, role: StatusLabelRole): string[] {
  if (role === "done") return settings.doneLabelIds ?? [];
  return (role === "stuck" ? settings.stuckLabelIds : settings.progressLabelIds) ?? [];
}

/** The role of one label, or null when it carries none. */
export function statusLabelRole(settings: StatusColumnSettings, labelId: string | null | undefined): StatusLabelRole | null {
  if (!labelId) return null;
  return STATUS_LABEL_ROLES.find((role) => statusRoleIds(settings, role).includes(labelId)) ?? null;
}

/** True when this label means the item is stuck — the one role with a look of its own. */
export function isStuckLabel(column: BoardColumn | null | undefined, labelId: string | null | undefined): boolean {
  return column?.settings.kind === "status" && statusLabelRole(column.settings, labelId) === "stuck";
}

/** True when this label means the work is under way — "In Progress", however the board words it. */
export function isProgressLabel(column: BoardColumn | null | undefined, labelId: string | null | undefined): boolean {
  return column?.settings.kind === "status" && statusLabelRole(column.settings, labelId) === "progress";
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

/** One entry of a TAGS column's palette. Values store tag names, so renaming a
 * tag also remaps the values that use it (see useBoardMutations.updateColumnTags). */
export interface TagOption {
  name: string;
  color: ColorToken;
}

export interface TagsColumnSettings {
  kind: "tags";
  /** The tags offered by this column, in the order they are shown. */
  options: TagOption[];
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
  /** Not shown in the board's table. */
  hidden: boolean;
  /**
   * Not shown on the task panel.
   *
   * Separate from `hidden` because the two questions are different: a column
   * worth filtering on is not always worth reading on every task, and a field
   * you rarely set is still worth seeing when you open one. Absent means shown,
   * so every column that existed before this stays where it was.
   */
  hiddenInPanel?: boolean;
  createdAt: string;
}

export type BoardColumnInput = Pick<BoardColumn, "boardId" | "name" | "type"> &
  Partial<Pick<BoardColumn, "settings" | "width" | "hidden" | "hiddenInPanel">>;

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  TEXT: "Text",
  LONG_TEXT: "Long text",
  RICH_TEXT: "Rich text",
  STATUS: "Status",
  PERSON: "People",
  DATE: "Date",
  TIMELINE: "Timeline",
  NUMBER: "Number",
  PRIORITY: "Priority",
  CHECKBOX: "Checkbox",
  LINK: "Link",
  TAGS: "Tags",
  STAKEHOLDER: "Stakeholder",
  SIZE: "Size",
  ASSETS_RECAP: "Assets recap",
  DEPENDENCY: "Dependency",
};

export const DEFAULT_COLUMN_WIDTHS: Record<ColumnType, number> = {
  TEXT: 180,
  LONG_TEXT: 240,
  RICH_TEXT: 220,
  STATUS: 150,
  PERSON: 130,
  DATE: 130,
  TIMELINE: 190,
  NUMBER: 110,
  PRIORITY: 130,
  CHECKBOX: 90,
  LINK: 170,
  TAGS: 180,
  STAKEHOLDER: 124,
  SIZE: 110,
  ASSETS_RECAP: 200,
  DEPENDENCY: 180,
};

export const DEFAULT_STATUS_LABELS: ColumnLabel[] = [
  { id: "not_started", name: "Not Started", color: "gray" },
  { id: "working", name: "In Progress", color: "orange" },
  { id: "review", name: "In Review", color: "violet" },
  { id: "waiting", name: "Waiting", color: "sky" },
  { id: "stuck", name: "Stuck", color: "red" },
  { id: "done", name: "Done", color: "green" },
];

/**
 * Priority is the one label set nobody edits.
 *
 * Everything else on a board is the team's own vocabulary, but priority is a
 * scale: four steps, always the same four, so it means the same thing on every
 * board and can be drawn as signal strength rather than read as a word. Empty
 * is the fifth state and needs no label.
 */
export const DEFAULT_PRIORITY_LABELS: ColumnLabel[] = [
  { id: "critical", name: "Critical", color: "rose" },
  { id: "high", name: "High", color: "orange" },
  { id: "medium", name: "Medium", color: "blue" },
  { id: "low", name: "Low", color: "gray" },
];

/** How many of the three bars a priority lights. Low lights none — it is the floor, not a step up. */
export const PRIORITY_STRENGTH: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function priorityStrength(labelId: string | null | undefined): number {
  return labelId ? (PRIORITY_STRENGTH[labelId] ?? 0) : 0;
}

export function defaultSettingsFor(type: ColumnType): ColumnSettings {
  switch (type) {
    case "STATUS":
      return {
        kind: "status",
        labels: DEFAULT_STATUS_LABELS.map((l) => ({ ...l })),
        doneLabelIds: ["done"],
        stuckLabelIds: ["stuck"],
        progressLabelIds: ["working"],
        defaultLabelId: "not_started",
      };
    case "PRIORITY":
      return { kind: "priority", labels: DEFAULT_PRIORITY_LABELS.map((l) => ({ ...l })) };
    case "PERSON":
      return { kind: "person", allowMultiple: true };
    case "NUMBER":
      return { kind: "number", unit: null, decimals: 0 };
    case "TAGS":
      return { kind: "tags", options: [] };
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

export function tagsSettings(column: BoardColumn): TagsColumnSettings | null {
  return column.settings.kind === "tags" ? column.settings : null;
}

/** The palette of a TAGS column, or an empty list for other types. */
export function columnTagOptions(column: BoardColumn): TagOption[] {
  if (column.settings.kind !== "tags") return [];
  // Boards stored before the palette existed carry no `options`, so default it.
  return (column.settings as Partial<TagsColumnSettings>).options ?? [];
}

/** Labels for STATUS/PRIORITY columns, or an empty list for other types. */
export function columnLabels(column: BoardColumn): ColumnLabel[] {
  // Priority is fixed (see DEFAULT_PRIORITY_LABELS): whatever a board has
  // stored, the four steps are the four steps.
  if (column.type === "PRIORITY") return DEFAULT_PRIORITY_LABELS.map((l) => ({ ...l }));
  if (column.settings.kind === "status" || column.settings.kind === "priority") {
    return column.settings.labels;
  }
  return [];
}

import type { ColorToken, EntityId } from "@/domain/common/types";
import type { ColumnRole } from "@/domain/board/column-role";
import { DEFAULT_DATE_TIME_SETTINGS, type DateTimeColumnSettings } from "@/domain/board/date-time-format";
import { DEFAULT_COUNTDOWN_SETTINGS, type CountdownColumnSettings } from "@/domain/board/countdown";

export const COLUMN_TYPES = [
  "TEXT",
  "LONG_TEXT",
  "RICH_TEXT",
  "STATUS",
  "DROPDOWN",
  "PERSON",
  "PEOPLE",
  "DATE",
  "TIMELINE",
  "NUMBER",
  "PLAIN_DATE",
  "TIME",
  "DATETIME",
  "COUNTDOWN",
  "PRIORITY",
  "CHECKBOX",
  "LINK",
  "TAGS",
  "STAKEHOLDER",
  "SIZE",
  "ASSETS_RECAP",
  "BRIEF",
  "BOOKED_AT",
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

/**
 * A list of choices the board defines, and nothing more.
 *
 * The same shape as a status column without the meanings: a dropdown says
 * which of several things this is — a format, a channel, a stage of an
 * approval nobody counts as done — and the board should not read anything
 * into the answer. Status is the column that means something; there is only
 * ever one of those, and everything else that looked like it had to borrow it.
 */
export interface DropdownColumnSettings {
  kind: "dropdown";
  labels: ColumnLabel[];
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

export type { DateTimeColumnSettings, CountdownColumnSettings };

export type ColumnSettings =
  | DateTimeColumnSettings
  | CountdownColumnSettings
  | StatusColumnSettings
  | DropdownColumnSettings
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
  /**
   * The job this column does for the rest of the workspace, where the board has
   * said so. Absent means "work it out", which is what every board did before
   * roles existed — see `resolveColumnRoles`.
   */
  role?: ColumnRole | null;
  /**
   * Taken off the board: a special column somebody deleted. Every board keeps
   * one of each special type (SPECIAL_BOARD_COLUMN_TYPES), so deleting one only
   * takes it out of sight — the table, the task panel, filters, views and
   * shared links all leave it out — while its values stay, for the dashboard
   * to count and for the column to show again when it is added back. Unlike
   * `hidden`, which keeps a column on the board and one click from showing.
   */
  removed?: boolean;
  createdAt: string;
}

export type BoardColumnInput = Pick<BoardColumn, "boardId" | "name" | "type"> &
  Partial<Pick<BoardColumn, "settings" | "width" | "hidden" | "hiddenInPanel" | "role" | "removed">>;

/** The columns a board shows anywhere at all: everything but the special ones taken off it. */
export function shownColumns<T extends Pick<BoardColumn, "removed">>(columns: readonly T[]): T[] {
  return columns.filter((column) => !column.removed);
}

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  TEXT: "Text",
  LONG_TEXT: "Long text",
  RICH_TEXT: "Rich text",
  STATUS: "Status",
  DROPDOWN: "Dropdown",
  PERSON: "PIC",
  PEOPLE: "People",
  DATE: "Due date",
  TIMELINE: "Timeline",
  NUMBER: "Number",
  PLAIN_DATE: "Date",
  TIME: "Time",
  DATETIME: "Date + Time",
  COUNTDOWN: "Countdown",
  PRIORITY: "Priority",
  CHECKBOX: "Checkbox",
  LINK: "Link",
  TAGS: "Tags",
  STAKEHOLDER: "Department",
  SIZE: "Size",
  ASSETS_RECAP: "Assets recap",
  BRIEF: "Brief",
  BOOKED_AT: "Booking time",
  DEPENDENCY: "Dependency",
};

export const DEFAULT_COLUMN_WIDTHS: Record<ColumnType, number> = {
  TEXT: 180,
  LONG_TEXT: 240,
  RICH_TEXT: 220,
  STATUS: 150,
  DROPDOWN: 150,
  PERSON: 130,
  PEOPLE: 130,
  DATE: 130,
  TIMELINE: 190,
  NUMBER: 110,
  PLAIN_DATE: 120,
  TIME: 90,
  // Compact on purpose: "Sep 16, 19:06" and no more.
  DATETIME: 130,
  COUNTDOWN: 110,
  PRIORITY: 130,
  CHECKBOX: 90,
  LINK: 170,
  TAGS: 180,
  STAKEHOLDER: 124,
  SIZE: 110,
  ASSETS_RECAP: 200,
  BRIEF: 110,
  BOOKED_AT: 130,
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
    case "DROPDOWN":
      // Empty, because nobody can guess what this particular list is of. The
      // cell says so and opens the label editor.
      return { kind: "dropdown", labels: [], defaultLabelId: null };
    case "PRIORITY":
      return { kind: "priority", labels: DEFAULT_PRIORITY_LABELS.map((l) => ({ ...l })) };
    case "PERSON":
    case "PEOPLE":
      return { kind: "person", allowMultiple: true };
    case "NUMBER":
      return { kind: "number", unit: null, decimals: 0 };
    case "TAGS":
      return { kind: "tags", options: [] };
    case "PLAIN_DATE":
    case "TIME":
    case "DATETIME":
    case "BOOKED_AT":
      return { ...DEFAULT_DATE_TIME_SETTINGS };
    case "COUNTDOWN":
      return { ...DEFAULT_COUNTDOWN_SETTINGS };
    default:
      return { kind: "none" };
  }
}

export function statusSettings(column: BoardColumn): StatusColumnSettings | null {
  return column.settings.kind === "status" ? column.settings : null;
}

export function dropdownSettings(column: BoardColumn): DropdownColumnSettings | null {
  return column.settings.kind === "dropdown" ? column.settings : null;
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

/** The label sets: STATUS, DROPDOWN and PRIORITY. An empty list for other types. */
export function columnLabels(column: BoardColumn): ColumnLabel[] {
  // Priority is fixed (see DEFAULT_PRIORITY_LABELS): whatever a board has
  // stored, the four steps are the four steps.
  if (column.type === "PRIORITY") return DEFAULT_PRIORITY_LABELS.map((l) => ({ ...l }));
  if (column.settings.kind === "status" || column.settings.kind === "dropdown" || column.settings.kind === "priority") {
    return column.settings.labels;
  }
  return [];
}

/** True where the user defines the labels, so the column has a list to edit. */
export function hasEditableLabels(column: BoardColumn): boolean {
  return column.type === "STATUS" || column.type === "DROPDOWN";
}

/**
 * The column types the rest of the app reads meaning out of.
 *
 * Every board is laid out differently and the dashboard still has to answer
 * one question across all of them, so these types — not the names boards give
 * them — are how it finds what it needs: which work is done, who is carrying
 * it, when it is due, how big it is, who it is for. A column of one of these
 * types is a fact the workspace reads; everything else is a field a board
 * keeps for itself.
 *
 * Naming is still the board's business: a team that calls its PIC column
 * "Designer" is understood perfectly well.
 */
export const SYSTEM_COLUMN_TYPES: readonly ColumnType[] = ["STATUS", "PERSON", "DATE", "TIMELINE", "PRIORITY", "STAKEHOLDER", "SIZE", "ASSETS_RECAP", "BRIEF", "BOOKED_AT"];

/**
 * What each type is for, shown when the type is hovered in the picker.
 *
 * The ones in SYSTEM_COLUMN_TYPES say what the workspace does with them,
 * because choosing one is a decision with consequences on the dashboard. The
 * rest just say what they hold.
 */
export const COLUMN_TYPE_PURPOSE: Record<ColumnType, string> = {
  TEXT: "A short line of text.",
  LONG_TEXT: "Several lines of plain text.",
  RICH_TEXT: "A document — headings, bullets, links. The cell shows the start of it and opens the rest.",
  DROPDOWN: "One of a list of choices the board defines, with colours. A status without the meanings.",
  PEOPLE: "People with no bearing on the work — a requester, a contact. For who is doing it, use PIC.",
  NUMBER: "A number, with a unit if it needs one.",
  PLAIN_DATE: "A calendar day, with no bearing on deadlines. For when it is due, use Due date.",
  TIME: "A time of day.",
  DATETIME: "A day and a time together, kept compact: Sep 16, 19:06.",
  COUNTDOWN: "Time left until a moment, from a minute to months: 45m, 3d 4h, 2mo.",
  CHECKBOX: "Ticked or not.",
  LINK: "A web address, with its own text if a bare URL would not read well.",
  TAGS: "Any number of labels at once, from a palette the board keeps.",
  DEPENDENCY: "Tasks on this board this one waits on. Never carried to a linked board.",
  STATUS: "How the work is going. Drives completion, My Work and the dashboard.",
  PERSON: "Who is doing the work. Feeds workload and My Work.",
  DATE: "The deadline. Overdue and the calendar read it.",
  TIMELINE: "Start and end. Drives the Gantt and timeline views.",
  PRIORITY: "Four fixed steps, the same on every board.",
  STAKEHOLDER: "Who the work is for, from Settings → Departments.",
  SIZE: "How big the work is. Adds up into effort figures.",
  ASSETS_RECAP: "A live summary of the task's deliverables.",
  BRIEF: "The request's brief, filled in by bookings.",
  BOOKED_AT: "When the task was booked. Task Allocation only.",
};

/**
 * The special types every board holds one of, whether it shows them or not.
 * Booking time is the exception: it belongs on Task Allocation alone.
 */
export const SPECIAL_BOARD_COLUMN_TYPES: readonly ColumnType[] = SYSTEM_COLUMN_TYPES.filter((type) => type !== "BOOKED_AT");

/** True for the types the workspace reads meaning out of. */
export function isSystemColumnType(type: ColumnType): boolean {
  return SYSTEM_COLUMN_TYPES.includes(type);
}

/**
 * The special types a board holds one of, every one of them. A second Status,
 * Due date or Brief would leave the dashboard, portal and booking choosing
 * between them. Any other date a board keeps, a start or a briefed-on day, is
 * a plain Date column.
 */
export const ONE_PER_BOARD_COLUMN_TYPES: readonly ColumnType[] = SYSTEM_COLUMN_TYPES;

/** True when a board with these columns already has its one column of this type. */
export function columnTypeTaken(type: ColumnType, columns: readonly Pick<BoardColumn, "type">[]): boolean {
  return ONE_PER_BOARD_COLUMN_TYPES.includes(type) && columns.some((column) => column.type === type);
}

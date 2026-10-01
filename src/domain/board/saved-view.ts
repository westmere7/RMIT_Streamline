import type { EntityId, Timestamps } from "../common/types";
import { BOARD_VIEWS, type BoardViewKind } from "./board";

/** Built-in fields, or any column by id ("column:<id>") from a click on its header. */
export type ViewSortField = "name" | "dueDate" | "priority" | "status" | "createdAt" | `column:${string}`;
export type ViewDateFilter = "overdue" | "today" | "thisWeek" | "noDate" | null;

export interface ViewFilters {
  /** User ids; an item matches when any PERSON column holds one of them. */
  personIds: string[];
  /** Status label ids. */
  statusIds: string[];
  /** Priority label ids. */
  priorityIds: string[];
  groupIds: string[];
  /** Tag names (case-insensitive); an item matches when any TAGS column holds one of them. */
  tags: string[];
  date: ViewDateFilter;
}

export interface ViewSort {
  field: ViewSortField;
  direction: "asc" | "desc";
}

/**
 * Everything a saved view puts back: which view is open, what is searched,
 * filtered and sorted, which columns are hidden, and each view's own settings
 * (the Kanban's lanes and tint, a zoom level, the ticket column) as the views
 * store them.
 */
export interface SavedViewConfig {
  view: BoardViewKind;
  search: string;
  filters: ViewFilters;
  sort: ViewSort | null;
  /** Columns hidden while this view is on. The board's own hidden flags are left alone. */
  hiddenColumnIds: string[];
  settings: Partial<Record<BoardViewKind, Record<string, unknown>>>;
}

/**
 * A board's view saved under a name. Shared ones are everyone's on the board
 * and only its editors change them; the rest are the saver's alone.
 *
 * The Default view, once saved, is one of these too: shared, one per board,
 * and never renamed, made private or deleted.
 */
export interface SavedBoardView extends Timestamps {
  id: EntityId;
  boardId: EntityId;
  name: string;
  shared: boolean;
  config: SavedViewConfig;
  createdBy: EntityId;
  isDefault: boolean;
}

export type SavedBoardViewInput = Pick<SavedBoardView, "boardId" | "name" | "shared" | "config" | "createdBy" | "isDefault">;

export const DEFAULT_VIEW_NAME = "Default view";
export type SavedBoardViewPatch = Partial<Pick<SavedBoardView, "name" | "shared" | "config">>;

export const SAVED_VIEW_NAME_MAX = 60;

export const EMPTY_VIEW_FILTERS: ViewFilters = { personIds: [], statusIds: [], priorityIds: [], groupIds: [], tags: [], date: null };

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** A stored config read back whole, whatever an older or hand-edited row is missing. */
export function normaliseViewConfig(raw: unknown): SavedViewConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const f = (r.filters && typeof r.filters === "object" ? r.filters : {}) as Record<string, unknown>;
  const s = r.sort && typeof r.sort === "object" ? (r.sort as Record<string, unknown>) : null;
  const settings: SavedViewConfig["settings"] = {};
  if (r.settings && typeof r.settings === "object") {
    for (const [kind, value] of Object.entries(r.settings as Record<string, unknown>)) {
      if ((BOARD_VIEWS as readonly string[]).includes(kind) && value && typeof value === "object") settings[kind as BoardViewKind] = value as Record<string, unknown>;
    }
  }
  const date = f.date;
  return {
    view: (BOARD_VIEWS as readonly string[]).includes(r.view as string) ? (r.view as BoardViewKind) : "table",
    search: typeof r.search === "string" ? r.search : "",
    filters: {
      personIds: strings(f.personIds),
      statusIds: strings(f.statusIds),
      priorityIds: strings(f.priorityIds),
      groupIds: strings(f.groupIds),
      tags: strings(f.tags),
      date: date === "overdue" || date === "today" || date === "thisWeek" || date === "noDate" ? date : null,
    },
    sort: s && typeof s.field === "string" ? { field: s.field as ViewSortField, direction: s.direction === "desc" ? "desc" : "asc" } : null,
    hiddenColumnIds: strings(r.hiddenColumnIds),
    settings,
  };
}

/** A name fit to save: trimmed, and no longer than the box allows. */
export function cleanViewName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, SAVED_VIEW_NAME_MAX);
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b) && a.every((v) => typeof v === "string") && b.every((v) => typeof v === "string")) return sameSet(a as string[], b as string[]);
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Whether two configs show the same thing. Id lists compare as sets, and a
 * view's settings are read over its defaults, so a setting saved before it was
 * ever touched is the same as its default rather than a change.
 */
export function sameViewConfig(a: SavedViewConfig, b: SavedViewConfig, defaults: Partial<Record<BoardViewKind, Record<string, unknown>>> = {}): boolean {
  if (a.view !== b.view || a.search.trim() !== b.search.trim()) return false;
  const fa = a.filters;
  const fb = b.filters;
  if (fa.date !== fb.date || !sameSet(fa.personIds, fb.personIds) || !sameSet(fa.statusIds, fb.statusIds) || !sameSet(fa.priorityIds, fb.priorityIds) || !sameSet(fa.groupIds, fb.groupIds)) return false;
  if (!sameSet(fa.tags.map((t) => t.toLowerCase()), fb.tags.map((t) => t.toLowerCase()))) return false;
  if ((a.sort?.field ?? null) !== (b.sort?.field ?? null) || (a.sort?.direction ?? null) !== (b.sort?.direction ?? null)) return false;
  if (!sameSet(a.hiddenColumnIds, b.hiddenColumnIds)) return false;
  for (const kind of BOARD_VIEWS) {
    const base = defaults[kind] ?? {};
    const sa = { ...base, ...a.settings[kind] };
    const sb = { ...base, ...b.settings[kind] };
    for (const key of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      if (!sameValue(sa[key], sb[key])) return false;
    }
  }
  return true;
}

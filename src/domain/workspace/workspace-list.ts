import type { TagOption } from "@/domain/board/column";
import { BOOKING_ASSET_TYPES } from "@/domain/booking/booking";
import { COLOR_TOKENS, type ColorToken, type EntityId, type Timestamps } from "@/domain/common/types";

/**
 * The lists a workspace defines once and reuses everywhere: the asset types a
 * deliverable can be, the stakeholder groups a request can come from, and
 * whatever else the team decides to standardise later.
 *
 * They are workspace-wide, not per person and not per board — one team, one
 * vocabulary. A Tags column keeps its own palette; that is deliberately not one
 * of these, because those words belong to the board that asks for them.
 */
export const WORKSPACE_LIST_KEYS = ["ASSET_TYPES", "STAKEHOLDER_GROUPS"] as const;

export type WorkspaceListKey = (typeof WORKSPACE_LIST_KEYS)[number];

export interface WorkspaceListOption extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  listKey: WorkspaceListKey;
  name: string;
  /** A colour from the shared palette (src/lib/colors.ts). */
  color: ColorToken;
  position: number;
}

export type WorkspaceListOptionInput = Pick<WorkspaceListOption, "workspaceId" | "listKey" | "name" | "color" | "position">;

/** Every list, keyed. What the settings page reads and what the pickers offer. */
export type WorkspaceLists = Record<WorkspaceListKey, TagOption[]>;

/** Who the work is for. Five to start with; the team edits them from Settings. */
export const DEFAULT_STAKEHOLDER_GROUPS: readonly TagOption[] = [
  { name: "Comm.", color: "blue" },
  { name: "Event", color: "orange" },
  { name: "Contents", color: "purple" },
  { name: "Digital", color: "teal" },
  { name: "Web", color: "green" },
];

export interface WorkspaceListMeta {
  label: string;
  /** One line under the heading: what the list is for and where it shows up. */
  description: string;
  /** What a workspace that has never edited the list is offered. */
  defaults: readonly TagOption[];
}

export const WORKSPACE_LIST_META: Record<WorkspaceListKey, WorkspaceListMeta> = {
  ASSET_TYPES: {
    label: "Asset types",
    description: "Offered on every deliverable and on the booking form.",
    defaults: BOOKING_ASSET_TYPES,
  },
  STAKEHOLDER_GROUPS: {
    label: "Stakeholder groups",
    description: "Who the work is for.",
    defaults: DEFAULT_STAKEHOLDER_GROUPS,
  },
};

export const MAX_LIST_OPTIONS = 60;
export const MAX_LIST_OPTION_NAME = 40;

/** Rows in the order they are shown, as the plain options every picker takes. */
export function toTagOptions(rows: readonly WorkspaceListOption[]): TagOption[] {
  return rows
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    .map((row) => ({ name: row.name, color: asColor(row.color) }));
}

/** A colour a row claims to have, or a safe one — rows outlive palette changes. */
export function asColor(value: string): ColorToken {
  return (COLOR_TOKENS as readonly string[]).includes(value) ? (value as ColorToken) : "gray";
}

/**
 * A workspace's lists, with the built-in defaults standing in for any list
 * nobody has touched. Editing a list writes it out in full, so the defaults are
 * a starting point rather than something to migrate.
 */
export function workspaceLists(rows: readonly WorkspaceListOption[]): WorkspaceLists {
  const lists = {} as WorkspaceLists;
  for (const key of WORKSPACE_LIST_KEYS) {
    const stored = rows.filter((row) => row.listKey === key);
    lists[key] = stored.length > 0 ? toTagOptions(stored) : WORKSPACE_LIST_META[key].defaults.map((option) => ({ ...option }));
  }
  return lists;
}

/** Trimmed, deduplicated by name (case-insensitive) and capped — what a save is allowed to store. */
export function cleanListOptions(options: readonly TagOption[]): TagOption[] {
  const seen = new Set<string>();
  const kept: TagOption[] = [];
  for (const option of options) {
    const name = option.name.trim().slice(0, MAX_LIST_OPTION_NAME);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ name, color: option.color });
    if (kept.length >= MAX_LIST_OPTIONS) break;
  }
  return kept;
}

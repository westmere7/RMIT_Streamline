import type { ColorToken } from "@/domain/common/types";
import { COLOR_TOKENS } from "@/domain/common/types";

/**
 * Work types: the kinds of work the team's deliverables come to.
 *
 * Twenty asset types is too fine a grain to see where the work goes —
 * "Static designs" and "Display ads" are the same kind of job — so each type
 * belongs to one work type, and the dashboard draws the team's (or one person's) output as
 * a profile across them. Per workspace, like the asset types and their rates,
 * and keyed by the type's name the same way: the list is rewritten whole on
 * every save and its rows have no lasting identity. A rename carries the
 * work type with it (WorkspaceListService); a type in no work type is simply not drawn.
 */
export interface WorkType {
  id: string;
  name: string;
  color: ColorToken;
}

export interface WorkTypes {
  workTypes: WorkType[];
  /** Asset type name → the work types it belongs to. A type can be in several, and counts in each. */
  assets: Record<string, string[]>;
}

/** Enough spokes to say something, few enough that a radar still reads. */
export const MAX_WORK_TYPES = 8;
export const MIN_RADAR_WORK_TYPES = 3;
export const MAX_WORK_TYPE_NAME = 32;

export const EMPTY_WORK_TYPES: WorkTypes = { workTypes: [], assets: {} };

/**
 * Stored work types made safe to read: known colours, each name and id once,
 * mappings that point at a work type. A mapping stored as one id (before a type
 * could be in several) reads as a list of one.
 */
export function normaliseWorkTypes(value: unknown): WorkTypes {
  if (!value || typeof value !== "object") return EMPTY_WORK_TYPES;
  const raw = value as { workTypes?: unknown; assets?: unknown };
  const list: WorkType[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of Array.isArray(raw.workTypes) ? raw.workTypes : []) {
    if (!entry || typeof entry !== "object") continue;
    const s = entry as Record<string, unknown>;
    const id = typeof s.id === "string" && s.id ? s.id : null;
    const name = typeof s.name === "string" ? s.name.trim().slice(0, MAX_WORK_TYPE_NAME) : "";
    if (!id || !name || ids.has(id) || names.has(name.toLowerCase())) continue;
    ids.add(id);
    names.add(name.toLowerCase());
    list.push({ id, name, color: COLOR_TOKENS.includes(s.color as ColorToken) ? (s.color as ColorToken) : "gray" });
    if (list.length >= MAX_WORK_TYPES) break;
  }
  const assets: Record<string, string[]> = {};
  if (raw.assets && typeof raw.assets === "object") {
    for (const [type, stored] of Object.entries(raw.assets as Record<string, unknown>)) {
      const given = Array.isArray(stored) ? stored : [stored];
      const kept = [...new Set(given.filter((id): id is string => typeof id === "string" && ids.has(id)))];
      if (type.trim() && kept.length > 0) assets[type.trim()] = kept;
    }
  }
  return { workTypes: list, assets };
}

/** The ids an asset type is in, matched without regard to case. */
export function workTypeIdsOf(workTypes: WorkTypes, type: string | null | undefined): string[] {
  if (!type) return [];
  const wanted = type.trim().toLowerCase();
  return Object.entries(workTypes.assets).find(([name]) => name.toLowerCase() === wanted)?.[1] ?? [];
}

/** The work types an asset type belongs to, in the order the work types are listed. */
export function workTypesOf(workTypes: WorkTypes, type: string | null | undefined): WorkType[] {
  const ids = new Set(workTypeIdsOf(workTypes, type));
  return workTypes.workTypes.filter((w) => ids.has(w.id));
}

/** The mappings after asset types are renamed, so the work types follow a type to its new word. */
export function renameWorkTypeAssets(workTypes: WorkTypes, renames: Readonly<Record<string, string>>): WorkTypes {
  const assets: Record<string, string[]> = {};
  for (const [type, ids] of Object.entries(workTypes.assets)) assets[renames[type] ?? type] = ids;
  return { ...workTypes, assets };
}

import type { BoardColumn, ColumnType } from "@/domain/board/column";
import { COLUMN_TYPE_LABELS, isSystemColumnType } from "@/domain/board/column";
import { PORTAL_COLUMN_LABELS, PORTAL_COLUMNS, type PortalColumnKey } from "@/domain/portal/stakeholder-portal";

/**
 * Which columns the portal's board shows, in what order.
 *
 * The portal reconciles many boards into one, so a column here is a column of
 * the portal, not of a board: the built-in ones (status, priority, PIC…) are
 * read the same way off every board, and the rest are the boards' own columns
 * merged — a special type by its type (each board holds one), anything else by
 * its name and type, so two boards' "Channel" tags become one column.
 *
 * Presentation only. A built-in column has always been published; a board's
 * own column is published only while it is switched on here, which is why one
 * the portal has never seen starts switched off.
 */

/** One row of the stored layout. Unknown keys are kept and ignored, so a column that comes back later keeps its place. */
export interface PortalColumnEntry {
  key: string;
  hidden: boolean;
}

/** A column the portal could show, for the settings list. */
export interface PortalColumnCandidate {
  key: string;
  name: string;
  type: ColumnType;
  /** A special column type: the workspace reads meaning out of it. */
  special: boolean;
  /** Read off every board the same way, rather than one board column carried across. */
  builtIn: boolean;
  /** Status is what the board is about; it cannot be hidden. */
  required?: boolean;
}

/** The portal's own columns, in the order they have always come. `stakeholder` shows only while several departments are on screen. */
export const PORTAL_BUILT_IN_ORDER = ["requested", "stakeholder", "status", "priority", "people", "due", "timeline", "assets", "asset-types", "brief"] as const;
export type PortalBuiltInKey = (typeof PORTAL_BUILT_IN_ORDER)[number];

const BUILT_IN_TYPES: Record<PortalBuiltInKey, ColumnType> = {
  requested: "BOOKED_AT",
  stakeholder: "STAKEHOLDER",
  status: "STATUS",
  priority: "PRIORITY",
  people: "PERSON",
  due: "DATE",
  timeline: "TIMELINE",
  assets: "ASSETS_RECAP",
  "asset-types": "TAGS",
  brief: "BRIEF",
};

const BUILT_IN_NAMES: Record<PortalBuiltInKey, string> = { ...PORTAL_COLUMN_LABELS, stakeholder: "Department", status: "Status" };

/**
 * Board column types the built-ins already carry, or that must never travel:
 * a dependency names other tasks, a booking time is the Requested column.
 */
const NOT_CARRIED: ReadonlySet<ColumnType> = new Set<ColumnType>(["STATUS", "PRIORITY", "PERSON", "DATE", "TIMELINE", "ASSETS_RECAP", "BRIEF", "STAKEHOLDER", "BOOKED_AT", "DEPENDENCY"]);

export function isPortalBuiltInKey(key: string): key is PortalBuiltInKey {
  return (PORTAL_BUILT_IN_ORDER as readonly string[]).includes(key);
}

/** The asset-type tags a booking writes, which the Asset type built-in already reads. */
function isAssetTypeTags(column: Pick<BoardColumn, "type" | "name">): boolean {
  return column.type === "TAGS" && column.name.toLowerCase().includes("asset");
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "column";
}

/** The portal key a board column is carried under, or null when the portal does not carry it. */
export function portalColumnKeyFor(column: Pick<BoardColumn, "type" | "name">): string | null {
  if (NOT_CARRIED.has(column.type) || isAssetTypeTags(column)) return null;
  // A text column called Brief, from before the Brief type, is what the Brief built-in shows.
  if ((column.type === "RICH_TEXT" || column.type === "LONG_TEXT") && column.name.trim().toLowerCase() === "brief") return null;
  // A special type is one per board, so its type is its identity whatever each board calls it.
  if (isSystemColumnType(column.type)) return `type:${column.type}`;
  return `col:${column.type}:${slug(column.name)}`;
}

/** Every column the portal could show: the built-ins, then each board column the boards between them carry, once. */
export function portalColumnCandidates(columns: readonly Pick<BoardColumn, "type" | "name" | "removed">[]): PortalColumnCandidate[] {
  const builtIns: PortalColumnCandidate[] = PORTAL_BUILT_IN_ORDER.map((key) => ({ key, name: BUILT_IN_NAMES[key], type: BUILT_IN_TYPES[key], special: isSystemColumnType(BUILT_IN_TYPES[key]) || key === "requested", builtIn: true, ...(key === "status" ? { required: true } : {}) }));
  const extras = new Map<string, PortalColumnCandidate>();
  for (const column of columns) {
    if (column.removed) continue;
    const key = portalColumnKeyFor(column);
    if (!key || extras.has(key)) continue;
    const special = isSystemColumnType(column.type);
    extras.set(key, { key, name: special ? COLUMN_TYPE_LABELS[column.type] : column.name.trim(), type: column.type, special, builtIn: false });
  }
  return [...builtIns, ...[...extras.values()].sort((a, b) => Number(b.special) - Number(a.special) || a.name.localeCompare(b.name))];
}

/**
 * The layout as it stands: the stored order for every column still on offer,
 * then anything new at the end. With nothing stored, the built-ins in their
 * usual order, hidden as `hiddenColumns` says, and every board column hidden.
 */
export function resolvePortalColumnLayout(stored: readonly PortalColumnEntry[] | null | undefined, hiddenColumns: readonly PortalColumnKey[], candidates: readonly Pick<PortalColumnCandidate, "key" | "builtIn" | "required">[]): PortalColumnEntry[] {
  const offered = new Map(candidates.map((c) => [c.key, c]));
  const out: PortalColumnEntry[] = [];
  const seen = new Set<string>();
  for (const entry of stored ?? []) {
    const candidate = offered.get(entry.key);
    if (!candidate || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({ key: entry.key, hidden: candidate.required ? false : entry.hidden });
  }
  for (const candidate of candidates) {
    if (seen.has(candidate.key)) continue;
    const hidden = candidate.required ? false : candidate.builtIn ? (PORTAL_COLUMNS as readonly string[]).includes(candidate.key) && hiddenColumns.includes(candidate.key as PortalColumnKey) : true;
    out.push({ key: candidate.key, hidden });
  }
  return out;
}

/** A stored layout made safe to keep: entries with a key and a flag, each key once, a sane length. */
export function normalizePortalColumnLayout(value: unknown): PortalColumnEntry[] | null {
  if (!Array.isArray(value)) return null;
  const out: PortalColumnEntry[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.key !== "string" || !entry.key || entry.key.length > 160 || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({ key: entry.key, hidden: entry.hidden === true });
    if (out.length >= 200) break;
  }
  return out;
}

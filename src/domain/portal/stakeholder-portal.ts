import type { ColorToken, EntityId, Timestamps } from "@/domain/common/types";

/**
 * A stakeholder department, and the portal it reads its work through.
 *
 * A department is one of the workspace's stakeholder groups — Comm., Event,
 * Contents and so on — given a life of its own. The groups themselves live in
 * Settings → Lists as plain words with colours, and that list is rewritten whole
 * on every save: the rows are deleted and re-inserted, so nothing about a list
 * row survives being edited. A portal cannot hang off something that forgets
 * itself every time somebody reorders the list, and neither can a request's
 * provenance.
 *
 * So a department is a row of its own with a durable id, reconciled against the
 * list whenever the list is saved. Settings → Lists stays the only place these
 * words are edited, which is what keeps the two from drifting apart; the
 * reconciliation reads the rename map the editor already produces, so a rename
 * is something the person said rather than something a name match guessed.
 *
 * A department is never deleted while it has history. Taking a group out of the
 * list disables its department: the portal stops opening, the requests stay
 * attached, and a later group with the same name is a new department with no
 * claim on any of it.
 */

export const DEPARTMENT_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

export interface StakeholderDepartment extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  /** The display label, kept in step with the stakeholder-groups list. */
  name: string;
  color: ColorToken;
  position: number;
  status: DepartmentStatus;
}

export type StakeholderDepartmentInput = Pick<StakeholderDepartment, "workspaceId" | "name" | "color" | "position">;

/** What the portal opens on when a visitor has expressed no preference of their own. */
export const PORTAL_THEMES = ["light", "dark", "system"] as const;
export type PortalTheme = (typeof PORTAL_THEMES)[number];

/**
 * The workspace's portal, and the credentials that open it.
 *
 * One per workspace. It used to be one per department, which meant a link, a
 * password and a set of settings for each of them, and a stakeholder who works
 * with two departments holding two links. The work was never divided that way:
 * every task carries the stakeholder it is for, so one portal showing all of it
 * — with the stakeholder as a filter the visitor chooses — is the same
 * information without the administration.
 *
 * The token is the whole of the authorisation: unguessable, and worth nothing
 * once regenerated. `credentialVersion` is what makes revocation immediate — a
 * grant carries the version it was issued under, so bumping it invalidates
 * every grant already handed out, including the one held by a tab that is open
 * right now. Changing or clearing the password bumps it too.
 */
export interface StakeholderPortal extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  /**
   * Null on the unified portal — the only kind served.
   *
   * A row that still names a department is a superseded per-department link.
   * They are kept rather than deleted so their tokens resolve to "this link has
   * been replaced" instead of to nothing, which is the difference between a
   * stakeholder asking for the new link and a stakeholder thinking they
   * mistyped the address.
   */
  departmentId: EntityId | null;
  /** Off keeps the row and the token but serves nothing — neither browsing nor booking. */
  enabled: boolean;
  /** The secret in the link (/portal/<token>). */
  token: string;
  /** `pbkdf2$<iterations>$<salt>$<hash>`, or null when the portal asks for no password. */
  passwordHash: string | null;
  /** Bumped by a link regeneration or any password change; every older grant dies with it. */
  credentialVersion: number;
  defaultTheme: PortalTheme;
  /** A line of the team's own words, under the portal's name. */
  description: string | null;
  /** Board columns the portal does not need. Keys, not ids: see `PORTAL_COLUMNS`. */
  hiddenColumns: PortalColumnKey[];
  /** Which view the link opens on. */
  defaultView: PortalView;
  /** Whether this link takes new requests. Off makes the portal read-only. */
  allowBooking: boolean;
  /** Whether the figures appear in the header. */
  showRecap: boolean;
  /**
   * Whether the board may be grouped the way each team's board groups it.
   *
   * Off by default: a team's groups are its own furniture — sprints, campaigns,
   * "parked" — and mean little to somebody outside. Off, the portal groups by
   * status and never offers the boards' own groups; on, it opens grouped by
   * board and the visitor may switch.
   */
  showItemGroups: boolean;
}

/**
 * The columns the portal's board can carry.
 *
 * Keys rather than ids, because the ids are derived and a setting has to
 * survive a portal being rebuilt. `status` and `item` are not
 * here: a board with no status is not worth reading, and the name is the row.
 * A column with nothing in it is left out whatever this says — hiding is a
 * choice about clutter, not a way to make an empty column appear.
 */
export const PORTAL_COLUMNS = ["requested", "priority", "people", "due", "timeline", "assets", "asset-types"] as const;
export type PortalColumnKey = (typeof PORTAL_COLUMNS)[number];

export const PORTAL_COLUMN_LABELS: Record<PortalColumnKey, string> = {
  requested: "Requested",
  priority: "Priority",
  people: "Working on it",
  due: "Due",
  timeline: "Timeline",
  assets: "Deliverables",
  "asset-types": "Asset types",
};

export const PORTAL_VIEWS = ["table", "kanban", "timeline", "calendar", "gantt", "workload", "chart"] as const;
export type PortalView = (typeof PORTAL_VIEWS)[number];

/**
 * How the portal's board is divided into groups.
 *
 * A view setting, like which view the link opens on: the visitor chooses, it
 * lives in the URL so a link they pass on opens the same way, and nothing is
 * stored against the portal. "board" is one group per board the work is being
 * run on — "who has this"; "status" groups by status instead — "where is it up
 * to", which is the question most visitors arrive with; "stakeholder" is one
 * group per stakeholder, which only says anything while the filter is showing
 * more than one of them.
 */
export const PORTAL_GROUPINGS = ["board", "status", "stakeholder"] as const;
export type PortalGrouping = (typeof PORTAL_GROUPINGS)[number];

export function isPortalGrouping(value: unknown): value is PortalGrouping {
  return typeof value === "string" && (PORTAL_GROUPINGS as readonly string[]).includes(value);
}

/** A description is a line under a heading, not a page. */
export const MAX_PORTAL_DESCRIPTION = 280;

export function isPortalColumnKey(value: unknown): value is PortalColumnKey {
  return typeof value === "string" && (PORTAL_COLUMNS as readonly string[]).includes(value);
}

export function isPortalView(value: unknown): value is PortalView {
  return typeof value === "string" && (PORTAL_VIEWS as readonly string[]).includes(value);
}

/** What an administrator may change about how a portal presents itself. */
export type PortalPresentation = Partial<Pick<StakeholderPortal, "description" | "hiddenColumns" | "defaultView" | "allowBooking" | "showRecap" | "showItemGroups" | "defaultTheme">>;

export type StakeholderPortalInput = Pick<StakeholderPortal, "workspaceId" | "departmentId" | "enabled" | "token" | "passwordHash" | "defaultTheme">;

/** Where a request came from. Only these two ever create provenance. */
export const PORTAL_REQUEST_SOURCES = ["PORTAL_BOOKING", "IMPORT"] as const;
export type PortalRequestSource = (typeof PORTAL_REQUEST_SOURCES)[number];

/**
 * The record that a task belongs to a department: its provenance.
 *
 * This row, and nothing else, is what puts a task in a portal. Not a matching
 * label, not a requester's email domain, not the STAKEHOLDER cell — those are
 * display values people edit, and an edit must never hand a task to another
 * department or publish one that was never meant to be public.
 *
 * `itemId` is the canonical origin. Allocation makes a second item and links the
 * two; the link is not provenance, so the portal lists the origin once and shows
 * the allocated copy inside the task's own details.
 *
 * `publicBrief` exists because `item.description` is not publishable. The
 * booking writer appends every answer the receiving board had no column for —
 * requester name, email, department among them — under a "Request details"
 * heading. The brief the requester typed is captured here at booking time,
 * before that happens.
 */
export interface PortalRequest extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  departmentId: EntityId;
  /** The canonical origin item. One request per item, enforced by the database. */
  itemId: EntityId;
  source: PortalRequestSource;
  /** The requester's own words, with nothing added. Null when an import found none it trusted. */
  publicBrief: string | null;
  bookedAt: string;
}

export type PortalRequestInput = Pick<PortalRequest, "workspaceId" | "departmentId" | "itemId" | "source" | "publicBrief"> & { bookedAt?: string };

/**
 * A submission that has already been accepted, kept so a retry cannot book twice.
 *
 * The key is made by the browser before it sends, scoped to the portal, and
 * unique in the database. A retry with the same key returns the receipt the
 * first attempt produced; the same key with a different payload is refused,
 * because that is a different booking wearing an old key.
 */
export interface PortalSubmission {
  id: EntityId;
  portalId: EntityId;
  submissionKey: string;
  /** A digest of the request, so key reuse with different content can be told apart. */
  requestHash: string;
  itemId: EntityId | null;
  /** The receipt to hand back on a retry, exactly as the first attempt returned it. */
  receipt: unknown;
  createdAt: string;
}

export const PORTAL_TOKEN_LENGTH = 32;

/** No look-alike characters: these links are pasted into emails and read aloud. */
const TOKEN_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function generatePortalToken(): string {
  const bytes = new Uint8Array(PORTAL_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

/**
 * Whether a string is shaped like a token at all.
 *
 * A cheap gate before any lookup, so a URL full of rubbish never reaches the
 * database. It says nothing about whether the token opens anything.
 */
export function isPlausiblePortalToken(value: string): boolean {
  return /^[a-z0-9]{24,64}$/.test(value);
}

/** Why a portal will not open. The visitor is told the same thing for all of them. */
export const PORTAL_REFUSALS = ["unknown", "off", "password", "revoked"] as const;
export type PortalRefusal = (typeof PORTAL_REFUSALS)[number];

/**
 * What a visitor learns before they are let in: whether the link is live and
 * whether it wants a password.
 *
 * Deliberately thin. It names the team, because the person holding the link
 * already knows who they asked for it, and nothing else — no counts, no task
 * names, no stakeholder list. The stakeholders are only named once somebody is
 * through the gate.
 */
export interface PortalGate {
  open: boolean;
  refusal: PortalRefusal | null;
  needsPassword: boolean;
  /** What the portal calls itself before anyone is let in: the creative team's name. */
  portalName: string;
  /** The workspace's editable display name, falling back to the workspace's own. */
  creativeTeamName: string;
  defaultTheme: PortalTheme;
  /** Rises whenever the link or password changes; a grant issued under an older one is dead. */
  credentialVersion: number;
}

export const MAX_DEPARTMENT_NAME = 40;
export const MAX_PUBLIC_BRIEF = 4000;
export const MAX_CREATIVE_TEAM_NAME = 60;

/** How many requests one page of the portal's list carries. */
export const PORTAL_PAGE_SIZE = 50;

/**
 * What the visitor is looking at: whose work, and from when.
 *
 * Both are the visitor's own choice and neither is authorisation — the token
 * decides what may be read, and these two decide how much of it to put on the
 * screen at once. A portal that showed every stakeholder's every year by
 * default would be the slowest page in the product on the day it shipped.
 */
export interface PortalScope {
  /** A department id, or null for every stakeholder at once. */
  stakeholderId: EntityId | null;
  /**
   * How far back to read.
   *
   * What keeps the first read bounded. A search replaces it with "all":
   * somebody looking for a task by name is not asking about a date, and finding
   * nothing because it was booked last spring would be a fault they could not
   * see.
   */
  range: PortalRange;
}

/**
 * How much of the past the portal is showing.
 *
 * Two units, because two questions are asked of it. "The last three months" is
 * what somebody following their own work means — a rolling window, ending
 * today, that does not empty out every January. A calendar year is what
 * somebody reviewing means: a fixed period everybody can name. Everything is
 * the third, for a search or a count.
 */
export type PortalRange = { kind: "months"; months: number } | { kind: "year"; year: number } | { kind: "all" };

/** The rolling windows offered, in months. */
export const PORTAL_MONTH_RANGES = [1, 3, 6] as const;

/**
 * What a link with nothing to say opens on.
 *
 * Three months: long enough to hold a campaign's worth of work, short enough
 * that the first read stays small on a portal carrying every stakeholder at
 * once. A visitor who wants more picks it, and their choice lives in the URL.
 */
export const DEFAULT_PORTAL_RANGE: PortalRange = { kind: "months", months: 3 };

/** The whole of it: what a search runs against, and what the counts are taken over. */
export const EVERY_PORTAL_RANGE: PortalRange = { kind: "all" };

/** As it travels: "3m", "2026", "all". Short enough to read in a URL. */
export function formatPortalRange(range: PortalRange): string {
  if (range.kind === "months") return `${range.months}m`;
  if (range.kind === "year") return String(range.year);
  return "all";
}

/** The other way. Anything unrecognised is null, so a caller may fall back deliberately. */
export function parsePortalRange(value: string | null | undefined): PortalRange | null {
  if (!value) return null;
  if (value === "all") return EVERY_PORTAL_RANGE;
  const months = /^(\d{1,2})m$/.exec(value);
  if (months) {
    const count = Number(months[1]);
    return (PORTAL_MONTH_RANGES as readonly number[]).includes(count) ? { kind: "months", months: count } : null;
  }
  return /^\d{4}$/.test(value) ? { kind: "year", year: Number(value) } : null;
}

/** Whether a moment falls inside the range, measured from `now`. */
export function withinPortalRange(iso: string, range: PortalRange, now: Date = new Date()): boolean {
  if (range.kind === "all") return true;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  if (range.kind === "year") return at.getUTCFullYear() === range.year;
  // Calendar months back, not thirty-day blocks: "three months" means the same
  // day three months ago, which is what a person counting back would say.
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - range.months);
  return at.getTime() >= from.getTime();
}

/** How a range reads on screen. */
export function portalRangeLabel(range: PortalRange): string {
  if (range.kind === "all") return "All time";
  if (range.kind === "year") return String(range.year);
  return range.months === 1 ? "Last month" : `Last ${range.months} months`;
}

export const ALL_STAKEHOLDERS = "all";

/** One stakeholder as the portal's selector offers it. */
export interface PortalStakeholderOption {
  id: EntityId;
  name: string;
  color: ColorToken;
  /** How many requests they have, across every year. */
  count: number;
}

// ---- reconciling departments with the stakeholder-groups list ---------------

/** One option as Settings → Lists holds it: a word and a colour, with no id. */
export interface DepartmentOption {
  name: string;
  color: ColorToken;
}

/** What a save has to do to the department table to match the list. */
export interface DepartmentReconciliation {
  create: Array<{ name: string; color: ColorToken; position: number }>;
  update: Array<{ id: EntityId; name?: string; color?: ColorToken; position?: number; status?: DepartmentStatus }>;
  /** Departments whose group left the list. Disabled, never deleted. */
  disable: EntityId[];
}

function key(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Works out how the department table should change when the stakeholder-groups
 * list is saved.
 *
 * Identity comes from the rename map the editor produces, not from matching
 * names after the fact. That distinction is the whole point: if the list is
 * saved with "Comm." gone and "Communications" present, only the person who
 * made the change knows whether that was a rename — in which case the
 * department keeps its portal, its link and its history — or a deletion and an
 * unrelated addition, in which case the new one must start empty. Guessing from
 * the strings would sometimes silently hand one department's requests to
 * another.
 *
 * A department whose group has left is disabled rather than removed, so its
 * requests keep their provenance and its link stops opening. Re-adding the same
 * word later makes a *new* department: the old one is still sitting there
 * disabled, holding its own history, and nothing about a matching name entitles
 * a newcomer to it.
 */
export function reconcileDepartments(
  existing: readonly StakeholderDepartment[],
  options: readonly DepartmentOption[],
  renames: Readonly<Record<string, string>> = {},
): DepartmentReconciliation {
  const active = existing.filter((d) => d.status === "ACTIVE");
  const byName = new Map(active.map((d) => [key(d.name), d]));

  // A rename moves a department's claim from the old word to the new one before
  // anything is matched, so the new word finds the department that owns it.
  const claimed = new Map<string, StakeholderDepartment>();
  const renamed = new Set<EntityId>();
  for (const [from, to] of Object.entries(renames)) {
    if (key(from) === key(to)) continue;
    const department = byName.get(key(from));
    if (!department || renamed.has(department.id)) continue;
    claimed.set(key(to), department);
    renamed.add(department.id);
  }

  const create: DepartmentReconciliation["create"] = [];
  const update: DepartmentReconciliation["update"] = [];
  const kept = new Set<EntityId>();

  options.forEach((option, position) => {
    const k = key(option.name);
    const department = claimed.get(k) ?? (renamed.has(byName.get(k)?.id ?? "") ? undefined : byName.get(k));
    if (!department) {
      create.push({ name: option.name.trim(), color: option.color, position });
      return;
    }
    kept.add(department.id);
    const patch: DepartmentReconciliation["update"][number] = { id: department.id };
    if (department.name !== option.name.trim()) patch.name = option.name.trim();
    if (department.color !== option.color) patch.color = option.color;
    if (department.position !== position) patch.position = position;
    if (Object.keys(patch).length > 1) update.push(patch);
  });

  const disable = active.filter((d) => !kept.has(d.id)).map((d) => d.id);
  return { create, update, disable };
}

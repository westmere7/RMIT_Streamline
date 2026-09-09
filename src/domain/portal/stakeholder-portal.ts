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
 * One portal per department, and the credentials that open it.
 *
 * The token is the whole of the authorisation: unguessable, and worth nothing
 * once regenerated. `credentialVersion` is what makes revocation immediate — a
 * grant carries the version it was issued under, so bumping it invalidates
 * every grant already handed out, including the one held by a tab that is open
 * right now. Changing or clearing the password bumps it too.
 */
export interface DepartmentPortal extends Timestamps {
  id: EntityId;
  workspaceId: EntityId;
  departmentId: EntityId;
  /** Off keeps the row and the token but serves nothing — neither browsing nor booking. */
  enabled: boolean;
  /** The secret in the link (/portal/<token>). */
  token: string;
  /** `pbkdf2$<iterations>$<salt>$<hash>`, or null when the portal asks for no password. */
  passwordHash: string | null;
  /** Bumped by a link regeneration or any password change; every older grant dies with it. */
  credentialVersion: number;
  defaultTheme: PortalTheme;
}

export type DepartmentPortalInput = Pick<DepartmentPortal, "workspaceId" | "departmentId" | "enabled" | "token" | "passwordHash" | "defaultTheme">;

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
 * Deliberately thin. It names the department and the team, because the person
 * holding the link already knows both, and nothing else — no counts, no task
 * names, no hint that another department exists.
 */
export interface PortalGate {
  open: boolean;
  refusal: PortalRefusal | null;
  needsPassword: boolean;
  departmentName: string;
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

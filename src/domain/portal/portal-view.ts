import type { ColorToken, EntityId, ISODate } from "@/domain/common/types";
import type { PortalTheme } from "@/domain/portal/stakeholder-portal";

/**
 * What a stakeholder is allowed to see.
 *
 * Every type here is an allowlist written out field by field. Nothing in the
 * portal's responses is spread from a repository row, and nothing is "the item
 * minus a few things" — the difference matters, because a column added to
 * `items` later would quietly join a subtraction and would not join this.
 *
 * Three things are deliberately absent and must stay absent:
 *
 *  · `item.description`. The booking writer appends every answer the receiving
 *    board had no column for — the requester's name, their email address, the
 *    department they typed — under a "Request details" heading. The brief the
 *    requester actually wrote is captured separately at booking time.
 *  · People. A request names the person in charge by display name and avatar
 *    colour; the workspace's directory, emails and profiles are nobody's
 *    business at the end of a link.
 *  · Anything from another department, and anything internal: comments,
 *    activity, hidden columns, asset notes, allocation chatter, board internals.
 */

/** Somebody's name and face, and nothing else about them. */
export interface PortalPerson {
  id: EntityId;
  displayName: string;
  initials: string;
  color: ColorToken;
}

/**
 * A status as the portal shows it.
 *
 * `role` is the semantic the board assigns — done, stuck, working — carried
 * across so the portal can group and colour consistently even when two boards
 * spell their statuses differently. The label's own id never travels: it means
 * nothing outside its board and inviting anyone to reason about it would be
 * inviting them to reason about a board they cannot see.
 */
export interface PortalStatus {
  name: string;
  color: ColorToken;
  role: "done" | "stuck" | "working" | "pending";
}

export interface PortalPriority {
  name: string;
  color: ColorToken;
  /** 0–3, so a portal can sort and chart without knowing a board's label ids. */
  strength: number;
}

/** One deliverable, as a summary. Notes and URLs stay internal unless approved. */
export interface PortalDeliverable {
  id: EntityId;
  name: string;
  assetType: string | null;
  quantity: number;
  dueDate: ISODate | null;
  done: boolean;
  assignees: PortalPerson[];
}

export interface PortalSubitem {
  id: EntityId;
  name: string;
  done: boolean;
}

/**
 * A linked task, named only as far as it is allowed to be.
 *
 * A request's origin may be linked to work on boards this department has no
 * claim on. Those appear as a count and, where the link is inside the portal's
 * own scope, a summary. Anything out of scope is `restricted: true` with no
 * name — the indicator says work exists, never what it is called.
 */
export interface PortalLinkedTask {
  id: EntityId | null;
  restricted: boolean;
  name: string | null;
  status: PortalStatus | null;
  boardName: string | null;
}

/** One request in the portal's list. */
export interface PortalTask {
  id: EntityId;
  /** The short code the stakeholder was given at booking time. */
  reference: string | null;
  name: string;
  status: PortalStatus | null;
  priority: PortalPriority | null;
  dueDate: ISODate | null;
  timeline: { start: ISODate | null; end: ISODate | null } | null;
  people: PortalPerson[];
  /** The board this came from, when that label is approved for publication. */
  sourceName: string | null;
  deliverables: { total: number; done: number };
  subitems: { total: number; done: number };
  linkedCount: number;
  bookedAt: string;
  updatedAt: string;
}

/** One request, opened. */
export interface PortalTaskDetail extends PortalTask {
  /** The requester's own words. Never `item.description`. */
  brief: string | null;
  fullDeliverables: PortalDeliverable[];
  fullSubitems: PortalSubitem[];
  linked: PortalLinkedTask[];
  /** True when this visitor may comment and edit assets on this concrete task. */
  canAct: boolean;
}

/** A page of requests, plus figures computed over the whole authorised set. */
export interface PortalTaskPage {
  tasks: PortalTask[];
  nextCursor: string | null;
  /** Totals across every authorised request, not just this page. */
  totals: PortalTotals;
  /** When the server assembled this. Shown so stale data is visible as stale. */
  servedAt: string;
}

export interface PortalTotals {
  requests: number;
  done: number;
  overdue: number;
  /** Counts by status name, over the full authorised set. */
  byStatus: Array<{ name: string; color: ColorToken; count: number }>;
  /** Counts by person in charge. A task with two owners counts under both; `requests` does not double. */
  byPerson: Array<{ person: PortalPerson; count: number }>;
  bySource: Array<{ name: string; count: number }>;
}

/** Everything the portal shell needs once the gate has opened. */
export interface PortalContext {
  departmentName: string;
  departmentColor: ColorToken;
  creativeTeamName: string;
  defaultTheme: PortalTheme;
  /** True when this visitor is signed in as somebody the workspace knows. */
  signedIn: boolean;
  /** The display name to show in the account control, when signed in. */
  viewerName: string | null;
}

/** What the portal's own search matches on, and returns. */
export interface PortalSearchResult {
  tasks: PortalTask[];
  /** How many matched in total, so "showing 20 of 64" is honest. */
  matched: number;
}

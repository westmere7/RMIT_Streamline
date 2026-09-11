import type { PublicBoardPayload } from "@/domain/board/board-share";
import type { ColorToken, EntityId, ISODate } from "@/domain/common/types";
import type { PortalStakeholderOption, PortalTheme, PortalView } from "@/domain/portal/stakeholder-portal";

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

/** The stakeholder a request is for, as the portal names them. */
export interface PortalStakeholderRef {
  id: EntityId;
  name: string;
  color: ColorToken;
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
  /**
   * Who the work is for.
   *
   * On a portal showing every stakeholder at once this is the column that makes
   * the list readable; with one stakeholder selected it says the same thing on
   * every row and the projection leaves the column out.
   */
  stakeholder: PortalStakeholderRef | null;
  /**
   * The kinds of thing the request asked for, as the requester named them.
   *
   * A property of the request, not of its deliverables: a deliverable only
   * carries a type when the request named exactly one, so this is what a
   * request that picked "Print" and "Social" has to show.
   */
  assetTypes: string[];
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
  /** Deliverables across every request: how many lines, how many finished, how many kinds. */
  deliverables: { total: number; done: number; types: number };
}

/** Everything the portal shell needs once the gate has opened. */
export interface PortalContext {
  /** What the portal calls itself: the creative team's name. */
  portalName: string;
  creativeTeamName: string;
  /**
   * Every stakeholder with work to show, for the selector.
   *
   * Named only after the gate has opened. Before that, a list of the team's
   * stakeholders is not something a URL should be able to enumerate.
   */
  stakeholders: PortalStakeholderOption[];
  /** Which one is selected, or null for all of them. */
  stakeholderId: EntityId | null;
  /** The years that have requests in them, newest first, for the range picker. */
  years: number[];
  /** How far back is being shown, as it travels: "3m", "2026", "all". */
  range: string;
  defaultTheme: PortalTheme;
  /** True when this visitor is signed in as somebody the workspace knows. */
  signedIn: boolean;
  /** The display name to show in the account control, when signed in. */
  viewerName: string | null;
  /** The team's own line about the portal, under its name. */
  description: string | null;
  /** Which view the link opens on. */
  defaultView: PortalView;
  /** Whether this link takes new requests, or is a reading link only. */
  allowBooking: boolean;
  /** Whether the figures appear in the header. */
  showRecap: boolean;
}

/** What the portal's own search matches on, and returns. */
export interface PortalSearchResult {
  tasks: PortalTask[];
  /** How many matched in total, so "showing 20 of 64" is honest. */
  matched: number;
}

/**
 * The portal's requests arranged as a board.
 *
 * `PublicBoardPayload` is the shape the public board link already produces, so
 * the portal reuses the whole read-only data layer and every view built on it.
 * The totals ride along because they are computed over the full set on the
 * server, where the rule about what counts as done lives.
 */
export interface PortalBoardPayload extends PublicBoardPayload {
  totals: PortalTotals;
  /** When the server assembled this. Shown so stale data is visible as stale. */
  servedAt: string;
}

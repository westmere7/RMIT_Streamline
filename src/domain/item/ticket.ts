import type { EntityId } from "@/domain/common/types";

/**
 * A task's ticket: "CP_014".
 *
 * The code a stakeholder quotes in an email, a chat or a corridor, and the one
 * thing about a task that has to mean exactly one task. A prefix the workspace
 * chooses, an underscore, and the number the workspace is up to — so tickets
 * read in the order the work arrived, and a gap in them is a real gap.
 *
 * Booking hands one out. A task that arrived some other way starts without one
 * and can be given the next in the series with a click.
 */

/** What a workspace stamps on its tickets until somebody changes it. */
export const DEFAULT_TICKET_PREFIX = "CP";

/** Long enough for "CREATIVE", short enough to stay in a narrow column. */
export const TICKET_PREFIX_MAX = 8;

/** "CP_014", not "CP_14": three digits until a workspace outgrows them. */
export const TICKET_DIGITS = 3;

/** What the database will store: a full prefix, the underscore, and room to count well past a million. */
export const TICKET_MAX = TICKET_PREFIX_MAX + 1 + 9;

/** Letters and digits only — the underscore is the separator, so it cannot also be in the prefix. */
const PREFIX_SHAPE = /^[A-Z0-9]{1,8}$/;
const TICKET_SHAPE = /^([A-Z0-9]{1,8})_(\d{1,9})$/;

/** A ticket, split into the two things it is made of, or null if it is not one. */
export interface TicketParts {
  prefix: string;
  /** 1 or greater. The stored form pads it to at least {@link TICKET_DIGITS}. */
  number: number;
}

/**
 * Tidies what someone typed into a prefix, or gives back null if nothing is left.
 *
 * Upper case, letters and digits only, at most {@link TICKET_PREFIX_MAX}. A
 * prefix with a space or a dash in it is not rejected with a lecture — the
 * offending characters are simply not part of a prefix.
 */
export function normaliseTicketPrefix(value: string | null | undefined): string | null {
  const cleaned = (value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, TICKET_PREFIX_MAX);
  return PREFIX_SHAPE.test(cleaned) ? cleaned : null;
}

/** The workspace's prefix, with the default standing in for one never set. */
export function ticketPrefixOf(prefix: string | null | undefined): string {
  return normaliseTicketPrefix(prefix) ?? DEFAULT_TICKET_PREFIX;
}

/** Builds the stored form: "CP" and 14 make "CP_014". */
export function formatTicket(prefix: string | null | undefined, number: number): string {
  const n = Math.max(1, Math.floor(number));
  return `${ticketPrefixOf(prefix)}_${String(n).padStart(TICKET_DIGITS, "0")}`;
}

/** Reads a ticket back into its prefix and number, or null if it is not a ticket. */
export function parseTicket(value: string | null | undefined): TicketParts | null {
  const match = TICKET_SHAPE.exec((value ?? "").trim().toUpperCase());
  if (!match) return null;
  const number = Number(match[2]);
  return number >= 1 ? { prefix: match[1]!, number } : null;
}

/**
 * Tidies what someone typed into a ticket, or null if it cannot be one.
 *
 * Upper case, and lenient about the separator: a ticket read off a printout as
 * "cp-14" or "cp 14" is the one they meant. What it will not do is invent a
 * shape — "hello" is not a ticket and comes back null, so a field that fails to
 * parse can say so instead of storing rubbish.
 */
export function normaliseTicket(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (raw.length === 0) return null;
  const parts = parseTicket(raw.replace(/[\s-]+/g, "_"));
  return parts ? formatTicket(parts.prefix, parts.number) : null;
}

/** True if this is a ticket in the stored form. */
export function isTicket(value: string | null | undefined): boolean {
  return parseTicket(value) !== null && normaliseTicket(value) === (value ?? "").trim().toUpperCase();
}

/**
 * The same ticket under a different prefix: "CP_014" becomes "PROD_014".
 *
 * What a workspace changing its prefix does to the tickets already out in the
 * world, if it asks for that. The number is what people count by and never moves.
 */
export function withTicketPrefix(ticket: string | null | undefined, prefix: string): string | null {
  const parts = parseTicket(ticket);
  return parts ? formatTicket(prefix, parts.number) : null;
}

/** What a match on a ticket is allowed to ignore, so "cp14" finds CP_014. */
export function ticketSearchKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^([a-z]*?)0*(\d)/, "$1$2");
}

/** A task and the ticket it holds, for the checks that have to look across a workspace. */
export interface TicketHolder {
  id: EntityId;
  ticket?: string | null;
}

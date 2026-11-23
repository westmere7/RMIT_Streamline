import type { ISODate } from "@/domain";

/**
 * The timezone every dashboard date is read in: the reader's, which is also
 * what "today" is. One workspace, one working day; shown on the page.
 */
export const BUSINESS_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const LOCAL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/**
 * The day a moment fell on, in the timezone the page is read in (the same one
 * "today" is), not in UTC. Timestamps are stored in UTC, and cutting the date
 * off them put anything made between midnight and 7am in Vietnam on the day
 * before. A value that is already a plain date is that date.
 */
export function localDateOf(value: string, timeZone: string = BUSINESS_TIMEZONE): ISODate {
  if (value.length <= 10) return value;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return value.slice(0, 10);
  const format = timeZone === BUSINESS_TIMEZONE ? LOCAL_DAY : new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  return format.format(at);
}

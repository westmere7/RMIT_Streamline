/**
 * How the plain date, time and date-and-time columns write their values, and
 * the Booking time column, which is a date-and-time the board did not type.
 *
 * One settings shape for all of them: a date format and a time format, each
 * column reading the half it needs. The defaults are the compact ones,
 * "Sep 16" and "19:06", because a board shows these in a column a hundred
 * and something pixels wide.
 */

export const DATE_FORMATS = ["short", "medium", "numeric", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ["24h", "12h"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

export interface DateTimeColumnSettings {
  kind: "datetime";
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

export const DEFAULT_DATE_TIME_SETTINGS: DateTimeColumnSettings = { kind: "datetime", dateFormat: "short", timeFormat: "24h" };

/** What each format looks like, for the menu that picks one. */
export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  short: "Sep 16",
  medium: "16 Sep 2026",
  numeric: "16/09/2026",
  iso: "2026-09-16",
};

export const TIME_FORMAT_LABELS: Record<TimeFormat, string> = {
  "24h": "19:06",
  "12h": "7:06 PM",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** The settings a column carries, or the defaults for one saved before it had any. */
export function dateTimeSettings(settings: { kind: string } | null | undefined): DateTimeColumnSettings {
  if (settings && settings.kind === "datetime") {
    const s = settings as Partial<DateTimeColumnSettings>;
    return {
      kind: "datetime",
      dateFormat: (DATE_FORMATS as readonly string[]).includes(s.dateFormat ?? "") ? (s.dateFormat as DateFormat) : DEFAULT_DATE_TIME_SETTINGS.dateFormat,
      timeFormat: (TIME_FORMATS as readonly string[]).includes(s.timeFormat ?? "") ? (s.timeFormat as TimeFormat) : DEFAULT_DATE_TIME_SETTINGS.timeFormat,
    };
  }
  return DEFAULT_DATE_TIME_SETTINGS;
}

/**
 * A calendar day in the chosen format. The short form leaves the year off
 * when it is this year, and says it when it is not, so "Sep 16" is never
 * last year's September without saying so.
 */
export function formatDay(year: number, month: number, day: number, format: DateFormat, now: Date = new Date()): string {
  switch (format) {
    case "short":
      return year === now.getFullYear() ? `${MONTHS[month - 1]} ${day}` : `${MONTHS[month - 1]} ${day}, ${year}`;
    case "medium":
      return `${day} ${MONTHS[month - 1]} ${year}`;
    case "numeric":
      return `${pad(day)}/${pad(month)}/${year}`;
    case "iso":
      return `${year}-${pad(month)}-${pad(day)}`;
  }
}

/** "2026-09-16" as the column shows it. Null for anything that is not a date. */
export function formatPlainDate(date: string | null | undefined, format: DateFormat, now?: Date): string | null {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!m) return null;
  return formatDay(Number(m[1]), Number(m[2]), Number(m[3]), format, now);
}

/** "19:06" as the column shows it. */
export function formatClockTime(hours: number, minutes: number, format: TimeFormat): string {
  if (format === "24h") return `${pad(hours)}:${pad(minutes)}`;
  const h = hours % 12 === 0 ? 12 : hours % 12;
  return `${h}:${pad(minutes)} ${hours < 12 ? "AM" : "PM"}`;
}

/** A stored "HH:MM" as the column shows it. Null for anything that is not a time. */
export function formatTimeOfDay(time: string | null | undefined, format: TimeFormat): string | null {
  const m = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null;
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return formatClockTime(hours, minutes, format);
}

/** A moment, in the viewer's own time zone: "Sep 16, 19:06". */
export function formatDateTime(iso: string | null | undefined, settings: Pick<DateTimeColumnSettings, "dateFormat" | "timeFormat">, now?: Date): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const day = formatDay(at.getFullYear(), at.getMonth() + 1, at.getDate(), settings.dateFormat, now);
  return `${day}, ${formatClockTime(at.getHours(), at.getMinutes(), settings.timeFormat)}`;
}

/** Normalises what somebody typed into a time field — "9:5", "0930", "7pm" — to "HH:MM", or null. */
export function parseTimeOfDay(input: string): string | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  const m = /^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (m[3] === "pm" ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

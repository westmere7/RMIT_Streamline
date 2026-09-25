/**
 * The Countdown column: a moment the board is counting down to, shown as the
 * time left in whatever unit suits it. A minute to go reads "1m", a fortnight
 * "2w", a quarter "3mo".
 *
 * The cell stores the end moment, never the time left, so every viewer counts
 * down to the same point and nothing has to be written as time passes.
 *
 * Months are calendar months, counted the way a person would: 31 Jan to 28 Feb
 * is one month. Everything below a month is fixed: weeks, days, hours, minutes.
 */

export const COUNTDOWN_STYLES = ["compact", "words"] as const;
export type CountdownStyle = (typeof COUNTDOWN_STYLES)[number];

/** How many units to show: the largest alone, or the largest and the next one down. */
export const COUNTDOWN_PRECISIONS = [1, 2] as const;
export type CountdownPrecision = (typeof COUNTDOWN_PRECISIONS)[number];

/** What the cell says once the moment has passed. */
export const COUNTDOWN_ENDINGS = ["over", "ended"] as const;
export type CountdownEnding = (typeof COUNTDOWN_ENDINGS)[number];

/** How close to the end the countdown turns amber. */
export const COUNTDOWN_WARNINGS = ["none", "1h", "1d", "3d", "1w"] as const;
export type CountdownWarning = (typeof COUNTDOWN_WARNINGS)[number];

export interface CountdownColumnSettings {
  kind: "countdown";
  style: CountdownStyle;
  precision: CountdownPrecision;
  ending: CountdownEnding;
  warnWithin: CountdownWarning;
}

export const DEFAULT_COUNTDOWN_SETTINGS: CountdownColumnSettings = { kind: "countdown", style: "compact", precision: 2, ending: "over", warnWithin: "1d" };

/** What each choice looks like, for the menu that picks one. */
export const COUNTDOWN_STYLE_LABELS: Record<CountdownStyle, string> = { compact: "3d 4h", words: "3 days 4 hours" };
export const COUNTDOWN_PRECISION_LABELS: Record<CountdownPrecision, string> = { 1: "Largest unit only", 2: "Two units" };
export const COUNTDOWN_ENDING_LABELS: Record<CountdownEnding, string> = { over: "Count up: 2h over", ended: "Say “Ended”" };
export const COUNTDOWN_WARNING_LABELS: Record<CountdownWarning, string> = { none: "Never", "1h": "Last hour", "1d": "Last day", "3d": "Last 3 days", "1w": "Last week" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const WARNING_MS: Record<CountdownWarning, number> = { none: 0, "1h": HOUR, "1d": DAY, "3d": 3 * DAY, "1w": WEEK };
const UNIT_MS: Record<Exclude<CountdownUnit, "mo">, number> = { w: WEEK, d: DAY, h: HOUR, m: MINUTE };

export type CountdownUnit = "mo" | "w" | "d" | "h" | "m";
const UNIT_ORDER: CountdownUnit[] = ["mo", "w", "d", "h", "m"];
const UNIT_WORDS: Record<CountdownUnit, [string, string]> = { mo: ["month", "months"], w: ["week", "weeks"], d: ["day", "days"], h: ["hour", "hours"], m: ["minute", "minutes"] };

/** The settings a column carries, or the defaults for one saved without them. */
export function countdownSettings(settings: { kind: string } | null | undefined): CountdownColumnSettings {
  if (!settings || settings.kind !== "countdown") return DEFAULT_COUNTDOWN_SETTINGS;
  const s = settings as Partial<CountdownColumnSettings>;
  const pick = <T>(options: readonly T[], value: T | undefined, fallback: T): T => (value !== undefined && options.includes(value) ? value : fallback);
  return {
    kind: "countdown",
    style: pick(COUNTDOWN_STYLES, s.style, DEFAULT_COUNTDOWN_SETTINGS.style),
    precision: pick(COUNTDOWN_PRECISIONS, s.precision, DEFAULT_COUNTDOWN_SETTINGS.precision),
    ending: pick(COUNTDOWN_ENDINGS, s.ending, DEFAULT_COUNTDOWN_SETTINGS.ending),
    warnWithin: pick(COUNTDOWN_WARNINGS, s.warnWithin, DEFAULT_COUNTDOWN_SETTINGS.warnWithin),
  };
}

/** `months` calendar months on, keeping the time of day and holding the 31st to a short month's last day. */
export function addMonths(from: Date, months: number): Date {
  const target = new Date(from.getFullYear(), from.getMonth() + months, 1, from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds());
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(from.getDate(), lastDay));
  return target;
}

/** The span between two moments in whole units, largest first, zeros left in. */
export function splitSpan(from: Date, to: Date): Record<CountdownUnit, number> {
  let months = 0;
  while (addMonths(from, months + 1).getTime() <= to.getTime()) months++;
  let rest = to.getTime() - addMonths(from, months).getTime();
  const take = (size: number) => {
    const n = Math.floor(rest / size);
    rest -= n * size;
    return n;
  };
  return { mo: months, w: take(WEEK), d: take(DAY), h: take(HOUR), m: take(MINUTE) };
}

/**
 * A span as the column writes it: the largest unit that is not zero, then the
 * next one down if the column shows two and it is not zero either. "2d", never
 * "2d 0h"; and "1mo 3d" is not a thing, because weeks sit between them.
 */
export function formatSpan(parts: Record<CountdownUnit, number>, style: CountdownStyle, precision: CountdownPrecision): string {
  const first = UNIT_ORDER.findIndex((unit) => parts[unit] > 0);
  if (first < 0) return style === "compact" ? "0m" : "0 minutes";
  const units: CountdownUnit[] = [UNIT_ORDER[first]!];
  const next = UNIT_ORDER[first + 1];
  if (precision === 2 && next && parts[next] > 0) units.push(next);
  return units.map((unit) => (style === "compact" ? `${parts[unit]}${unit}` : `${parts[unit]} ${UNIT_WORDS[unit][parts[unit] === 1 ? 0 : 1]}`)).join(" ");
}

export type CountdownTone = "normal" | "warning" | "over" | "ended";

export interface CountdownReading {
  text: string;
  tone: CountdownTone;
}

/** What the cell shows for an end moment, now. Null for no end set. */
export function readCountdown(at: string | null | undefined, settings: CountdownColumnSettings, now: Date = new Date()): CountdownReading | null {
  if (!at) return null;
  const end = new Date(at);
  if (Number.isNaN(end.getTime())) return null;
  const left = end.getTime() - now.getTime();
  if (left <= 0) {
    if (settings.ending === "ended") return { text: "Ended", tone: "ended" };
    // Under a minute past still reads as the moment itself.
    if (-left < MINUTE) return { text: "Now", tone: "over" };
    return { text: `${formatSpan(splitSpan(end, now), settings.style, settings.precision)} over`, tone: "over" };
  }
  const warning = settings.warnWithin !== "none" && left <= WARNING_MS[settings.warnWithin];
  // Rounded up in the smallest unit shown, the way a timer counts: set to
  // "3d 4h" it reads "3d 4h" until it is 3d 3h, set to "2mo" it reads "2mo"
  // rather than "1mo 4w", and it reads "1m" through the last minute.
  const plain = splitSpan(now, end);
  const found = UNIT_ORDER.findIndex((unit) => plain[unit] > 0);
  const first = found < 0 ? UNIT_ORDER.length - 1 : found;
  const smallest = UNIT_ORDER[Math.min(first + settings.precision - 1, UNIT_ORDER.length - 1)]!;
  const upTo = smallest === "mo" ? new Date(addMonths(end, 1).getTime() - 1) : new Date(end.getTime() + UNIT_MS[smallest] - 1);
  return { text: formatSpan(splitSpan(now, upTo), settings.style, settings.precision), tone: warning ? "warning" : "normal" };
}

const DURATION_UNITS: Array<[RegExp, CountdownUnit]> = [
  [/^(mo|mos|mon|mons|month|months)$/, "mo"],
  [/^(w|wk|wks|week|weeks)$/, "w"],
  [/^(d|day|days)$/, "d"],
  [/^(h|hr|hrs|hour|hours)$/, "h"],
  [/^(m|min|mins|minute|minutes)$/, "m"],
];

/**
 * What somebody typed as a time from now — "45m", "3h", "2w", "4mo",
 * "1h 30m", "2 days" — as the moment it ends. Null for anything that is not a
 * duration, or one under a minute. "m" is minutes; months are "mo".
 */
export function parseCountdownDuration(input: string, now: Date = new Date()): Date | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const tokens = [...text.matchAll(/(\d+)\s*([a-z]+)/g)];
  // Every character has to belong to a number-and-unit pair (spaces and commas aside).
  if (!tokens.length || text.replace(/(\d+)\s*([a-z]+)/g, "").replace(/[\s,]|and/g, "") !== "") return null;
  let months = 0;
  let ms = 0;
  for (const [, amount, word] of tokens) {
    const unit = DURATION_UNITS.find(([pattern]) => pattern.test(word ?? ""))?.[1];
    if (!unit) return null;
    const n = Number(amount);
    if (unit === "mo") months += n;
    else ms += n * { w: WEEK, d: DAY, h: HOUR, m: MINUTE }[unit];
  }
  if (months === 0 && ms < MINUTE) return null;
  return new Date(addMonths(now, months).getTime() + ms);
}

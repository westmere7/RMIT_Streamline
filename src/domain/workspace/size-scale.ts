/**
 * What each T-shirt size means, in working time.
 *
 * A size is shorthand the team and its stakeholders already share: "that's an
 * M" means "about six weeks of work". The scale here writes that shorthand down
 * per workspace, so the size picker can say what each letter stands for and
 * where a task's own deliverables put it.
 *
 * A task's fit is its asset lines weighed by the workspace's output rates
 * (`effortHours`, asset-rate.ts), set against these spans. Everything is
 * derived at render time; the only thing stored on a task is the size itself,
 * and whether it follows its assets (`auto` on the SIZE value).
 *
 * The defaults are the GCMC project sizing sheet: XS a week of basic design
 * work up to XL, a campaign of three to six months.
 */
import type { TShirtSize } from "@/domain/board/column";
import { T_SHIRT_SIZES } from "@/domain/board/column";
import { HOURS_PER_WORKING_DAY, WORKING_DAYS_PER_WEEK } from "./asset-rate";

/** Units a span can be written in, in picker order. */
export const SIZE_SPAN_UNITS = ["hour", "day", "week", "month"] as const;
export type SizeSpanUnit = (typeof SIZE_SPAN_UNITS)[number];

/**
 * Working days in a month, for turning months into hours. A calendar month has
 * about 21 working days; like the day and the week, it is an assumption, named.
 */
export const WORKING_DAYS_PER_MONTH = 21;

const UNIT_HOURS: Record<SizeSpanUnit, number> = {
  hour: 1,
  day: HOURS_PER_WORKING_DAY,
  week: HOURS_PER_WORKING_DAY * WORKING_DAYS_PER_WEEK,
  month: HOURS_PER_WORKING_DAY * WORKING_DAYS_PER_MONTH,
};

export const SIZE_SPAN_UNIT_LABELS: Record<SizeSpanUnit, { one: string; many: string; short: string }> = {
  hour: { one: "hour", many: "hours", short: "h" },
  day: { one: "day", many: "days", short: "d" },
  week: { one: "week", many: "weeks", short: "wk" },
  month: { one: "month", many: "months", short: "mo" },
};

/** "2–4 weeks": `from` to `to` in `unit`. No `from` reads as just the upper end, "1 week". */
export interface SizeSpan {
  from: number | null;
  to: number;
  unit: SizeSpanUnit;
}

export interface SizeDefinition {
  span: SizeSpan;
  /** The kind of work, in a few words: "Design briefs". */
  scope: string;
  /** Typical jobs of this size, one per line. */
  examples: string[];
}

export type SizeScale = Record<TShirtSize, SizeDefinition>;

export const MAX_SIZE_SCOPE = 80;
export const MAX_SIZE_EXAMPLE = 160;
export const MAX_SIZE_EXAMPLES = 12;

/** The GCMC project sizing sheet. */
export const DEFAULT_SIZE_SCALE: SizeScale = {
  XS: {
    span: { from: null, to: 1, unit: "week" },
    scope: "Basic design work",
    examples: [
      "Sub-brand logo",
      "Resize an existing stock image",
      "A single branded assets file set up from existing design templates",
      "Pull-up banner artwork set up from an existing template",
    ],
  },
  S: {
    span: { from: 2, to: 4, unit: "week" },
    scope: "Design briefs",
    examples: [
      "Tool kits (at least 4 weeks)",
      "Basic print collateral (poster, postcard): all copy and images supplied in the brief, or it may be an M",
      "New or event photography",
      "Edits of existing video",
    ],
  },
  M: {
    span: { from: null, to: 6, unit: "week" },
    scope: "Design, creative or production briefs",
    examples: [
      "Print or digital assets",
      "Design assets with copywriting",
      "Content capture for a major event: footage and photography",
      "New design: brochures, collateral or other assets",
      "Event collateral and assets",
    ],
  },
  L: {
    span: { from: null, to: 8, unit: "week" },
    scope: "Creative or production briefs",
    examples: ["Large-scale sponsorship events (Brand)", "New video production", "Campaign asset rollout (design production off the asset tracker)"],
  },
  XL: {
    span: { from: 3, to: 6, unit: "month" },
    scope: "Campaign or creative briefs (large scale)",
    examples: ["OOH", "Campaign, end to end", "Publications", "Style guides", "Brand ad", "Major events (Open Day)"],
  },
};

function cleanNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/**
 * A stored scale made trustworthy. Junk-tolerant like the workspace's other
 * blobs: a size that is missing or makes no sense takes its default, so the
 * picker always has five sizes to describe.
 */
export function normaliseSizeScale(raw: unknown): SizeScale {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out = {} as SizeScale;
  for (const size of T_SHIRT_SIZES) {
    const fallback = DEFAULT_SIZE_SCALE[size];
    const entry = source[size] && typeof source[size] === "object" ? (source[size] as Partial<SizeDefinition>) : null;
    const span = entry?.span && typeof entry.span === "object" ? (entry.span as Partial<SizeSpan>) : null;
    const to = cleanNumber(span?.to);
    const unit = (SIZE_SPAN_UNITS as readonly string[]).includes(span?.unit as string) ? (span!.unit as SizeSpanUnit) : null;
    if (!entry || to === null || unit === null) {
      out[size] = { ...fallback, span: { ...fallback.span }, examples: [...fallback.examples] };
      continue;
    }
    const from = cleanNumber(span?.from);
    out[size] = {
      span: { from: from !== null && from < to ? from : null, to, unit },
      scope: typeof entry.scope === "string" ? entry.scope.trim().slice(0, MAX_SIZE_SCOPE) : fallback.scope,
      examples: Array.isArray(entry.examples)
        ? entry.examples
            .filter((e): e is string => typeof e === "string")
            .map((e) => e.trim().slice(0, MAX_SIZE_EXAMPLE))
            .filter(Boolean)
            .slice(0, MAX_SIZE_EXAMPLES)
        : [...fallback.examples],
    };
  }
  return out;
}

/** A span's ends in working hours. */
export function spanHours(span: SizeSpan): { from: number | null; to: number } {
  const per = UNIT_HOURS[span.unit];
  return { from: span.from === null ? null : span.from * per, to: span.to * per };
}

/** "2–4 weeks", "1 week", "3–6 months". */
export function formatSizeSpan(span: SizeSpan): string {
  const labels = SIZE_SPAN_UNIT_LABELS[span.unit];
  const unit = span.from === null && span.to === 1 ? labels.one : labels.many;
  return span.from === null ? `${num(span.to)} ${unit}` : `${num(span.from)}–${num(span.to)} ${unit}`;
}

/** "2–4 wk", for the picker's tiles. */
export function formatSizeSpanShort(span: SizeSpan): string {
  const short = SIZE_SPAN_UNIT_LABELS[span.unit].short;
  return span.from === null ? `${num(span.to)} ${short}` : `${num(span.from)}–${num(span.to)} ${short}`;
}

function num(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * What is wrong with a scale, in words, or null. Each size has to end later
 * than the one before it, or "the smallest size that fits" stops meaning
 * anything.
 */
export function sizeScaleProblem(scale: SizeScale): string | null {
  let previous: { size: TShirtSize; to: number } | null = null;
  for (const size of T_SHIRT_SIZES) {
    const span = scale[size].span;
    if (!(span.to > 0)) return `${size} needs a length.`;
    if (span.from !== null && !(span.from < span.to)) return `${size} has to start before it ends.`;
    const { to } = spanHours(span);
    if (previous && to <= previous.to) return `${size} has to end later than ${previous.size}.`;
    previous = { size, to };
  }
  return null;
}

/** Where a task's hours sit on the scale. */
export interface SizeFit {
  /** The smallest size whose span reaches these hours; XL when none does. */
  size: TShirtSize;
  /** More than even XL allows. */
  over: boolean;
  /**
   * Across the picker's row of five equal tiles, 0 to 1: the tile the size is
   * in, and how far through its span the hours go.
   */
  position: number;
}

export function sizeFit(hours: number, scale: SizeScale): SizeFit | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  let lower = 0;
  for (const [index, size] of T_SHIRT_SIZES.entries()) {
    const { to } = spanHours(scale[size].span);
    if (hours <= to) {
      const through = to > lower ? (hours - lower) / (to - lower) : 1;
      return { size, over: false, position: (index + Math.min(1, Math.max(0, through))) / T_SHIRT_SIZES.length };
    }
    lower = to;
  }
  return { size: "XL", over: true, position: 1 };
}

/** Hours in words with their working-day equivalent once they pass a day: "14 h · about 2 days". */
export function describeEffort(hours: number): string {
  const rounded = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10;
  const h = `${rounded.toLocaleString()} h`;
  if (hours < HOURS_PER_WORKING_DAY) return h;
  const days = hours / HOURS_PER_WORKING_DAY;
  if (days < WORKING_DAYS_PER_WEEK * 2) return `${h} · about ${Math.round(days * 10) / 10} days`;
  const weeks = days / WORKING_DAYS_PER_WEEK;
  return `${h} · about ${Math.round(weeks * 10) / 10} weeks`;
}

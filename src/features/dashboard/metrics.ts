import type { AssetRates, ISODate } from "@/domain";
import { effortHours as sumEffortHours } from "@/domain";
import { colorClasses, tagColorFor } from "@/lib/colors";
import type { AssetFact, DashboardFacts, TaskFact, TeamRef, Unit } from "./analytics";
import { NO_TEAM } from "./analytics";

/**
 * The reporting contracts behind the dashboard.
 *
 * Every figure the page shows is defined here, once, with its entity, its unit,
 * the date that places it in a period, and what it excludes — and the same
 * function that produces a number produces the records behind it, so a headline
 * and its drill-down cannot drift apart.
 *
 * Two rules run through the whole file and are worth stating before the code.
 *
 * **A period is a range of days, not a year number.** Comparing a year against
 * "the same span last year" is only honest when both spans have actually
 * elapsed; the dashboard used to compare four months of this year against
 * twelve of last and report the shortfall as a decline. `resolvePeriod` returns
 * matched ranges and says whether the current one is still running.
 *
 * **A missing value is not a zero.** No history is `null` and reads
 * "Unavailable"; a real zero baseline is a zero with no percentage. The two are
 * different answers and the page says which it is giving.
 */

// ---------------------------------------------------------------------------
// Time

/**
 * The timezone every date in this file is read in.
 *
 * One workspace, one working day. Dates in the database are already plain
 * `YYYY-MM-DD` strings written in local time, so this is a statement of what
 * they mean rather than a conversion — but it is stated, and shown to the
 * reader, because "overdue" is a claim about somebody's Tuesday.
 */
export const BUSINESS_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export const inRange = (date: ISODate | null, range: DateRange): boolean => !!date && date >= range.from && date <= range.to;

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (year: number, month: number, day: number): ISODate => `${year}-${pad(month)}-${pad(day)}`;
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/** The reporting period a reader has chosen, and the year they are comparing it with. */
export type PeriodMode = "ytd" | "year" | "quarter" | "month" | "custom";

export interface ReportingPeriod {
  mode: PeriodMode;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** 1–12. */
  month: number;
  /** Only for `custom`. */
  from: ISODate | null;
  to: ISODate | null;
  /** The year the period is compared against. */
  comparisonYear: number;
}

export interface ResolvedPeriod {
  current: DateRange;
  /** Null when the chosen comparison year cannot be aligned to this period. */
  comparison: DateRange | null;
  /** True when the current range has not finished yet — the totals are partial actuals. */
  partial: boolean;
  /** How the two ranges were aligned, for the label under the figures. */
  alignment: "elapsed" | "calendar";
  label: string;
  comparisonLabel: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * A period, and the matching span in the comparison year.
 *
 * Year-to-date aligns on the elapsed day: 1 January to today, against
 * 1 January to the same day last year. 29 February has no counterpart in a
 * common year and clamps to the 28th, which keeps the comparison a day short
 * rather than a year long.
 */
export function resolvePeriod(period: ReportingPeriod, today: ISODate): ResolvedPeriod {
  const { year, comparisonYear } = period;
  const sameDay = (target: number, month: number, day: number): ISODate => iso(target, month, Math.min(day, daysInMonth(target, month)));

  switch (period.mode) {
    case "ytd": {
      const [, m, d] = today.split("-").map(Number);
      const end = year === Number(today.slice(0, 4)) ? today : iso(year, 12, 31);
      const compareEnd = year === Number(today.slice(0, 4)) ? sameDay(comparisonYear, m!, d!) : iso(comparisonYear, 12, 31);
      return {
        current: { from: iso(year, 1, 1), to: end },
        comparison: { from: iso(comparisonYear, 1, 1), to: compareEnd },
        partial: end === today && today < iso(year, 12, 31),
        alignment: "elapsed",
        label: `${year} to ${monthDay(end)}`,
        comparisonLabel: `${comparisonYear} to ${monthDay(compareEnd)}`,
      };
    }
    case "year": {
      const end = iso(year, 12, 31);
      return {
        current: { from: iso(year, 1, 1), to: end },
        comparison: { from: iso(comparisonYear, 1, 1), to: iso(comparisonYear, 12, 31) },
        partial: today < end,
        alignment: "calendar",
        label: String(year),
        comparisonLabel: String(comparisonYear),
      };
    }
    case "quarter": {
      const first = (period.quarter - 1) * 3 + 1;
      const last = first + 2;
      return {
        current: { from: iso(year, first, 1), to: iso(year, last, daysInMonth(year, last)) },
        comparison: { from: iso(comparisonYear, first, 1), to: iso(comparisonYear, last, daysInMonth(comparisonYear, last)) },
        partial: today < iso(year, last, daysInMonth(year, last)),
        alignment: "calendar",
        label: `Q${period.quarter} ${year}`,
        comparisonLabel: `Q${period.quarter} ${comparisonYear}`,
      };
    }
    case "month": {
      const m = period.month;
      return {
        current: { from: iso(year, m, 1), to: iso(year, m, daysInMonth(year, m)) },
        comparison: { from: iso(comparisonYear, m, 1), to: iso(comparisonYear, m, daysInMonth(comparisonYear, m)) },
        partial: today < iso(year, m, daysInMonth(year, m)),
        alignment: "calendar",
        label: `${MONTHS[m - 1]} ${year}`,
        comparisonLabel: `${MONTHS[m - 1]} ${comparisonYear}`,
      };
    }
    case "custom": {
      const from = period.from ?? iso(year, 1, 1);
      const to = period.to ?? today;
      const shift = (value: ISODate): ISODate => {
        const [y, m, d] = value.split("-").map(Number);
        return sameDay(comparisonYear + (y! - year), m!, d!);
      };
      return {
        current: { from, to },
        comparison: { from: shift(from), to: shift(to) },
        partial: today < to,
        alignment: "calendar",
        label: `${monthDay(from)} – ${monthDay(to)}`,
        comparisonLabel: `${monthDay(shift(from))} – ${monthDay(shift(to))}`,
      };
    }
  }
}

function monthDay(date: ISODate): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]!.slice(0, 3)}`;
}

// ---------------------------------------------------------------------------
// Date basis

/**
 * Which date places a piece of work in a period.
 *
 * Completion is absent on purpose. A task has no completion event in this
 * schema: `TaskFact.completedAt` falls back to the item's last edit, so a task
 * renamed today would count as finished today. Created and due are real dates
 * and both are offered; a completion basis would be a fourth thing that looks
 * like a fact and is not.
 */
export const REPORTING_BASES = ["created", "due"] as const;
export type ReportingBasis = (typeof REPORTING_BASES)[number];

export const BASIS_LABELS: Record<ReportingBasis, string> = { created: "Requested", due: "Scheduled" };
export const BASIS_HINTS: Record<ReportingBasis, string> = {
  created: "Counted in the period the work was requested or created. Every task has this date.",
  due: "Counted in the period the work is due. Work with no due date is excluded and counted separately.",
};

/**
 * The reporting date of a task, or null when it has none under this basis.
 *
 * Nothing substitutes here. The old behaviour returned the creation date when a
 * task had no due date, which reported undated work as scheduled in the month
 * somebody happened to create it.
 */
export function reportingDate(task: TaskFact, basis: ReportingBasis): ISODate | null {
  return basis === "created" ? task.createdAt : task.dueDate;
}

export function assetReportingDate(asset: AssetFact, basis: ReportingBasis): ISODate | null {
  return basis === "created" ? asset.createdAt : (asset.dueDate ?? asset.taskDueDate);
}

// ---------------------------------------------------------------------------
// Counting, and comparing

const inTeams = (team: TeamRef, teamIds: string[] | null) => teamIds === null || teamIds.includes(team.id);

export interface VolumeSlice {
  tasks: TaskFact[];
  assets: AssetFact[];
  taskCount: number;
  assetUnits: number;
  /** Tasks the basis could not place — undated work under a due-date basis. */
  undatedTasks: number;
}

export function volumeIn(facts: DashboardFacts, range: DateRange, basis: ReportingBasis, teamIds: string[] | null): VolumeSlice {
  const tasks: TaskFact[] = [];
  let undated = 0;
  for (const task of facts.tasks) {
    if (!inTeams(task.team, teamIds)) continue;
    const date = reportingDate(task, basis);
    if (date === null) undated += 1;
    else if (inRange(date, range)) tasks.push(task);
  }
  const assets = facts.assets.filter((asset) => inTeams(asset.team, teamIds) && inRange(assetReportingDate(asset, basis), range));
  return {
    tasks,
    assets,
    taskCount: tasks.length,
    assetUnits: assets.reduce((sum, a) => sum + a.units, 0),
    undatedTasks: undated,
  };
}

/**
 * One figure against the same figure a year earlier.
 *
 * `comparison` is null when the comparison range predates anything the
 * workspace holds — that is "Unavailable", and it is not the same claim as
 * zero. `percent` is null when the baseline is zero, which the page renders as
 * "No percentage comparison" beside the absolute difference.
 */
export interface Comparison {
  current: number;
  comparison: number | null;
  delta: number | null;
  percent: number | null;
}

export function compare(current: number, comparison: number | null): Comparison {
  if (comparison === null) return { current, comparison: null, delta: null, percent: null };
  return {
    current,
    comparison,
    delta: current - comparison,
    percent: comparison > 0 ? ((current - comparison) / comparison) * 100 : null,
  };
}

/**
 * Whether the workspace holds anything at all for a range.
 *
 * A workspace that started in 2025 has no 2024, and reporting that as "0 tasks,
 * down 100%" would be a claim about a year nobody worked in. `earliest` is the
 * first task the reader is allowed to see.
 */
export function covered(range: DateRange, earliest: ISODate | null): boolean {
  return earliest !== null && range.to >= earliest;
}

/**
 * What a monthly series can measure.
 *
 * Effort is not one of the dashboard's selectable units — the toggle stays
 * tasks-or-assets, because those are what the team reports. It is a third
 * measure a series can be asked for, so the effort card can draw its own trend
 * without effort becoming a mode the whole page switches into.
 */
export type MeasureKind = Unit | "effort";

/** The three the page can be read in, in the order the toolbar offers them. */
export const MEASURES = ["effort", "tasks", "assets"] as const;

export const MEASURE_LABELS: Record<MeasureKind, string> = { effort: "Effort", tasks: "Tasks", assets: "Asset units" };
/** The word that follows a figure of this measure. */
export const MEASURE_UNITS: Record<MeasureKind, string> = { effort: "hours", tasks: "tasks", assets: "asset units" };

/**
 * What one task is worth in the measure the page is being read in.
 *
 * Every split on this page — by month, by team, by group, by person — is the
 * same set of tasks summed a different way, so the measure travels as a
 * function from a task to a number and nothing downstream has to know which
 * of the three it is. Effort needs the deliverables behind the task, which is
 * what `effortByTask` works out once for the whole snapshot.
 */
export type TaskValue = (task: TaskFact) => number;

export function taskValuer(measure: MeasureKind, effort: Map<string, number>): TaskValue {
  if (measure === "tasks") return () => 1;
  if (measure === "assets") return (task) => task.assetUnits;
  return (task) => effort.get(task.id) ?? 0;
}

/**
 * Hours per task: its deliverables, each weighed by its type's output rate.
 *
 * Worked out once over the whole snapshot rather than per panel, because
 * every measure-aware chart needs the same answer and the alternative is
 * walking the asset lines again in each of them.
 */
export function effortByTask(facts: DashboardFacts, rates: AssetRates): Map<string, number> {
  const lines = new Map<string, Array<{ type: string; units: number }>>();
  for (const asset of facts.assets) {
    const found = lines.get(asset.taskId);
    if (found) found.push({ type: asset.type, units: asset.units });
    else lines.set(asset.taskId, [{ type: asset.type, units: asset.units }]);
  }
  const hours = new Map<string, number>();
  for (const [taskId, own] of lines) hours.set(taskId, sumEffortHours(own, rates));
  return hours;
}

export interface VolumeReport {
  period: ResolvedPeriod;
  basis: ReportingBasis;
  current: VolumeSlice;
  comparison: VolumeSlice | null;
  tasks: Comparison;
  assetUnits: Comparison;
  /**
   * The same deliverables weighed by the workspace's output rates, in hours.
   *
   * Zero throughout when no rate has been recorded, which is why the page asks
   * `hasAnyRate` before leading with it rather than reading the total: an
   * unrated workspace has no effort to report, and nought hours against a
   * thousand deliverables would be a lie told with a real number.
   */
  effort: Comparison;
}

export function volumeReport(facts: DashboardFacts, period: ResolvedPeriod, basis: ReportingBasis, teamIds: string[] | null, rates: AssetRates = {}): VolumeReport {
  const current = volumeIn(facts, period.current, basis, teamIds);
  const hasHistory = period.comparison !== null && covered(period.comparison, facts.earliest);
  const comparison = hasHistory ? volumeIn(facts, period.comparison!, basis, teamIds) : null;
  return {
    period,
    basis,
    current,
    comparison,
    tasks: compare(current.taskCount, comparison?.taskCount ?? null),
    assetUnits: compare(current.assetUnits, comparison?.assetUnits ?? null),
    // Derived from the same deliverables the counts came from, so effort and
    // volume can never disagree about which period they are describing.
    effort: compare(sumEffortHours(current.assets, rates), comparison ? sumEffortHours(comparison.assets, rates) : null),
  };
}

// ---------------------------------------------------------------------------
// The month-by-month comparison

export interface MonthlyComparisonRow {
  /** 1–12. */
  month: number;
  label: string;
  current: number | null;
  comparison: number | null;
  delta: number | null;
  percent: number | null;
  /**
   * The comparison year's figure for a month the current period has not
   * reached — the rest of last year, in other words.
   *
   * Kept apart from `comparison` on purpose. The comparison is elapsed
   * against elapsed and stops where the current period stops, because that is
   * the only honest way to subtract two part-years; but the months after
   * today are the last thing a manager wants hidden, since they are the best
   * guide there is to what is coming. So they are drawn, in their own lighter
   * tone, and they are never part of a delta.
   */
  outlook: number | null;
}

/**
 * Twelve rows, aligned by month, for the two years being compared.
 *
 * A month the current period does not reach is `null` rather than zero — the
 * difference between "nothing happened in November" and "November has not
 * happened yet" is the whole point of the chart.
 */
export function monthlyComparison(
  facts: DashboardFacts,
  period: ResolvedPeriod,
  basis: ReportingBasis,
  unit: MeasureKind,
  teamIds: string[] | null,
  rates: AssetRates = {},
): MonthlyComparisonRow[] {
  const measure = (range: DateRange) => {
    const slice = volumeIn(facts, range, basis, teamIds);
    if (unit === "effort") return sumEffortHours(slice.assets, rates);
    return unit === "assets" ? slice.assetUnits : slice.taskCount;
  };
  const monthRange = (base: DateRange, month: number): DateRange | null => {
    const year = Number(base.from.slice(0, 4));
    const from = iso(year, month, 1);
    const to = iso(year, month, daysInMonth(year, month));
    if (to < base.from || from > base.to) return null;
    return { from: from < base.from ? base.from : from, to: to > base.to ? base.to : to };
  };

  // The whole of the comparison year, for the months the matched range does
  // not reach. `period.comparison` ends where the current period ends; this
  // is the same year read to its December.
  const comparisonYear = period.comparison ? Number(period.comparison.from.slice(0, 4)) : null;

  return MONTHS.map((name, index) => {
    const month = index + 1;
    const currentRange = monthRange(period.current, month);
    const comparisonRange = period.comparison ? monthRange(period.comparison, month) : null;
    const current = currentRange ? measure(currentRange) : null;
    const comparison = comparisonRange && covered(comparisonRange, facts.earliest) ? measure(comparisonRange) : null;
    const beyond =
      comparisonYear !== null && comparisonRange === null
        ? { from: iso(comparisonYear, month, 1), to: iso(comparisonYear, month, daysInMonth(comparisonYear, month)) }
        : null;
    return {
      month,
      label: name.slice(0, 3),
      current,
      comparison,
      delta: current !== null && comparison !== null ? current - comparison : null,
      percent: current !== null && comparison !== null && comparison > 0 ? ((current - comparison) / comparison) * 100 : null,
      outlook: beyond && covered(beyond, facts.earliest) ? measure(beyond) : null,
    };
  });
}

/** The same comparison, cut by a dimension rather than by month. */
export interface DimensionComparisonRow {
  key: string;
  name: string;
  color: string;
  current: number;
  comparison: number | null;
  delta: number | null;
  percent: number | null;
}

export type ComparisonDimension = "team" | "department" | "assetType";

export function dimensionComparison(
  report: VolumeReport,
  dimension: ComparisonDimension,
  measure: MeasureKind,
  colorOf: (key: string) => string,
  valueOf: TaskValue = () => 1,
): DimensionComparisonRow[] {
  const tally = (slice: VolumeSlice | null): Map<string, { name: string; value: number }> => {
    const out = new Map<string, { name: string; value: number }>();
    if (!slice) return out;
    const add = (key: string, name: string, value: number) => {
      const entry = out.get(key) ?? { name, value: 0 };
      entry.value += value;
      out.set(key, entry);
    };
    if (dimension === "assetType") {
      // Asset units by type is exact. Task counts by type are not additive —
      // one task can hold three types — so this dimension always measures units.
      for (const asset of slice.assets) add(asset.type, asset.type, asset.units);
      return out;
    }
    if (dimension === "team") {
      for (const task of slice.tasks) add(task.team.id, task.team.name, valueOf(task));
      return out;
    }
    // The task's own STAKEHOLDER cell, resolved against the registry, so a
    // renamed department stays one row. Never the requester's profile.
    const departmentOf = (task: TaskFact) => task.department?.name ?? UNKNOWN_DEPARTMENT;
    for (const task of slice.tasks) add(departmentOf(task), departmentOf(task), valueOf(task));
    return out;
  };

  const current = tally(report.current);
  const previous = report.comparison ? tally(report.comparison) : null;
  const keys = new Set([...current.keys(), ...(previous?.keys() ?? [])]);
  return [...keys]
    .map((key) => {
      const now = current.get(key)?.value ?? 0;
      const then = previous ? (previous.get(key)?.value ?? 0) : null;
      return {
        key,
        name: current.get(key)?.name ?? previous?.get(key)?.name ?? key,
        color: colorOf(key),
        current: now,
        comparison: then,
        delta: then === null ? null : now - then,
        percent: then !== null && then > 0 ? ((now - then) / then) * 100 : null,
      };
    })
    .sort((a, b) => b.current - a.current || a.name.localeCompare(b.name));
}

export const UNKNOWN_DEPARTMENT = "Unknown";

/**
 * A department's colour on a chart, as a hex string.
 *
 * Charts paint with raw CSS (`background: row.color`), so what they need is a
 * value, never a token. `tagColorFor` hands back a *token* — "sky", "amber" —
 * and the two are easy to confuse because seven of the ten tokens happen to
 * also be CSS colour keywords: passing a token straight through drew "indigo"
 * and "pink" in CSS's own washed-out versions, and drew nothing at all for
 * "sky", "amber" and "rose", which CSS does not know. That is a bar with a
 * number beside it and no colour in it.
 *
 * So the conversion lives here, once, and no view has to remember it.
 */
export function departmentHex(name: string): string {
  return name === UNKNOWN_DEPARTMENT ? colorClasses("gray").hex : colorClasses(tagColorFor(name)).hex;
}


// ---------------------------------------------------------------------------
// As of now: the operational snapshot

/**
 * What is true this minute, whatever period the reader is reporting on.
 *
 * Deliberately separate from everything above. A manager looking at last year's
 * volume still needs to know what is overdue today, and a historical filter
 * quietly hiding today's overdue work would be the most dangerous thing this
 * page could do. These figures overlap by definition — a task can be overdue
 * and blocked — and are never summed.
 */
export interface OperationsSnapshot {
  asOf: ISODate;
  overdue: TaskFact[];
  dueThisWeek: TaskFact[];
  blocked: TaskFact[];
  unallocated: TaskFact[];
  unassigned: TaskFact[];
  noDueDate: TaskFact[];
}

/** How far ahead "due soon" reaches. Stated on the page rather than left implicit. */
export const DUE_SOON_DAYS = 7;

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y!, m! - 1, d! + days));
  return shifted.toISOString().slice(0, 10);
}

export function operations(facts: DashboardFacts, today: ISODate, teamIds: string[] | null): OperationsSnapshot {
  const soon = addDays(today, DUE_SOON_DAYS);
  const open = facts.tasks.filter((task) => !task.isDone && inTeams(task.team, teamIds));
  return {
    asOf: today,
    overdue: open.filter((t) => t.dueDate !== null && t.dueDate < today),
    dueThisWeek: open.filter((t) => t.dueDate !== null && t.dueDate >= today && t.dueDate <= soon),
    blocked: open.filter((t) => t.status === "stuck"),
    // Requests nobody has picked up: no team and nobody assigned. A heuristic
    // while allocation has no state of its own, and labelled as one.
    unallocated: facts.requests.filter((r) => r.request?.stage !== "closed" && r.owners.length === 0 && (r.isIntake || r.team.id === NO_TEAM)),
    unassigned: open.filter((t) => t.owners.length === 0),
    noDueDate: open.filter((t) => t.dueDate === null),
  };
}

// ---------------------------------------------------------------------------
// Attention

export type AttentionReason = "overdue" | "blocked" | "unassigned-soon" | "awaiting-allocation";

export const ATTENTION_REASONS: Record<AttentionReason, { label: string; explain: string }> = {
  overdue: { label: "Overdue", explain: "Open, with a due date before today." },
  blocked: { label: "Blocked", explain: "Its board says this work is stuck." },
  "unassigned-soon": { label: "Nobody assigned", explain: `Due within ${DUE_SOON_DAYS} days with no owner.` },
  "awaiting-allocation": { label: "Awaiting allocation", explain: "A request with no team and nobody assigned." },
};

export interface AttentionRow {
  task: TaskFact;
  reason: AttentionReason;
  /** Days past due; negative for work not yet due. Null when undated. */
  daysLate: number | null;
}

const REASON_ORDER: AttentionReason[] = ["overdue", "blocked", "awaiting-allocation", "unassigned-soon"];

/**
 * The work that needs a decision, most pressing first.
 *
 * Ordered, not scored. An opaque risk number would be a judgement the data
 * cannot support; this is "how late, then how soon, then by name", which anyone
 * can check. A task appears once, under its most pressing reason.
 */
export function attention(snapshot: OperationsSnapshot, today: ISODate): AttentionRow[] {
  const seen = new Set<string>();
  const rows: AttentionRow[] = [];
  const push = (task: TaskFact, reason: AttentionReason) => {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    rows.push({ task, reason, daysLate: task.dueDate ? daysBetween(task.dueDate, today) : null });
  };
  for (const task of snapshot.overdue) push(task, "overdue");
  for (const task of snapshot.blocked) push(task, "blocked");
  for (const task of snapshot.unallocated) push(task, "awaiting-allocation");
  for (const task of snapshot.dueThisWeek) if (task.owners.length === 0) push(task, "unassigned-soon");

  return rows.sort((a, b) => {
    const byReason = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
    if (byReason !== 0) return byReason;
    const byDate = (a.task.dueDate ?? "9999-12-31").localeCompare(b.task.dueDate ?? "9999-12-31");
    if (byDate !== 0) return byDate;
    return a.task.name.localeCompare(b.task.name);
  });
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Open work due in the next few weeks, soonest first. Not "campaign launches": no launch date exists. */
export function upcoming(facts: DashboardFacts, today: ISODate, teamIds: string[] | null, weeks = 4): TaskFact[] {
  const horizon = addDays(today, weeks * 7);
  return facts.tasks
    .filter((t) => !t.isDone && inTeams(t.team, teamIds) && t.dueDate !== null && t.dueDate >= today && t.dueDate <= horizon)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Resourcing

/**
 * What each person is carrying, and what nobody is carrying.
 *
 * These are **association counts**: a task with three owners appears under all
 * three, so the column does not sum to the workspace total. That is stated on
 * the panel rather than hidden, because the alternative — dividing a task three
 * ways — would invent an allocation nobody recorded.
 *
 * There is no capacity here and there cannot be: the workspace holds no effort
 * estimates, no contracted hours and no leave. A percentage computed from task
 * counts would be a number about nothing.
 *
 * Every row is also split by the stakeholder group the work is for, so the same
 * counts answer "who is carrying what" and "how much of it is for
 * Communications" without being counted twice.
 */

/**
 * The four states a person's open work can be in.
 *
 * The band figures are in whatever measure the page is being read in — hours,
 * tasks or asset units — because a table that could only count tasks would be
 * the one panel answering a different question from everything around it.
 * `tasks` is always a count beside them: it is what the sentence "54 tasks,
 * 30 late" is made of, and what the rows are ranked by whatever is on screen.
 */
export interface WorkloadBands {
  inProgress: number;
  scheduled: number;
  overdue: number;
  undated: number;
  /** The four bands added up, in the measure. */
  total: number;
  /** Always a count of tasks, whatever the measure. */
  tasks: number;
}

/**
 * One person's share of one stakeholder group's work.
 *
 * `key` is the folded name, and work with no group at all collects under
 * NO_DEPARTMENT_KEY. By name and not by registry id, for the same reason
 * `dimensionComparison` groups by name: a group reaches a task two ways — its
 * own STAKEHOLDER cell, which the registry resolves, and the requester's
 * profile, which is inferred and carries no id — and keying by id splits one
 * "Digital" into two, so this panel would disagree with By department beside
 * it. Resolution has already happened by the time the name is read, so a
 * renamed group still arrives under one name rather than two.
 */
export interface DepartmentLoad extends WorkloadBands {
  key: string;
  name: string;
}

export interface WorkloadRow extends WorkloadBands {
  userId: string | null;
  name: string;
  teamNames: string[];
  /** The same figures split by which stakeholder group the work is for, biggest first. */
  byDepartment: DepartmentLoad[];
  /** True for somebody who is no longer an active member but still holds work. */
  former: boolean;
}

/** Work whose task names no stakeholder group. Not a group: the absence of one. */
export const NO_DEPARTMENT_KEY = "__no_department__";

/** How two cells are decided to name the same group. */
export function departmentKeyOf(task: TaskFact): string {
  if (!task.department) return NO_DEPARTMENT_KEY;
  return task.department.name.trim().toLowerCase();
}

export function departmentNameOf(task: TaskFact): string {
  return task.department?.name ?? UNKNOWN_DEPARTMENT;
}

const blankBands = (): WorkloadBands => ({ inProgress: 0, scheduled: 0, overdue: 0, undated: 0, total: 0, tasks: 0 });
export type BandKey = "inProgress" | "scheduled" | "overdue" | "undated";

function countInto(target: WorkloadBands, value: number, band: BandKey): void {
  target.tasks += 1;
  target.total += value;
  target[band] += value;
}

export function assignedWorkload(facts: DashboardFacts, today: ISODate, teamIds: string[] | null, weeks: 2 | 4 | 8, valueOf: TaskValue = () => 1): WorkloadRow[] {
  const horizon = addDays(today, weeks * 7);
  const rows = new Map<string | null, WorkloadRow>();
  const blank = (userId: string | null, name: string, former = false): WorkloadRow => ({
    userId,
    name,
    teamNames: [],
    byDepartment: [],
    ...blankBands(),
    former,
  });

  // Everybody the workspace knows, so a person with nothing on is visible as
  // having nothing on rather than missing from the meeting.
  for (const user of facts.users.values()) {
    if (user.deactivatedAt) continue;
    rows.set(user.id, blank(user.id, user.displayName));
  }
  rows.set(null, blank(null, "Nobody assigned"));

  for (const task of facts.tasks) {
    if (task.isDone || !inTeams(task.team, teamIds)) continue;
    const within = task.dueDate !== null && task.dueDate >= today && task.dueDate <= horizon;
    const late = task.dueDate !== null && task.dueDate < today;
    const undated = task.dueDate === null;
    if (!within && !late && !undated) continue;
    const band: BandKey = late ? "overdue" : undated ? "undated" : task.status === "progress" ? "inProgress" : "scheduled";
    const key = departmentKeyOf(task);
    const name = departmentNameOf(task);

    const owners: Array<string | null> = task.owners.length > 0 ? task.owners : [null];
    for (const owner of owners) {
      let row = rows.get(owner);
      if (!row) {
        const user = owner ? facts.users.get(owner) : undefined;
        row = blank(owner, user?.displayName ?? "Someone who has left", true);
        rows.set(owner, row);
      }
      const value = valueOf(task);
      countInto(row, value, band);
      // The same task counted a second time against the group it is for, so
      // the split is the row broken up rather than a second, separate count.
      let cell = row.byDepartment.find((d) => d.key === key);
      if (!cell) {
        cell = { key, name, ...blankBands() };
        row.byDepartment.push(cell);
      }
      countInto(cell, value, band);
      if (task.team.id !== NO_TEAM && !row.teamNames.includes(task.team.name)) row.teamNames.push(task.team.name);
    }
  }

  for (const row of rows.values()) row.byDepartment.sort(byTotalThenName);
  return sortWorkload([...rows.values()]);
}

/** Biggest first in the measure on screen, and alphabetical where they tie. */
const byTotalThenName = (a: { total: number; name: string }, b: { total: number; name: string }) => b.total - a.total || a.name.localeCompare(b.name);

function sortWorkload(rows: WorkloadRow[]): WorkloadRow[] {
  return rows.sort((a, b) => {
    // Unassigned work leads: it is the only row nobody has picked up.
    if (a.userId === null) return -1;
    if (b.userId === null) return 1;
    return byTotalThenName(a, b);
  });
}

/** A stakeholder group with work in the window, for the filter to offer. */
export interface DepartmentLoadOption {
  key: string;
  name: string;
  /** In the measure on screen. */
  total: number;
  tasks: number;
  /** How many named people hold some of it; the unassigned row is not a person. */
  people: number;
}

/**
 * Every stakeholder group the window holds work for, busiest first.
 *
 * Read off the rows rather than the tasks, so the filter can only ever offer a
 * group the panel below it would actually show something for.
 */
export function workloadDepartments(rows: WorkloadRow[]): DepartmentLoadOption[] {
  const out = new Map<string, DepartmentLoadOption>();
  for (const row of rows) {
    for (const cell of row.byDepartment) {
      if (cell.tasks === 0) continue;
      const entry = out.get(cell.key) ?? { key: cell.key, name: cell.name, total: 0, tasks: 0, people: 0 };
      entry.total += cell.total;
      entry.tasks += cell.tasks;
      if (row.userId !== null) entry.people += 1;
      out.set(cell.key, entry);
    }
  }
  return [...out.values()].sort(byTotalThenName);
}

/**
 * The same rows, counting only the work for one stakeholder group.
 *
 * A projection of what `assignedWorkload` already counted, never a second pass
 * over the tasks: "how much is Danh doing for Communications" and "how much is
 * Danh doing" are then the same numbers read at two depths, and cannot drift.
 * People holding nothing for the group drop out — a page of empty bars answers
 * a question nobody asked.
 */
export function workloadForDepartment(rows: WorkloadRow[], key: string): WorkloadRow[] {
  const projected: WorkloadRow[] = [];
  for (const row of rows) {
    const cell = row.byDepartment.find((d) => d.key === key);
    if (!cell || cell.tasks === 0) continue;
    const { key: _key, name: _name, ...bands } = cell;
    projected.push({ ...row, ...bands, byDepartment: [cell] });
  }
  return sortWorkload(projected);
}

// ---------------------------------------------------------------------------
// Coverage

/**
 * What the figures cannot see.
 *
 * Shown next to the numbers, not buried: a due-date report over a workspace
 * where half the work is undated is a different thing from one where all of it
 * is dated, and the reader has no way to know which they are looking at unless
 * the page says.
 */
export interface Coverage {
  tasks: number;
  withoutDueDate: number;
  withoutOwner: number;
  withoutDepartment: number;
  withoutStatus: number;
}

export function coverage(tasks: TaskFact[]): Coverage {
  return {
    tasks: tasks.length,
    withoutDueDate: tasks.filter((t) => t.dueDate === null).length,
    withoutOwner: tasks.filter((t) => t.owners.length === 0).length,
    withoutDepartment: tasks.filter((t) => t.department === null).length,
    withoutStatus: tasks.filter((t) => t.status === "none").length,
  };
}

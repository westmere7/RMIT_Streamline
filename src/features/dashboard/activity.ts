import type { ISODate } from "@/domain";
import type { DashboardFacts, TaskFact, TeamRef } from "./analytics";
import { addDays } from "./metrics";

/**
 * The year as a calendar of days, the way a code host draws a year of
 * contributions: a column per week, a row per weekday, each day shaded by how
 * much happened on it.
 *
 * "Finished" counts tasks that moved to done that day (the same moment the In
 * and out panel counts); "started" counts tasks made that day. Deliverables
 * ticked off that day ride along for the day's card. Days are cut from the
 * timestamps the way the rest of the dashboard cuts them, so a day here and a
 * month there always agree.
 */
export type ActivityKind = "finished" | "started";

/** Each kind in its own colour: finished work green, new work the brand red. */
export const ACTIVITY_HEX: Record<ActivityKind, string> = { finished: "#10b981", started: "#e61e2a" };
/** How much of the colour each level carries, from nothing to the busiest quarter. */
export const ACTIVITY_SHADES = [0, 0.28, 0.5, 0.74, 1] as const;

export interface ActivityDay {
  date: ISODate;
  finished: TaskFact[];
  started: TaskFact[];
  /** Deliverable lines ticked off that day. */
  deliverables: number;
  /** Outside the range: drawn as a blank, so the grid stays a grid. */
  outside: boolean;
  /** After today: nothing could have happened yet. */
  future: boolean;
}

export interface ActivityCalendar {
  from: ISODate;
  to: ISODate;
  label: string;
  kind: ActivityKind;
  /** Columns of seven days, Monday first. */
  weeks: ActivityDay[][];
  /** Where each month's first full column starts, for the labels above the grid. */
  months: Array<{ label: string; week: number }>;
  /** The busiest day's count. */
  max: number;
  /**
   * Where the shades step up: the quarters of the days that had any work, so a
   * single very busy day does not wash every other day out to the palest shade.
   */
  thresholds: [number, number, number];
  total: number;
  activeDays: number;
  busiest: { date: ISODate; count: number } | null;
  longestStreak: number;
  /** Days in a row up to today (or yesterday, when today has nothing yet). */
  currentStreak: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dayOf = (iso: string): ISODate => iso.slice(0, 10);
const inTeams = (team: TeamRef, teamIds: string[] | null) => teamIds === null || teamIds.includes(team.id);

/** Monday is 0. */
function weekday(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}

/**
 * Which days the calendar covers: the months the "by month" chart above it
 * draws, whole, so the two line up month under month and read as one year.
 */
export function activityRange(year: number, months: readonly number[]): { from: ISODate; to: ISODate; label: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = Math.min(...months);
  const last = Math.max(...months);
  const lastDay = new Date(Date.UTC(year, last, 0)).getUTCDate();
  const label = months.length >= 12 ? String(year) : first === last ? `${MONTHS[first - 1]} ${year}` : `${MONTHS[first - 1]} to ${MONTHS[last - 1]} ${year}`;
  return { from: `${year}-${pad(first)}-01`, to: `${year}-${pad(last)}-${pad(lastDay)}`, label };
}

/** How many tasks a day counts for, in the kind chosen. */
export const activityCount = (day: ActivityDay, kind: ActivityKind) => (kind === "finished" ? day.finished.length : day.started.length);

/** The shade a day gets: 0 for nothing, then 1 to 4 by which quarter of the active days it falls in. */
export function activityLevel(count: number, thresholds: readonly [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count <= thresholds[0]) return 1;
  if (count <= thresholds[1]) return 2;
  if (count <= thresholds[2]) return 3;
  return 4;
}

/** The quarter points of the days with any work (nearest rank). */
export function activityThresholds(counts: readonly number[]): [number, number, number] {
  const active = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (active.length === 0) return [0, 0, 0];
  const at = (q: number) => active[Math.min(active.length - 1, Math.max(0, Math.ceil(q * active.length) - 1))]!;
  return [at(0.25), at(0.5), at(0.75)];
}

export function activityCalendar(facts: DashboardFacts, options: { from: ISODate; to: ISODate; label: string; today: ISODate; teamIds: string[] | null; kind: ActivityKind }): ActivityCalendar {
  const { from, to, today, teamIds, kind } = options;
  const finished = new Map<ISODate, TaskFact[]>();
  const started = new Map<ISODate, TaskFact[]>();
  const add = (map: Map<ISODate, TaskFact[]>, date: ISODate, task: TaskFact) => {
    const list = map.get(date);
    if (list) list.push(task);
    else map.set(date, [task]);
  };
  const tasks = facts.tasks.filter((task) => inTeams(task.team, teamIds));
  const taskIds = new Set(tasks.map((task) => task.id));
  for (const task of tasks) {
    if (task.flow.finishedAt && task.isDone) add(finished, dayOf(task.flow.finishedAt), task);
    add(started, dayOf(task.createdAt), task);
  }
  const deliverables = new Map<ISODate, number>();
  for (const asset of facts.assets) {
    if (!asset.completedAt || !taskIds.has(asset.taskId)) continue;
    deliverables.set(asset.completedAt, (deliverables.get(asset.completedAt) ?? 0) + 1);
  }

  // From the Monday on or before the first day to the Sunday on or after the last.
  const gridStart = addDays(from, -weekday(from));
  const gridEnd = addDays(to, 6 - weekday(to));
  const weeks: ActivityDay[][] = [];
  const months: Array<{ label: string; week: number }> = [];
  let column: ActivityDay[] = [];
  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    const outside = date < from || date > to;
    column.push({
      date,
      finished: outside ? [] : (finished.get(date) ?? []),
      started: outside ? [] : (started.get(date) ?? []),
      deliverables: outside ? 0 : (deliverables.get(date) ?? 0),
      outside,
      future: date > today,
    });
    if (column.length === 7) {
      // A month is labelled over the first column that holds its 1st (or the range's first day).
      const first = column.find((day) => !day.outside && (day.date.endsWith("-01") || day.date === from));
      if (first) months.push({ label: MONTHS[Number(first.date.slice(5, 7)) - 1]!, week: weeks.length });
      weeks.push(column);
      column = [];
    }
  }

  const inRange = weeks.flat().filter((day) => !day.outside);
  const counts = inRange.map((day) => activityCount(day, kind));
  const max = Math.max(0, ...counts);
  let busiest: { date: ISODate; count: number } | null = null;
  for (const day of inRange) {
    const count = activityCount(day, kind);
    if (count > 0 && (!busiest || count > busiest.count)) busiest = { date: day.date, count };
  }

  // Streaks over the days that have happened.
  let longestStreak = 0;
  let run = 0;
  for (const day of inRange) {
    if (day.future) break;
    run = activityCount(day, kind) > 0 ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  const past = inRange.filter((day) => !day.future);
  let currentStreak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    const count = activityCount(past[i]!, kind);
    // Today with nothing yet does not break a run that reached yesterday.
    if (count === 0 && i === past.length - 1 && past[i]!.date === today) continue;
    if (count === 0) break;
    currentStreak += 1;
  }

  return {
    from,
    to,
    label: options.label,
    kind,
    weeks,
    months,
    max,
    thresholds: activityThresholds(counts),
    total: counts.reduce((sum, n) => sum + n, 0),
    activeDays: counts.filter((n) => n > 0).length,
    busiest,
    longestStreak,
    currentStreak,
  };
}

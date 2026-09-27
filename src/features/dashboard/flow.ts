import type { ISODate } from "@/domain";
import { MONTH_LABELS } from "./charts/chart-utils";
import { NO_TEAM, teamHex, type DashboardFacts, type NamedCount, type StatusBucket, type TaskFact, type TeamRef } from "./analytics";
import { addDays, covered, departmentHex, inRange, type DateRange, type ResolvedPeriod } from "./metrics";

/**
 * How work moves, rather than how much of it there is: how long it takes, how
 * often it lands on time, where it waits, how often it comes back, and whether
 * more is arriving than leaving.
 *
 * All of it is read from when work finished, not from the page's basis
 * (requested or scheduled): "how long did the work finished in March take" is
 * the question, whenever it was asked for. The team filter applies as it does
 * everywhere else.
 */

const DAY_MS = 86_400_000;

const inTeams = (team: TeamRef, teamIds: string[] | null) => teamIds === null || teamIds.includes(team.id);
const dayOf = (iso: string): ISODate => iso.slice(0, 10);

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Work finished in a range, for the teams in view. */
export function finishedIn(facts: DashboardFacts, range: DateRange, teamIds: string[] | null): TaskFact[] {
  return facts.tasks.filter((t) => inTeams(t.team, teamIds) && t.flow.finishedAt !== null && inRange(dayOf(t.flow.finishedAt), range));
}

/** The range to compare against, when the workspace holds anything for it. */
function comparisonRange(facts: DashboardFacts, period: ResolvedPeriod): DateRange | null {
  return period.comparison && covered(period.comparison, facts.earliest) ? period.comparison : null;
}

/** Days from the task being made to it being done. Never below nought: a clock can disagree by a second. */
export function turnaroundDays(task: TaskFact): number | null {
  if (!task.flow.finishedAt) return null;
  return Math.max(0, (Date.parse(task.flow.finishedAt) - Date.parse(task.flow.createdAt)) / DAY_MS);
}

type Group = { key: string; name: string; color: string };
const byTeam = (t: TaskFact): Group => ({ key: t.team.id, name: t.team.name, color: teamHex(t.team) });
const byDepartment = (t: TaskFact): Group | null => (t.department ? { key: t.department.name, name: t.department.name, color: departmentHex(t.department.name) } : null);

/** One row per group: the figure `summarise` makes of its tasks, with how many tasks it rests on. */
function grouped(tasks: TaskFact[], groupOf: (t: TaskFact) => Group | null, summarise: (tasks: TaskFact[]) => number | null, noun: string): NamedCount[] {
  const groups = new Map<string, { group: Group; tasks: TaskFact[] }>();
  for (const task of tasks) {
    const group = groupOf(task);
    if (!group || group.key === NO_TEAM) continue;
    const entry = groups.get(group.key) ?? { group, tasks: [] };
    entry.tasks.push(task);
    groups.set(group.key, entry);
  }
  const rows: NamedCount[] = [];
  for (const { group, tasks: own } of groups.values()) {
    const value = summarise(own);
    if (value === null) continue;
    rows.push({ id: group.key, name: group.name, color: group.color, value, detail: `${own.length} ${own.length === 1 ? noun : `${noun}s`}` });
  }
  return rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export interface RateFigure {
  /** The figure for the period, or null when nothing in it can be measured. */
  value: number | null;
  /** The same figure for the comparison period, or null. */
  comparison: number | null;
  /** How many tasks the figure rests on. */
  count: number;
  byTeam: NamedCount[];
  byDepartment: NamedCount[];
}

const medianTurnaround = (tasks: TaskFact[]) => median(tasks.map(turnaroundDays).filter((d): d is number => d !== null));

/** Median days from made to done, for the work finished in the period. */
export function turnaround(facts: DashboardFacts, period: ResolvedPeriod, teamIds: string[] | null): RateFigure {
  const now = finishedIn(facts, period.current, teamIds);
  const then = comparisonRange(facts, period);
  return {
    value: medianTurnaround(now),
    comparison: then ? medianTurnaround(finishedIn(facts, then, teamIds)) : null,
    count: now.length,
    byTeam: grouped(now, byTeam, medianTurnaround, "task"),
    byDepartment: grouped(now, byDepartment, medianTurnaround, "task"),
  };
}

/** Of the finished work that had a due date, the share done by it, in per cent. */
function onTimeShare(tasks: TaskFact[]): number | null {
  const dated = tasks.filter((t) => t.dueDate !== null);
  if (dated.length === 0) return null;
  return (dated.filter((t) => dayOf(t.flow.finishedAt!) <= t.dueDate!).length / dated.length) * 100;
}

export function onTime(facts: DashboardFacts, period: ResolvedPeriod, teamIds: string[] | null): RateFigure {
  const now = finishedIn(facts, period.current, teamIds);
  const then = comparisonRange(facts, period);
  const dated = now.filter((t) => t.dueDate !== null);
  return {
    value: onTimeShare(now),
    comparison: then ? onTimeShare(finishedIn(facts, then, teamIds)) : null,
    count: dated.length,
    byTeam: grouped(dated, byTeam, onTimeShare, "task"),
    byDepartment: grouped(dated, byDepartment, onTimeShare, "task"),
  };
}

/** Of the finished work, the share that went back at least once on its way, in per cent. */
function sentBackShare(tasks: TaskFact[]): number | null {
  if (tasks.length === 0) return null;
  return (tasks.filter((t) => t.flow.sentBack.length > 0).length / tasks.length) * 100;
}

export function sentBack(facts: DashboardFacts, period: ResolvedPeriod, teamIds: string[] | null): RateFigure & { times: number } {
  const now = finishedIn(facts, period.current, teamIds);
  const then = comparisonRange(facts, period);
  return {
    value: sentBackShare(now),
    comparison: then ? sentBackShare(finishedIn(facts, then, teamIds)) : null,
    count: now.length,
    times: now.reduce((sum, t) => sum + t.flow.sentBack.length, 0),
    byTeam: grouped(now, byTeam, sentBackShare, "task"),
    byDepartment: grouped(now, byDepartment, sentBackShare, "task"),
  };
}

const ROLE_COLORS: Record<StatusBucket, string> = { done: "#10b981", progress: "#3b82f6", stuck: "#ef4444", other: "#f59e0b", none: "#94a3b8" };

/**
 * How long work sits in each status, as a median in days, over the stretches
 * that ended in the period — and those still running, when the period reaches
 * today, measured to now. Done is left out: it is where work stops, not a wait.
 */
export function timeInStatus(facts: DashboardFacts, period: ResolvedPeriod, teamIds: string[] | null, now: Date = new Date()): NamedCount[] {
  const today = now.toISOString().slice(0, 10);
  const running = inRange(today, period.current);
  const stretches = new Map<string, { name: string; role: StatusBucket; days: number[] }>();
  for (const task of facts.tasks) {
    if (!inTeams(task.team, teamIds)) continue;
    for (const span of task.flow.spans) {
      if (span.role === "done") continue;
      const ended = span.to ? inRange(dayOf(span.to), period.current) : running;
      if (!ended) continue;
      const days = Math.max(0, ((span.to ? Date.parse(span.to) : now.getTime()) - Date.parse(span.from)) / DAY_MS);
      const key = span.label.trim().toLowerCase();
      const entry = stretches.get(key) ?? { name: span.label, role: span.role, days: [] };
      entry.days.push(days);
      stretches.set(key, entry);
    }
  }
  return [...stretches.entries()]
    .map(([key, s]) => ({ id: key, name: s.name, color: ROLE_COLORS[s.role], value: median(s.days)!, detail: `${s.days.length} ${s.days.length === 1 ? "time" : "times"} · longest ${formatDays(Math.max(...s.days))}` }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export interface FlowBucket {
  key: string;
  label: string;
  /** Tasks made in the bucket; null for a stretch that has not happened yet. */
  in: number | null;
  /** Tasks finished in it; null likewise. */
  out: number | null;
}

/**
 * New work against finished work, by month — by week for a period of three
 * months or less, where months would be three bars. More in than out, month
 * after month, is a backlog growing.
 */
export function inAndOut(facts: DashboardFacts, period: ResolvedPeriod, teamIds: string[] | null, today: ISODate): { buckets: FlowBucket[]; totalIn: number; totalOut: number; weekly: boolean } {
  const { from, to } = period.current;
  const weekly = (Date.parse(to) - Date.parse(from)) / DAY_MS <= 100;
  const buckets: Array<FlowBucket & { range: DateRange }> = [];
  if (weekly) {
    // Weeks from Monday, the first one reaching back to the week the period starts in.
    const start = new Date(`${from}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    for (let at = start.toISOString().slice(0, 10); at <= to; at = addDays(at, 7)) {
      const d = new Date(`${at}T00:00:00Z`);
      buckets.push({ key: at, label: `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCDate()}`, in: 0, out: 0, range: { from: at < from ? from : at, to: addDays(at, 6) > to ? to : addDays(at, 6) } });
    }
  } else {
    for (let first = `${from.slice(0, 7)}-01`; first <= to; ) {
      const m = Number(first.slice(5, 7));
      const next = m === 12 ? `${Number(first.slice(0, 4)) + 1}-01-01` : `${first.slice(0, 4)}-${String(m + 1).padStart(2, "0")}-01`;
      const last = addDays(next, -1);
      buckets.push({ key: first, label: MONTH_LABELS[m - 1]!, in: 0, out: 0, range: { from: first < from ? from : first, to: last > to ? to : last } });
      first = next;
    }
  }
  for (const bucket of buckets) {
    if (bucket.range.from <= today) continue;
    bucket.in = null;
    bucket.out = null;
  }
  const find = (date: ISODate) => buckets.find((b) => b.in !== null && inRange(date, b.range));
  for (const task of facts.tasks) {
    if (!inTeams(task.team, teamIds)) continue;
    const made = find(task.createdAt);
    if (made) made.in! += 1;
    const done = task.flow.finishedAt ? find(dayOf(task.flow.finishedAt)) : undefined;
    if (done) done.out! += 1;
  }
  return {
    buckets: buckets.map(({ key, label, in: n, out }) => ({ key, label, in: n, out })),
    totalIn: buckets.reduce((sum, b) => sum + (b.in ?? 0), 0),
    totalOut: buckets.reduce((sum, b) => sum + (b.out ?? 0), 0),
    weekly,
  };
}

/** Days, with a decimal while it is short: "0.4 d", "3.5 d", "12 d". Under an hour reads as hours. */
export function formatDays(days: number): string {
  if (days < 1 / 24) return "<1 h";
  if (days < 1) return `${Math.round(days * 24)} h`;
  return `${days < 10 ? days.toFixed(1).replace(/\.0$/, "") : Math.round(days)} d`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

"use client";

import * as React from "react";
import { effortHours, type AssetRates } from "@/domain";
import type { DashboardFacts, TaskFact } from "@/features/dashboard/analytics";
import { addDays, departmentKeyOf, volumeIn, type MeasureKind, type ReportingBasis, type ResolvedPeriod, type TaskValue } from "@/features/dashboard/metrics";

/**
 * The tasks behind a figure.
 *
 * A dashboard number is only as good as the reader's trust in it, and the
 * quickest way to that trust is to see what it counted. Every figure that can
 * be broken down hands its own task set here — the same array it counted, not
 * a second query that ought to agree — and the list opens over the page.
 *
 * Signed-in readers only: the public link passes no way to open a task, so
 * there is no provider and nothing on the page offers a list.
 */
export interface DrillRequest {
  title: string;
  /** What the set is, in a few words: "Done in 2026 · Editorial". */
  subtitle?: string;
  tasks: readonly TaskFact[];
  /**
   * What each task added to the figure, when the figure is in hours or units:
   * the list shows it as a column, totals it and sorts by it. Absent for a
   * figure in tasks, where the list itself is the count.
   */
  amount?: DrillAmount;
}

export interface DrillAmount {
  unit: "hours" | "units";
  byTask: ReadonlyMap<string, number>;
}

/**
 * The amount from the deliverable lines a figure added up (a month's, a type's,
 * the period's), so the column totals to the figure. Nothing in tasks.
 */
export function amountOfLines(lines: ReadonlyArray<{ taskId: string; type: string; units: number }>, measure: MeasureKind, rates: AssetRates): DrillAmount | undefined {
  if (measure === "tasks") return undefined;
  const byTask = new Map<string, number>();
  for (const line of lines) {
    const value = measure === "effort" ? effortHours([{ type: line.type, units: line.units }], rates) : line.units;
    byTask.set(line.taskId, (byTask.get(line.taskId) ?? 0) + value);
  }
  return { unit: measure === "effort" ? "hours" : "units", byTask };
}

/** The amount from a figure that sums whole tasks (by team, by department, workload). Nothing in tasks. */
export function amountOfTasks(tasks: readonly TaskFact[], measure: MeasureKind, valueOf: TaskValue): DrillAmount | undefined {
  if (measure === "tasks") return undefined;
  return { unit: measure === "effort" ? "hours" : "units", byTask: new Map(tasks.map((t) => [t.id, valueOf(t)])) };
}

const DrillContext = React.createContext<((request: DrillRequest) => void) | null>(null);

export const DrillProvider = DrillContext.Provider;

/** Opens the list, or null where the page offers none (the public link). */
export function useDrill(): ((request: DrillRequest) => void) | null {
  return React.useContext(DrillContext);
}

// ---- the sets, read exactly as the figures read them ---------------------------

const inTeams = (task: TaskFact, teamIds: string[] | null) => teamIds === null || teamIds.includes(task.team.id);

/** One person's open work in the workload window, as "Who is carrying what" counts it. `null` is nobody. */
export function workloadTasks(facts: DashboardFacts, today: string, teamIds: string[] | null, weeks: number, userId: string | null, departmentKey: string | null = null): TaskFact[] {
  const horizon = addDays(today, weeks * 7);
  return facts.tasks.filter((task) => {
    if (task.isDone || !inTeams(task, teamIds)) return false;
    const within = task.dueDate !== null && task.dueDate >= today && task.dueDate <= horizon;
    const late = task.dueDate !== null && task.dueDate < today;
    if (!within && !late && task.dueDate !== null) return false;
    if (departmentKey !== null && departmentKeyOf(task) !== departmentKey) return false;
    return userId === null ? task.owners.length === 0 : task.owners.includes(userId);
  });
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The tasks behind one bar of the month-by-month chart: the same month of the
 * same range the chart measured, read the same way. Counted in tasks, the
 * tasks placed in that month; in units or hours, the tasks whose deliverables
 * fell in it — which is what the bar added up.
 */
export function monthTasks(
  facts: DashboardFacts,
  period: ResolvedPeriod,
  basis: ReportingBasis,
  teamIds: string[] | null,
  measure: MeasureKind,
  month: number,
  series: "current" | "comparison" | "outlook",
): { label: string; tasks: TaskFact[]; lines: ReadonlyArray<{ taskId: string; type: string; units: number }> } {
  const base = series === "current" ? period.current : period.comparison;
  if (!base) return { label: "", tasks: [], lines: [] };
  const year = Number(base.from.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let from = `${year}-${pad(month)}-01`;
  let to = `${year}-${pad(month)}-${pad(last)}`;
  // A matched month stops where its range stops; the rest of last year is the whole month.
  if (series !== "outlook") {
    if (from < base.from) from = base.from;
    if (to > base.to) to = base.to;
  }
  const slice = volumeIn(facts, { from, to }, basis, teamIds);
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  if (measure === "tasks") return { label, tasks: slice.tasks, lines: [] };
  const ids = new Set(slice.assets.map((a) => a.taskId));
  return { label, tasks: facts.tasks.filter((t) => ids.has(t.id)), lines: slice.assets };
}

/** The tasks holding deliverables of one type, among the period's asset lines. */
export function assetTypeTasks(tasks: readonly TaskFact[], assets: ReadonlyArray<{ taskId: string; type: string }>, type: string): TaskFact[] {
  const ids = new Set(assets.filter((a) => a.type === type).map((a) => a.taskId));
  return tasks.filter((task) => ids.has(task.id));
}

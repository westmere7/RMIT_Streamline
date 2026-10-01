"use client";

import * as React from "react";
import type { DashboardFacts, TaskFact } from "@/features/dashboard/analytics";
import { addDays, departmentKeyOf } from "@/features/dashboard/metrics";

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

/** The tasks holding deliverables of one type, among the period's asset lines. */
export function assetTypeTasks(tasks: readonly TaskFact[], assets: ReadonlyArray<{ taskId: string; type: string }>, type: string): TaskFact[] {
  const ids = new Set(assets.filter((a) => a.type === type).map((a) => a.taskId));
  return tasks.filter((task) => ids.has(task.id));
}

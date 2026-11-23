import { describe, expect, it } from "vitest";
import { activityCalendar, activityLevel, activityRange, activityThresholds } from "@/features/dashboard/activity";
import type { AssetFact, DashboardFacts, TaskFact, TeamRef } from "@/features/dashboard/analytics";

/**
 * The year as a calendar of days (v0.159): finished and started work per day,
 * the grid's shape, the shades, the streaks, the team filter.
 */
const A: TeamRef = { id: "t-a", name: "Alpha", color: "blue" };
const B: TeamRef = { id: "t-b", name: "Beta", color: "red" };

function task(id: string, createdAt: string, finishedOn: string | null, team: TeamRef = A): TaskFact {
  return {
    id,
    name: id,
    boardId: "b1",
    team,
    owners: [],
    createdAt,
    completedAt: finishedOn,
    isDone: finishedOn !== null,
    dueDate: null,
    flow: { createdAt: `${createdAt}T09:00:00.000Z`, finishedAt: finishedOn ? `${finishedOn}T10:00:00.000Z` : null, spans: [], sentBack: [] },
  } as unknown as TaskFact;
}

const asset = (id: string, taskId: string, completedAt: string | null): AssetFact => ({ id, taskId, completedAt }) as unknown as AssetFact;

function facts(tasks: TaskFact[], assets: AssetFact[] = []): DashboardFacts {
  return { tasks, requests: [], assets, teams: [A, B], users: new Map(), boards: new Map(), years: [2026], earliest: "2026-01-01" } as unknown as DashboardFacts;
}

const TODAY = "2026-11-23"; // a Monday
const year = (f: DashboardFacts, kind: "finished" | "started" = "finished", teamIds: string[] | null = null) =>
  activityCalendar(f, { from: "2026-01-01", to: "2026-12-31", label: "2026", today: TODAY, teamIds, kind });

describe("which days the calendar shows", () => {
  it("is the months the chart above draws, whole, so the two line up", () => {
    expect(activityRange(2026, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
    expect(activityRange(2025, [4, 5, 6])).toEqual({ from: "2025-04-01", to: "2025-06-30", label: "Apr to Jun 2025" });
    expect(activityRange(2024, [2])).toEqual({ from: "2024-02-01", to: "2024-02-29", label: "Feb 2024" });
  });
});

describe("the calendar", () => {
  it("is whole weeks, Monday first, with the days outside the year blank", () => {
    const calendar = year(facts([]));
    expect(calendar.weeks.every((week) => week.length === 7)).toBe(true);
    // 1 Jan 2026 is a Thursday: the first column starts on Monday 29 Dec 2025, which is outside.
    expect(calendar.weeks[0]![0]!.date).toBe("2025-12-29");
    expect(calendar.weeks[0]![0]!.outside).toBe(true);
    expect(calendar.weeks[0]![3]!).toMatchObject({ date: "2026-01-01", outside: false });
    expect(calendar.weeks.flat().filter((day) => !day.outside)).toHaveLength(365);
    expect(calendar.weeks.at(-1)!.at(-1)!.date).toBe("2027-01-03");
    // After today is the future.
    expect(calendar.weeks.flat().find((d) => d.date === "2026-11-24")!.future).toBe(true);
    expect(calendar.months.map((m) => m.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
  });

  it("counts tasks finished on their finishing day and started on the day they were made, deliverables beside", () => {
    const f = facts([task("one", "2026-03-02", "2026-03-10"), task("two", "2026-03-10", "2026-03-10"), task("open", "2026-03-10", null)], [asset("a1", "one", "2026-03-10"), asset("a2", "two", null)]);
    const day = year(f).weeks.flat().find((d) => d.date === "2026-03-10")!;
    expect(day.finished.map((t) => t.id).sort()).toEqual(["one", "two"]);
    expect(day.started.map((t) => t.id).sort()).toEqual(["open", "two"]);
    expect(day.deliverables).toBe(1);
    expect(year(f).total).toBe(2);
    expect(year(f, "started").total).toBe(3);
  });

  it("keeps to the teams chosen, deliverables included", () => {
    const f = facts([task("a", "2026-04-01", "2026-04-02", A), task("b", "2026-04-01", "2026-04-02", B)], [asset("x", "b", "2026-04-02")]);
    const day = year(f, "finished", [A.id]).weeks.flat().find((d) => d.date === "2026-04-02")!;
    expect(day.finished.map((t) => t.id)).toEqual(["a"]);
    expect(day.deliverables).toBe(0);
  });

  it("finds the busiest day, the active days and the runs", () => {
    const f = facts([
      task("1", "2026-11-01", "2026-11-18"),
      task("2", "2026-11-01", "2026-11-19"),
      task("3", "2026-11-01", "2026-11-19"),
      task("4", "2026-11-01", "2026-11-20"),
      task("5", "2026-11-01", "2026-11-22"),
    ]);
    const calendar = year(f);
    expect(calendar.activeDays).toBe(4);
    expect(calendar.busiest).toEqual({ date: "2026-11-19", count: 2 });
    expect(calendar.longestStreak).toBe(3);
    // Today (the 23rd) has nothing yet, which does not end the run that reached yesterday.
    expect(calendar.currentStreak).toBe(1);
  });
});

describe("the shades", () => {
  it("step by quarters of the active days, so one huge day does not wash the rest out", () => {
    const thresholds = activityThresholds([0, 1, 1, 2, 2, 3, 4, 40]);
    // Seven active days: the quarters fall on the 2nd, 4th and 6th of them.
    expect(thresholds).toEqual([1, 2, 4]);
    expect([0, 1, 2, 3, 4, 40].map((n) => activityLevel(n, thresholds))).toEqual([0, 1, 2, 3, 3, 4]);
    expect(activityThresholds([0, 0])).toEqual([0, 0, 0]);
  });
});

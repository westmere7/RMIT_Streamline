import { describe, expect, it } from "vitest";
import type { AssetRates } from "@/domain";
import type { AssetFact, DashboardFacts, TaskFact, TeamRef } from "@/features/dashboard/analytics";
import {
  assignedWorkload,
  attention,
  compare,
  coverage,
  departmentHex,
  dimensionComparison,
  monthlyComparison,
  operations,
  reportingDate,
  resolvePeriod,
  UNKNOWN_DEPARTMENT,
  upcoming,
  volumeReport,
  type ReportingPeriod,
} from "@/features/dashboard/metrics";
import type { User } from "@/domain";

const TODAY = "2026-09-09";
const ALPHA: TeamRef = { id: "t-alpha", name: "Alpha", color: "blue" };
const BETA: TeamRef = { id: "t-beta", name: "Beta", color: "green" };

let seq = 0;
function task(overrides: Partial<TaskFact> = {}): TaskFact {
  seq += 1;
  return {
    id: `t${seq}`,
    name: `Task ${seq}`,
    reference: null,
    boardId: "b1",
    boardName: "Board",
    team: ALPHA,
    createdAt: "2026-03-01",
    dueDate: "2026-03-15",
    startDate: null,
    completedAt: null,
    status: "other",
    statusLabel: "Working",
    isDone: false,
    priority: null,
    size: null,
    owners: [],
    tags: [],
    assetUnits: 0,
    assetLines: 0,
    doneAssetUnits: 0,
    department: null,
    request: null,
    isIntake: false,
    ...overrides,
  };
}

function asset(taskId: string, units: number, overrides: Partial<AssetFact> = {}): AssetFact {
  seq += 1;
  return {
    id: `a${seq}`,
    taskId,
    team: ALPHA,
    boardId: "b1",
    type: "Print",
    units,
    done: false,
    completedAt: null,
    dueDate: null,
    createdAt: "2026-03-01",
    taskDueDate: "2026-03-15",
    assignees: [],
    ...overrides,
  };
}

const person = (id: string, displayName: string, deactivatedAt: string | null = null) =>
  ({ id, displayName, email: "", firstName: displayName, lastName: "", avatarUrl: null, jobTitle: null, department: null, timezone: "", deactivatedAt, createdAt: "", updatedAt: "" }) as User;

function facts(tasks: TaskFact[], assets: AssetFact[] = [], users: User[] = [], earliest = "2024-01-01"): DashboardFacts {
  return {
    tasks,
    requests: tasks.filter((t) => t.isIntake || t.request !== null),
    assets,
    teams: [ALPHA, BETA],
    users: new Map(users.map((u) => [u.id, u])),
    boards: new Map(),
    years: [2026, 2025],
    earliest,
  };
}

const period = (overrides: Partial<ReportingPeriod> = {}): ReportingPeriod => ({
  mode: "ytd",
  year: 2026,
  quarter: 1,
  month: 1,
  from: null,
  to: null,
  comparisonYear: 2025,
  ...overrides,
});

/**
 * The reporting contracts.
 *
 * These are the sums a manager reports upwards with, so the tests are about
 * whether a figure means what it says: that a partial year is not compared with
 * a whole one, that no history reads differently from nothing happening, and
 * that a due-date report does not quietly count work by when it was created.
 */
describe("reporting periods", () => {
  it("compares only the part of the year that has actually happened", () => {
    const resolved = resolvePeriod(period(), TODAY);
    expect(resolved.current).toEqual({ from: "2026-01-01", to: "2026-09-09" });
    expect(resolved.comparison).toEqual({ from: "2025-01-01", to: "2025-09-09" });
    expect(resolved.partial).toBe(true);
    expect(resolved.alignment).toBe("elapsed");
  });

  it("says a chosen full year is still running", () => {
    const resolved = resolvePeriod(period({ mode: "year" }), TODAY);
    expect(resolved.current).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolved.comparison).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    // The reader asked for the whole year; the page has to say that the year is
    // not over rather than present nine months as twelve.
    expect(resolved.partial).toBe(true);
    expect(resolvePeriod(period({ mode: "year", year: 2025, comparisonYear: 2024 }), TODAY).partial).toBe(false);
  });

  it("clamps 29 February to the 28th in a common year", () => {
    const leap = resolvePeriod(period({ year: 2028, comparisonYear: 2027 }), "2028-02-29");
    expect(leap.current.to).toBe("2028-02-29");
    expect(leap.comparison!.to).toBe("2027-02-28");
  });

  it("lines a quarter and a month up with the same slice of the other year", () => {
    expect(resolvePeriod(period({ mode: "quarter", quarter: 3 }), TODAY).comparison).toEqual({ from: "2025-07-01", to: "2025-09-30" });
    expect(resolvePeriod(period({ mode: "month", month: 2, year: 2026, comparisonYear: 2024 }), TODAY).comparison).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });
});

describe("volume and comparison", () => {
  /** The brief's fixture: 120 tasks and 400 units this year, 100 and 320 last. */
  function twoYears(): DashboardFacts {
    const tasks: TaskFact[] = [];
    const assets: AssetFact[] = [];
    const build = (year: number, count: number, units: number) => {
      for (let i = 0; i < count; i += 1) {
        const month = String((i % 6) + 1).padStart(2, "0");
        const t = task({ createdAt: `${year}-${month}-05`, dueDate: `${year}-${month}-20` });
        tasks.push(t);
        if (i < units) assets.push(asset(t.id, Math.floor(units / count) + (i < units % count ? 1 : 0), { createdAt: t.createdAt, taskDueDate: t.dueDate }));
      }
    };
    build(2026, 120, 400);
    build(2025, 100, 320);
    return facts(tasks, assets);
  }

  it("reconciles the headline figures with the fixture", () => {
    const report = volumeReport(twoYears(), resolvePeriod(period(), TODAY), "created", null);
    expect(report.tasks.current).toBe(120);
    expect(report.tasks.comparison).toBe(100);
    expect(report.tasks.delta).toBe(20);
    expect(report.tasks.percent).toBeCloseTo(20, 5);
    expect(report.assetUnits.current).toBe(400);
    expect(report.assetUnits.comparison).toBe(320);
    expect(report.assetUnits.delta).toBe(80);
    expect(report.assetUnits.percent).toBeCloseTo(25, 5);
  });

  it("weighs the same deliverables into hours, and agrees with the counts", () => {
    // Print takes 2 h a unit (4 a day); the fixture's assets are all Print.
    const rates: AssetRates = { Print: { qty: 4, every: 1, per: "day" } };
    const data = twoYears();
    const resolved = resolvePeriod(period(), TODAY);
    const report = volumeReport(data, resolved, "created", null, rates);

    // 400 units this year, 320 last, at 2 h each — derived from exactly the
    // deliverables the asset count came from, so the two cannot disagree about
    // which period they describe.
    expect(report.effort.current).toBe(800);
    expect(report.effort.comparison).toBe(640);
    expect(report.effort.delta).toBe(160);
    expect(report.effort.percent).toBeCloseTo(25, 5);
    expect(report.effort.percent).toBeCloseTo(report.assetUnits.percent!, 5);

    // And the monthly effort series adds up to the headline.
    const rows = monthlyComparison(data, resolved, "created", "effort", null, rates);
    expect(rows.reduce((total, row) => total + (row.current ?? 0), 0)).toBe(800);
  });

  it("reports no effort at all for a workspace that has recorded no rates", () => {
    // Not a small number — none. The page asks hasAnyRate before leading with
    // it, because nought hours against 400 deliverables would be a lie.
    const report = volumeReport(twoYears(), resolvePeriod(period(), TODAY), "created", null);
    expect(report.assetUnits.current).toBe(400);
    expect(report.effort.current).toBe(0);
    expect(report.effort.comparison).toBe(0);
  });

  it("leaves an unrated type out of the hours rather than guessing at it", () => {
    const rates: AssetRates = { Print: { qty: 4, every: 1, per: "day" } };
    const data = facts([task({ id: "t1", createdAt: "2026-03-01" })], [asset("t1", 3, { type: "Print" }), asset("t1", 50, { type: "Video" })]);
    const report = volumeReport(data, resolvePeriod(period(), TODAY), "created", null, rates);
    expect(report.assetUnits.current).toBe(53);
    // The 50 unrated video units contribute nothing; the 3 print units are 6 h.
    expect(report.effort.current).toBe(6);
  });

  it("reconciles the monthly rows with the headline", () => {
    const data = twoYears();
    const resolved = resolvePeriod(period(), TODAY);
    const rows = monthlyComparison(data, resolved, "created", "tasks", null);
    const sum = (key: "current" | "comparison") => rows.reduce((total, row) => total + (row[key] ?? 0), 0);
    expect(sum("current")).toBe(120);
    expect(sum("comparison")).toBe(100);
  });

  it("tells a month that has not happened apart from a month with nothing in it", () => {
    const rows = monthlyComparison(twoYears(), resolvePeriod(period(), TODAY), "created", "tasks", null);
    // The fixture puts work in the first six months only.
    expect(rows[6]!.current).toBe(0);
    // October is past the year-to-date cut, so it has no answer at all.
    expect(rows[9]!.current).toBeNull();
  });

  it("says Unavailable rather than zero when there is no history", () => {
    const data = facts([task({ createdAt: "2026-03-01" })], [], [], "2026-01-01");
    const report = volumeReport(data, resolvePeriod(period({ comparisonYear: 2024 }), TODAY), "created", null);
    expect(report.tasks.current).toBe(1);
    // The workspace did not exist in 2024. That is not "down 100%".
    expect(report.tasks.comparison).toBeNull();
    expect(report.tasks.percent).toBeNull();
    expect(report.comparison).toBeNull();
  });

  it("gives a true zero baseline a difference but no percentage", () => {
    const result = compare(12, 0);
    expect(result.delta).toBe(12);
    expect(result.percent).toBeNull();
  });

  it("reports a decrease as a decrease", () => {
    const result = compare(80, 100);
    expect(result.delta).toBe(-20);
    expect(result.percent).toBeCloseTo(-20, 5);
  });

  it("never counts undated work as scheduled", () => {
    const undated = task({ createdAt: "2026-03-01", dueDate: null });
    expect(reportingDate(undated, "due")).toBeNull();
    expect(reportingDate(undated, "created")).toBe("2026-03-01");

    const report = volumeReport(facts([undated]), resolvePeriod(period(), TODAY), "due", null);
    expect(report.tasks.current).toBe(0);
    // Counted, but as what it is: work with no date, reported beside the total.
    expect(report.current.undatedTasks).toBe(1);
  });

  it("keeps a renamed department as one row", () => {
    const renamed = { id: "d1", name: "Communications", inferred: false };
    const data = facts([
      task({ createdAt: "2026-03-01", department: renamed }),
      task({ createdAt: "2025-03-01", department: renamed }),
      task({ createdAt: "2026-03-02", department: null }),
    ]);
    const report = volumeReport(data, resolvePeriod(period(), TODAY), "created", null);
    const rows = dimensionComparison(report, "department", "tasks", () => "#000");
    expect(rows.find((r) => r.name === "Communications")).toMatchObject({ current: 1, comparison: 1, delta: 0 });
    // Work nobody labelled is its own bucket, never folded into a real one.
    expect(rows.find((r) => r.name === "Unknown")?.current).toBe(1);
  });

  it("measures asset types in units, because tasks by type are not additive", () => {
    const t = task({ createdAt: "2026-03-01" });
    const data = facts([t], [asset(t.id, 3, { type: "Print" }), asset(t.id, 5, { type: "Social" }), asset(t.id, 1, { type: "Video" })]);
    const report = volumeReport(data, resolvePeriod(period(), TODAY), "created", null);
    const rows = dimensionComparison(report, "assetType", "tasks", () => "#000");
    // One task, nine units, three types. The rows sum to the units, not to one.
    expect(rows.reduce((sum, r) => sum + r.current, 0)).toBe(9);
    expect(report.tasks.current).toBe(1);
    expect(report.assetUnits.current).toBe(9);
  });
});

describe("as of now", () => {
  const overdue = task({ dueDate: "2026-09-01" });
  const soon = task({ dueDate: "2026-09-11" });
  const blocked = task({ dueDate: "2026-10-01", status: "stuck" });
  const done = task({ dueDate: "2026-09-01", isDone: true, status: "done" });
  const undated = task({ dueDate: null });

  it("is not moved by the reporting filter", () => {
    // The same call, whatever period the reader has chosen: `operations` takes
    // no period at all, which is the point.
    const snapshot = operations(facts([overdue, soon, blocked, done, undated]), TODAY, null);
    expect(snapshot.overdue.map((t) => t.id)).toEqual([overdue.id]);
    expect(snapshot.dueThisWeek.map((t) => t.id)).toEqual([soon.id]);
    expect(snapshot.blocked.map((t) => t.id)).toEqual([blocked.id]);
    expect(snapshot.noDueDate.map((t) => t.id)).toEqual([undated.id]);
  });

  it("lists each task once, under its most pressing reason", () => {
    const both = task({ dueDate: "2026-09-01", status: "stuck" });
    const rows = attention(operations(facts([both]), TODAY, null), TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.reason).toBe("overdue");
    expect(rows[0]!.daysLate).toBe(8);
  });

  it("orders by reason then by deadline, with no invented score", () => {
    const late1 = task({ name: "B", dueDate: "2026-09-01" });
    const late2 = task({ name: "A", dueDate: "2026-08-01" });
    const rows = attention(operations(facts([late1, late2, blocked]), TODAY, null), TODAY);
    expect(rows.map((r) => r.task.name)).toEqual(["A", "B", blocked.name]);
  });

  it("shows work due in the next few weeks and nothing already gone", () => {
    const rows = upcoming(facts([overdue, soon, blocked, done]), TODAY, null, 4);
    expect(rows.map((t) => t.id)).toEqual([soon.id, blocked.id]);
  });
});

describe("assigned workload", () => {
  const people = [person("u1", "Jane"), person("u2", "Minh"), person("u3", "Nobody's busy"), person("u4", "Gone", "2026-01-01")];

  it("names everyone, including the people with nothing on", () => {
    const rows = assignedWorkload(facts([task({ owners: ["u1"], dueDate: "2026-09-12" })], [], people), TODAY, null, 4);
    // Not a top-eight ranking: a person with no work is a person with capacity
    // to discuss, and they were previously simply absent.
    expect(rows.map((r) => r.name)).toContain("Nobody's busy");
    expect(rows.find((r) => r.name === "Jane")?.tasks).toBe(1);
  });

  it("puts work nobody owns at the top, as its own row", () => {
    const rows = assignedWorkload(facts([task({ owners: [], dueDate: "2026-09-12" })], [], people), TODAY, null, 4);
    expect(rows[0]!.userId).toBeNull();
    expect(rows[0]!.tasks).toBe(1);
  });

  it("counts a shared task under both owners, and says so by not summing", () => {
    const shared = task({ owners: ["u1", "u2"], dueDate: "2026-09-12" });
    const rows = assignedWorkload(facts([shared], [], people), TODAY, null, 4);
    expect(rows.find((r) => r.name === "Jane")?.tasks).toBe(1);
    expect(rows.find((r) => r.name === "Minh")?.tasks).toBe(1);
    // Two association counts over one task: the total is deliberately not 1.
    expect(rows.reduce((sum, r) => sum + r.tasks, 0)).toBe(2);
  });

  it("keeps a former member's outstanding work visible", () => {
    const rows = assignedWorkload(facts([task({ owners: ["u4"], dueDate: "2026-09-12" })], [], people), TODAY, null, 4);
    const gone = rows.find((r) => r.userId === "u4");
    expect(gone?.tasks).toBe(1);
    expect(gone?.former).toBe(true);
  });

  it("separates overdue, scheduled, in progress and undated", () => {
    const rows = assignedWorkload(
      facts(
        [
          task({ owners: ["u1"], dueDate: "2026-09-01" }),
          task({ owners: ["u1"], dueDate: "2026-09-12" }),
          task({ owners: ["u1"], dueDate: "2026-09-13", status: "progress" }),
          task({ owners: ["u1"], dueDate: null }),
        ],
        [],
        people,
      ),
      TODAY,
      null,
      4,
    );
    expect(rows.find((r) => r.name === "Jane")).toMatchObject({ overdue: 1, scheduled: 1, inProgress: 1, undated: 1, tasks: 4 });
  });
});

describe("coverage", () => {
  it("counts what the figures cannot see", () => {
    const gaps = coverage([task({ dueDate: null }), task({ owners: [] }), task({ status: "none", owners: ["u1"], department: { id: "d", name: "Comm.", inferred: false } })]);
    expect(gaps).toMatchObject({ tasks: 3, withoutDueDate: 1, withoutOwner: 2, withoutDepartment: 2, withoutStatus: 1 });
  });
});

/**
 * Every chart in the dashboard paints with raw CSS, so a colour has to be a
 * value and never a token. This is the regression that made bars vanish: the
 * department palette handed back tokens, and CSS knows "indigo" and "pink" but
 * not "sky", "amber" or "rose" — so some bars drew in a washed-out CSS colour
 * and the rest drew nothing at all beside a perfectly good number.
 */
describe("departmentHex", () => {
  it("is always a hex value, never a colour token", () => {
    // The whole tag palette, reached through the names that hash onto it.
    const names = ["Contents", "Events", "Digital", "Comm.", "Marketing VN", "Web", "Brand", "Publication", "Tech", "Melbourne", "Production", "A", "B", "C", "D", "E", "F", "G"];
    for (const name of names) {
      expect(departmentHex(name), name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("covers the tokens CSS does not know, which is where the bars went", () => {
    // "Events" hashes onto "amber" and "Digital" onto "sky"; neither is a CSS
    // colour keyword, so each used to render as no fill at all.
    expect(departmentHex("Events")).toBe("#fbbf24");
    expect(departmentHex("Digital")).toBe("#0ea5e9");
  });

  it("gives an unnamed department the grey the rest of the page uses", () => {
    expect(departmentHex(UNKNOWN_DEPARTMENT)).toBe("#9ca3af");
  });

  it("is stable, so a department keeps its colour between renders", () => {
    expect(departmentHex("Comm.")).toBe(departmentHex("Comm."));
    expect(departmentHex("Comm.")).not.toBe(departmentHex("Digital"));
  });
});

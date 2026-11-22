import { describe, expect, it } from "vitest";
import type { TaskFact } from "@/features/dashboard/analytics";
import { amountOfLines, amountOfTasks } from "@/features/dashboard/drill/drill";

// One poster takes two hours (1 every 2 hours); videos have no rate.
const rates = { Poster: { qty: 1, every: 2, per: "hour" as const } };
const lines = [
  { taskId: "a", type: "Poster", units: 3 },
  { taskId: "a", type: "Video", units: 1 },
  { taskId: "b", type: "poster", units: 1 },
];

describe("what each task adds to a dashboard figure", () => {
  it("sums a figure's own lines per task, in hours or in units", () => {
    const hours = amountOfLines(lines, "effort", rates)!;
    expect(hours.unit).toBe("hours");
    // An unrated type adds no hours; the type is matched whatever its case.
    expect(Object.fromEntries(hours.byTask)).toEqual({ a: 6, b: 2 });

    const units = amountOfLines(lines, "assets", rates)!;
    expect(units.unit).toBe("units");
    expect(Object.fromEntries(units.byTask)).toEqual({ a: 4, b: 1 });
  });

  it("has nothing to add for a figure in tasks, where the list is the count", () => {
    expect(amountOfLines(lines, "tasks", rates)).toBeUndefined();
    expect(amountOfTasks([], "tasks", () => 1)).toBeUndefined();
  });

  it("takes whole tasks at the value the figure gave them", () => {
    const tasks = [{ id: "a" }, { id: "b" }] as unknown as TaskFact[];
    const amount = amountOfTasks(tasks, "assets", (t) => (t.id === "a" ? 7 : 0))!;
    expect(Object.fromEntries(amount.byTask)).toEqual({ a: 7, b: 0 });
  });
});

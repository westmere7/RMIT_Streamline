import { describe, expect, it } from "vitest";
import type { BoardColumn, CalendarTaskRow } from "@/domain";
import { CalendarService } from "@/services/calendar-service";
import { LocalCalendarRepository, memoryListStore } from "@/data/local/repositories/calendar-repository";
import type { Repositories } from "@/data/repositories";
import { buildTaskEvents, densityLevel, readView, stepAnchor, taskCountByDay, tasksOn, viewRange, weekdayOf } from "@/features/calendar/model";

const col = (id: string, type: BoardColumn["type"], position: number, settings: BoardColumn["settings"] = { kind: "none" } as never, role: BoardColumn["role"] = null): BoardColumn => ({
  id, boardId: "b1", name: id, type, settings, position, width: 120, hidden: false, role, createdAt: "",
});

const STATUS = col("status", "STATUS", 0, { kind: "status", labels: [{ id: "doing", name: "Working on it", color: "amber" }, { id: "done", name: "Done", color: "green" }], doneLabelIds: ["done"], defaultLabelId: null } as never);
const DUE = col("due", "DATE", 1);
const TIMELINE = col("timeline", "TIMELINE", 2);
const PIC = col("pic", "PERSON", 3);

const row = (id: string, values: CalendarTaskRow["values"], extra: Partial<CalendarTaskRow> = {}): CalendarTaskRow => ({ id, boardId: "b1", groupId: "g", parentItemId: null, name: id, ticket: null, createdAt: "", values, assets: [], ...extra });

describe("calendar model", () => {
  it("reads deadlines, timelines, status and people through the board's roles", () => {
    const events = buildTaskEvents(
      [
        row("a", [{ columnId: "due", value: { type: "DATE", date: "2026-12-04" } }, { columnId: "status", value: { type: "STATUS", labelId: "doing" } }, { columnId: "pic", value: { type: "PERSON", userIds: ["u1"] } }]),
        row("b", [{ columnId: "timeline", value: { type: "TIMELINE", start: "2026-12-01", end: "2026-12-10" } }, { columnId: "status", value: { type: "STATUS", labelId: "done" } }]),
        row("c", [{ columnId: "pic", value: { type: "PERSON", userIds: ["u2"] } }]),
      ],
      [STATUS, DUE, TIMELINE, PIC],
      {},
    );
    expect(events.map((e) => e.itemId)).toEqual(["b", "a"]);
    const a = events.find((e) => e.itemId === "a")!;
    expect([a.startsOn, a.endsOn, a.dueOn, a.done, a.status?.name, a.peopleIds]).toEqual(["2026-12-04", "2026-12-04", "2026-12-04", false, "Working on it", ["u1"]]);
    const b = events.find((e) => e.itemId === "b")!;
    expect([b.startsOn, b.endsOn, b.dueOn, b.done, b.dateColumn.id]).toEqual(["2026-12-01", "2026-12-10", null, true, "timeline"]);
  });

  it("moves the deadline when a task has one beside its timeline", () => {
    const [e] = buildTaskEvents([row("x", [{ columnId: "due", value: { type: "DATE", date: "2026-12-04" } }, { columnId: "timeline", value: { type: "TIMELINE", start: "2026-12-01", end: "2026-12-03" } }])], [DUE, TIMELINE], {});
    expect([e!.startsOn, e!.endsOn, e!.dueOn, e!.dateColumn.id]).toEqual(["2026-12-01", "2026-12-03", "2026-12-04", "due"]);
  });

  it("draws a task on its deadline, or on every day it covers", () => {
    const events = buildTaskEvents([row("b", [{ columnId: "timeline", value: { type: "TIMELINE", start: "2026-12-01", end: "2026-12-03" } }])], [DUE, TIMELINE], {});
    expect(tasksOn(events, "2026-12-02")).toHaveLength(0);
    expect(tasksOn(events, "2026-12-03")).toHaveLength(1);
    expect(tasksOn(events, "2026-12-02", true)).toHaveLength(1);
  });

  it("counts and shades the tasks for the density overlay", () => {
    const events = buildTaskEvents(
      [
        row("a", [{ columnId: "timeline", value: { type: "TIMELINE", start: "2026-12-01", end: "2026-12-03" } }]),
        row("b", [{ columnId: "timeline", value: { type: "TIMELINE", start: "2026-12-02", end: "2026-12-05" } }]),
        row("c", [{ columnId: "timeline", value: { type: "TIMELINE", start: "2026-12-04", end: "2026-12-04" } }]),
        row("d", [{ columnId: "due", value: { type: "DATE", date: "2026-11-20" } }]),
      ],
      [DUE, TIMELINE],
      {},
    );
    const running = taskCountByDay(events, "2026-12-01", "2026-12-31", true);
    expect([running.get("2026-12-02"), running.get("2026-12-04"), running.get("2026-12-06")]).toEqual([2, 2, undefined]);
    expect(taskCountByDay(events, "2026-12-01", "2026-12-31", false).get("2026-12-03")).toBe(1);
    expect([densityLevel(0, 9), densityLevel(1, 9), densityLevel(9, 9)]).toEqual([0, 1, 5]);
  });

  it("lays out weeks from Monday", () => {
    expect(viewRange("month", "2026-11-28")).toEqual({ from: "2026-10-26", to: "2026-12-06" });
    expect(viewRange("week", "2026-11-29")).toEqual({ from: "2026-11-23", to: "2026-11-29" });
    expect(weekdayOf("2026-11-30")).toBe("Mon");
    expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepAnchor("year", "2026-06-15", -1)).toBe("2025-01-01");
    expect(readView("week", "year")).toBe("week");
    expect(readView("month", "year")).toBe("year");
    expect(readView("density", "week")).toBe("week");
    expect(readView(null, "year")).toBe("year");
  });
});

describe("calendar service", () => {
  const service = () => new CalendarService({ calendar: new LocalCalendarRepository(memoryListStore()) } as unknown as Repositories);

  it("seeds Vietnam's holidays and copies the fixed ones a year on", async () => {
    const s = service();
    const seeded = await s.listHolidays("w");
    expect(seeded.filter((h) => h.startsOn.startsWith("2026-"))).toHaveLength(7);
    const result = await s.copyYearForward("w", 2027);
    expect(result.lunar.sort()).toEqual(["Hùng Kings Commemoration", "Tết (Lunar New Year)"].sort());
    const next = (await s.listHolidays("w")).filter((h) => h.startsOn.startsWith("2028-"));
    expect(next.map((h) => h.startsOn)).toEqual(["2028-01-01", "2028-04-30", "2028-05-01", "2028-09-01", "2028-11-24"]);
    // Twice is once.
    expect((await s.copyYearForward("w", 2027)).copied).toBe(0);
  });

  it("refuses what a person typed wrong before it reaches the database", async () => {
    const s = service();
    await expect(s.createLeave({ workspaceId: "w", userId: "u", startsOn: "2026-12-05", endsOn: "2026-12-01", startHalf: false, endHalf: false, kind: "ANNUAL", coverUserId: null, note: null })).rejects.toThrow("before the first");
    await expect(s.createLeave({ workspaceId: "w", userId: "u", startsOn: "2026-12-01", endsOn: "2026-12-01", startHalf: false, endHalf: false, kind: "ANNUAL", coverUserId: "u", note: null })).rejects.toThrow("someone else");
    await expect(s.createHoliday({ workspaceId: "w", name: "Long", startsOn: "2026-12-01", endsOn: "2026-12-02", halfDay: "AM", kind: "PUBLIC", note: null })).rejects.toThrow("half day");
  });

  it("keeps one feed address per person, and a new one stops the old", async () => {
    const s = service();
    const first = await s.getOrCreateFeed("w", "u");
    expect(first.token).toMatch(/^[a-z0-9]{40}$/);
    expect((await s.getOrCreateFeed("w", "u")).token).toBe(first.token);
    const second = await s.replaceFeed("w", "u");
    expect(second.token).not.toBe(first.token);
    expect((await s.getFeed("w", "u"))?.token).toBe(second.token);
    await s.stopFeed("w", "u");
    expect(await s.getFeed("w", "u")).toBeNull();
  });
});

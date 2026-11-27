import { describe, expect, it } from "vitest";
import { describeTimeCondition, timeConditionHolds, type AutomationCondition } from "@/domain";

/**
 * The automation's time check (v0.170.0): before, after, between and outside,
 * by the time of day or through the week, in the workspace's own timezone.
 */

type TimeCondition = Extract<AutomationCondition, { kind: "time" }>;
const TZ = "Asia/Ho_Chi_Minh"; // UTC+7, no daylight saving
/** A local wall-clock moment in Vietnam as an instant. 2026-11-23 is a Monday, 2026-11-29 a Sunday. */
const at = (local: string) => new Date(`${local}:00+07:00`);
const holds = (condition: TimeCondition, local: string) => timeConditionHolds(condition, at(local), TZ);

describe("the time condition", () => {
  it("before Sunday 17:00 holds all week until then, and not after", () => {
    const c: TimeCondition = { kind: "time", op: "before", scope: "week", from: { day: 6, time: "17:00" } };
    expect(holds(c, "2026-11-23T00:00")).toBe(true); // Monday
    expect(holds(c, "2026-11-27T12:00")).toBe(true); // Friday
    expect(holds(c, "2026-11-29T16:59")).toBe(true); // Sunday
    expect(holds(c, "2026-11-29T17:00")).toBe(false);
    expect(holds(c, "2026-11-29T23:30")).toBe(false);
    expect(describeTimeCondition(c)).toBe("it is before Sunday 17:00");
  });

  it("between two times of day, including one that runs past midnight", () => {
    const office: TimeCondition = { kind: "time", op: "between", scope: "day", from: { time: "09:00" }, to: { time: "17:00" } };
    expect(holds(office, "2026-11-25T09:00")).toBe(true);
    expect(holds(office, "2026-11-25T16:59")).toBe(true);
    expect(holds(office, "2026-11-25T17:00")).toBe(false);
    expect(holds(office, "2026-11-25T08:59")).toBe(false);
    const night: TimeCondition = { kind: "time", op: "between", scope: "day", from: { time: "22:00" }, to: { time: "06:00" } };
    expect(holds(night, "2026-11-25T23:00")).toBe(true);
    expect(holds(night, "2026-11-26T05:59")).toBe(true);
    expect(holds(night, "2026-11-26T12:00")).toBe(false);
  });

  it("the weekend, Friday 17:00 to Monday 09:00, and outside it", () => {
    const weekend: TimeCondition = { kind: "time", op: "between", scope: "week", from: { day: 4, time: "17:00" }, to: { day: 0, time: "09:00" } };
    expect(holds(weekend, "2026-11-27T18:00")).toBe(true); // Friday evening
    expect(holds(weekend, "2026-11-28T12:00")).toBe(true); // Saturday
    expect(holds(weekend, "2026-11-30T08:00")).toBe(true); // Monday morning
    expect(holds(weekend, "2026-11-25T12:00")).toBe(false); // Wednesday
    const workweek: TimeCondition = { ...weekend, op: "outside" };
    expect(holds(workweek, "2026-11-25T12:00")).toBe(true);
    expect(holds(workweek, "2026-11-28T12:00")).toBe(false);
    expect(describeTimeCondition(workweek)).toBe("it is not between Friday 17:00 and Monday 09:00");
  });

  it("after a time of day; read in the workspace's timezone, not the server's", () => {
    const c: TimeCondition = { kind: "time", op: "after", scope: "day", from: { time: "17:00" } };
    // 10:30 UTC is 17:30 in Vietnam.
    expect(timeConditionHolds(c, new Date("2026-11-25T10:30:00Z"), TZ)).toBe(true);
    expect(timeConditionHolds(c, new Date("2026-11-25T10:30:00Z"), "UTC")).toBe(false);
  });

  it("a span with no end holds nothing", () => {
    const broken: TimeCondition = { kind: "time", op: "between", scope: "day", from: { time: "09:00" }, to: null };
    expect(holds(broken, "2026-11-25T12:00")).toBe(false);
  });
});

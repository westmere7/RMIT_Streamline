import { describe, expect, it } from "vitest";
import { bucketDate, formatDateRange, formatShortDate, isOverdue, shiftISODate } from "@/lib/dates/dates";
import { sectionFor, type MyWorkItem } from "@/services/my-work-service";

// Friday 4 September 2026
const now = new Date("2026-09-04T10:00:00");

describe("bucketDate", () => {
  it("groups dates relative to today with a Monday-start week", () => {
    expect(bucketDate("2026-09-03", now)).toBe("overdue");
    expect(bucketDate("2026-09-04", now)).toBe("today");
    expect(bucketDate("2026-09-06", now)).toBe("thisWeek"); // Sunday of the same week
    expect(bucketDate("2026-09-07", now)).toBe("later"); // next Monday
    expect(bucketDate(null, now)).toBe("noDate");
    expect(bucketDate("not-a-date", now)).toBe("noDate");
  });
});

describe("sectionFor", () => {
  const entry = (dueDate: string | null, isDone = false): MyWorkItem =>
    ({ dueDate, isDone }) as unknown as MyWorkItem;
  it("puts done items in completed regardless of date", () => {
    expect(sectionFor(entry("2026-01-01", true), now)).toBe("completed");
    expect(sectionFor(entry("2026-01-01"), now)).toBe("overdue");
    expect(sectionFor(entry(null), now)).toBe("noDate");
  });
});

describe("formatting", () => {
  it("formats short dates and ranges", () => {
    expect(formatShortDate("2026-09-08", now)).toBe("Sep 8");
    expect(formatShortDate("2025-09-08", now)).toBe("Sep 8, 2025");
    expect(formatDateRange("2026-09-02", "2026-09-10", now)).toBe("Sep 2 – 10");
    expect(formatDateRange("2026-08-29", "2026-09-02", now)).toBe("Aug 29 – Sep 2");
    expect(formatDateRange(null, "2026-09-02", now)).toBe("Until Sep 2");
  });

  it("detects overdue dates and shifts dates", () => {
    expect(isOverdue("2026-09-03", now)).toBe(true);
    expect(isOverdue("2026-09-04", now)).toBe(false);
    expect(shiftISODate("2026-09-28", 5)).toBe("2026-10-03");
  });
});

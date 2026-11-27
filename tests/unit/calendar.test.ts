import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  crunchBefore,
  dayCapacity,
  dueDateConflicts,
  isWorkingDay,
  loadLevel,
  workingDayOnOrBefore,
  workingDaysBetween,
  workingShare,
  type LeaveEntry,
  type WorkspaceHoliday,
} from "@/domain";

const holiday = (name: string, startsOn: string, endsOn = startsOn, halfDay: "AM" | "PM" | null = null): WorkspaceHoliday => ({
  id: name + startsOn, workspaceId: "w", name, startsOn, endsOn, halfDay, kind: "PUBLIC", note: null, createdBy: null, createdAt: "", updatedAt: "",
});
const leave = (userId: string, startsOn: string, endsOn: string, extra: Partial<LeaveEntry> = {}): LeaveEntry => ({
  id: userId + startsOn, workspaceId: "w", userId, startsOn, endsOn, startHalf: false, endHalf: false, kind: "ANNUAL", coverUserId: null, note: null, status: "PLANNED", createdBy: null, createdAt: "", updatedAt: "", ...extra,
});

// Tết 2026 runs Sat 14 – Sun 22 Feb; 13 Feb is a Friday, 23 Feb a Monday.
const TET = holiday("Tết", "2026-02-14", "2026-02-22");
const cal = { holidays: [TET, holiday("Labour Day", "2026-05-01"), holiday("Half day", "2026-03-06", "2026-03-06", "PM")] };

describe("working days around holidays and leave", () => {
  it("knows weekends, holidays and half days", () => {
    expect(isWorkingDay(cal, "2026-02-13")).toBe(true);
    expect(isWorkingDay(cal, "2026-02-16")).toBe(false); // a Monday inside Tết
    expect(isWorkingDay(cal, "2026-02-21")).toBe(false);
    expect(workingShare(cal, "2026-03-06")).toBe(0.5);
    expect(workingShare(cal, "2026-03-07")).toBe(0); // Saturday
  });

  it("counts and adds working days across Tết", () => {
    expect(addWorkingDays(cal, "2026-02-13", 1)).toBe("2026-02-23");
    expect(addWorkingDays(cal, "2026-02-23", -1)).toBe("2026-02-13");
    expect(workingDayOnOrBefore(cal, "2026-02-18")).toBe("2026-02-13");
    expect(workingDaysBetween(cal, "2026-02-09", "2026-02-27")).toBe(10);
  });

  it("takes a person's leave, half days included, and ignores cancelled leave", () => {
    const withLeave = { ...cal, leave: [leave("emily", "2026-03-02", "2026-03-04", { endHalf: true }), leave("emily", "2026-03-10", "2026-03-10", { status: "CANCELLED" })] };
    expect(workingShare(withLeave, "2026-03-02", "emily")).toBe(0);
    expect(workingShare(withLeave, "2026-03-04", "emily")).toBe(0.5);
    expect(workingShare(withLeave, "2026-03-02", "tom")).toBe(1);
    expect(workingShare(withLeave, "2026-03-10", "emily")).toBe(1);
    expect(dayCapacity(withLeave, 40, "2026-03-04", "emily")).toBe(4);
  });
});

describe("planning around holidays", () => {
  it("flags a due date on a holiday, a weekend or someone's leave", () => {
    const withLeave = { ...cal, leave: [leave("grace", "2026-04-06", "2026-04-08")] };
    expect(dueDateConflicts(withLeave, "2026-02-18", [], (id) => id).map((c) => c.kind)).toEqual(["HOLIDAY"]);
    expect(dueDateConflicts(withLeave, "2026-04-04", [], (id) => id).map((c) => c.kind)).toEqual(["WEEKEND"]);
    expect(dueDateConflicts(withLeave, "2026-04-07", ["grace", "tom"], (id) => id)).toEqual([{ kind: "LEAVE", label: "grace", userId: "grace" }]);
    expect(dueDateConflicts(withLeave, "2026-04-09", ["grace"], (id) => id)).toEqual([]);
  });

  it("finds the working days before the next holiday", () => {
    const crunch = crunchBefore(cal, "2026-02-02", 5)!;
    expect(crunch.holiday.name).toBe("Tết");
    expect(crunch.from).toBe("2026-02-09");
    expect(crunch.to).toBe("2026-02-13");
  });

  it("grades load against capacity", () => {
    expect(loadLevel(0, 8)).toBe("IDLE");
    expect(loadLevel(4, 8)).toBe("OK");
    expect(loadLevel(7, 8)).toBe("BUSY");
    expect(loadLevel(9, 8)).toBe("OVER");
    expect(loadLevel(1, 0)).toBe("OVER");
  });
});

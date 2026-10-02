import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnValue } from "@/domain";
import { defaultSettingsFor, weeklyHoursOf } from "@/domain";
import { periods } from "@/features/boards/components/views/view-aggregates";
import { formatHours, itemHours, periodCapacity, spreadHours, utilisationLevel } from "@/features/boards/components/views/workload-hours";

// Friday 4 Sep 2026; weeks run Monday to Sunday.
const now = new Date("2026-09-04T09:00:00");
const column = (id: string, type: BoardColumn["type"], position: number): BoardColumn => ({ id, boardId: "b", name: id, type, settings: defaultSettingsFor(type), position, width: 100, hidden: false, createdAt: "" });
const columns = [column("due", "DATE", 0), column("timeline", "TIMELINE", 1)];
const values: Record<string, Record<string, ColumnValue>> = {
  // Two working weeks: Mon 7 Sep to Fri 18 Sep.
  fortnight: { timeline: { type: "TIMELINE", start: "2026-09-07", end: "2026-09-18" } },
  // Only a weekend.
  weekend: { timeline: { type: "TIMELINE", start: "2026-09-12", end: "2026-09-13" } },
  dated: { due: { type: "DATE", date: "2026-09-16" } },
};
const ctx = { columns, getValue: (itemId: string, columnId: string) => values[itemId]?.[columnId] };
const weeks = periods(now, "weeks", 3); // 31 Aug, 7 Sep, 14 Sep

describe("a task's hours", () => {
  it("weighs its deliverables by the workspace's rates, and counts nothing it has no rate for", () => {
    const rates = { Poster: { qty: 1, every: 4, per: "hour" as const }, Video: { qty: 1, every: 1, per: "day" as const } };
    expect(itemHours([{ assetType: "Poster", quantity: 3 }, { assetType: "video", quantity: null }, { assetType: "Banner", quantity: 5 }], rates)).toBe(20);
    expect(itemHours(undefined, rates)).toBe(0);
  });
});

describe("spreading hours across periods", () => {
  it("spreads a timeline's hours over its working days when work is active in a period", () => {
    expect(spreadHours("fortnight", 20, weeks, ctx, "active")).toEqual([0, 10, 10]);
  });

  it("keeps a weekend-only job on its weekend", () => {
    expect(spreadHours("weekend", 6, weeks, ctx, "active")).toEqual([0, 6, 0]);
  });

  it("puts everything in the period holding the due date otherwise", () => {
    expect(spreadHours("dated", 8, weeks, ctx, "due")).toEqual([0, 0, 8]);
    expect(spreadHours("dated", 8, weeks, ctx, "active")).toEqual([0, 0, 8]);
  });
});

describe("capacity", () => {
  it("is the seat's hours a week, a full week when it says nothing", () => {
    expect(weeklyHoursOf({ weeklyHours: 22.5 })).toBe(22.5);
    expect(weeklyHoursOf({ weeklyHours: null })).toBe(38);
    expect(weeklyHoursOf(undefined)).toBe(38);
  });

  it("is a fifth of the week on a working day and nothing at the weekend", () => {
    const days = periods(now, "days", 2); // Fri 4, Sat 5
    expect(periodCapacity(40, days[0]!, "days")).toBe(8);
    expect(periodCapacity(40, days[1]!, "days")).toBe(0);
    expect(periodCapacity(40, weeks[0]!, "weeks")).toBe(40);
  });

  it("reads booked against available as room, full, or over", () => {
    expect(utilisationLevel(0, 38)).toBe(0);
    expect(utilisationLevel(20, 38)).toBe(1);
    expect(utilisationLevel(38, 38)).toBe(2);
    expect(utilisationLevel(40, 38)).toBe(3);
    expect(utilisationLevel(2, 0)).toBe(3);
  });

  it("writes hours the way a cell reads them", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(0.4)).toBe("<1 h");
    expect(formatHours(7.3)).toBe("7.5 h");
    expect(formatHours(12.6)).toBe("13 h");
  });
});

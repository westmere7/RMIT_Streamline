import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { dateTimeSettings, defaultSettingsFor, formatDateTime, formatPlainDate, formatTimeOfDay, parseTimeOfDay } from "@/domain";
import { displayValue } from "@/services/column-display";
import { createServices } from "@/services";

const now = new Date(2026, 8, 25, 12, 0);

describe("date and time formats", () => {
  it("writes a day in each format, leaving this year off the short one", () => {
    expect(formatPlainDate("2026-09-16", "short", now)).toBe("Sep 16");
    expect(formatPlainDate("2025-09-16", "short", now)).toBe("Sep 16, 2025");
    expect(formatPlainDate("2026-09-16", "medium", now)).toBe("16 Sep 2026");
    expect(formatPlainDate("2026-09-16", "numeric", now)).toBe("16/09/2026");
    expect(formatPlainDate("2026-09-16", "iso", now)).toBe("2026-09-16");
    expect(formatPlainDate(null, "short")).toBeNull();
  });

  it("writes a time on either clock, and reads what people type", () => {
    expect(formatTimeOfDay("19:06", "24h")).toBe("19:06");
    expect(formatTimeOfDay("19:06", "12h")).toBe("7:06 PM");
    expect(formatTimeOfDay("00:05", "12h")).toBe("12:05 AM");
    expect(formatTimeOfDay("25:00", "24h")).toBeNull();
    expect(parseTimeOfDay("9:05")).toBe("09:05");
    expect(parseTimeOfDay("0930")).toBe("09:30");
    expect(parseTimeOfDay("7pm")).toBe("19:00");
    expect(parseTimeOfDay("12am")).toBe("00:00");
    expect(parseTimeOfDay("nope")).toBeNull();
  });

  it("keeps a date and time compact by default: Sep 16, 19:06", () => {
    const at = new Date(2026, 8, 16, 19, 6).toISOString();
    expect(formatDateTime(at, dateTimeSettings(defaultSettingsFor("DATETIME")), now)).toBe("Sep 16, 19:06");
    expect(formatDateTime(at, { dateFormat: "medium", timeFormat: "12h" }, now)).toBe("16 Sep 2026, 7:06 PM");
    // A column saved before it had settings reads the defaults.
    expect(dateTimeSettings({ kind: "none" })).toEqual({ kind: "datetime", dateFormat: "short", timeFormat: "24h" });
  });

  it("names a value in the activity log the way its column shows it", () => {
    const column = { id: "c", boardId: "b", name: "Shoot", type: "TIME" as const, settings: { kind: "datetime" as const, dateFormat: "short" as const, timeFormat: "12h" as const }, position: 0, width: 90, hidden: false, createdAt: "" };
    expect(displayValue(column, { type: "TIME", time: "08:30" }, [])).toBe("8:30 AM");
  });
});

describe("the Booking time column", () => {
  it("is Task Allocation's alone, and only one of it", async () => {
    const services = createServices(createLocalRepositories({ databaseName: `booked-at-${Date.now()}` }));
    await services.repos.admin.resetToSeed();
    await expect(services.boards.addColumn({ boardId: SEED_BOARD_IDS.rmitinerary, name: "Booking time", type: "BOOKED_AT" })).rejects.toThrow("Task Allocation only");

    const { board } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID);
    const columns = await services.repos.boards.listColumns(board.id);
    expect(columns.filter((c) => c.type === "BOOKED_AT")).toHaveLength(1);
    await expect(services.boards.addColumn({ boardId: board.id, name: "Booked", type: "BOOKED_AT" })).rejects.toThrow("already has a Booking time column");
  });
});

import { describe, expect, it } from "vitest";
import { addMonths, countdownSettings, DEFAULT_COUNTDOWN_SETTINGS, defaultSettingsFor, emptyValueFor, isEmptyValue, parseCountdownDuration, readCountdown } from "@/domain";
import { displayValue } from "@/services/column-display";

const now = new Date(2026, 8, 25, 12, 0);
const later = (ms: number) => new Date(now.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const read = (at: string, patch: Partial<typeof DEFAULT_COUNTDOWN_SETTINGS> = {}) => readCountdown(at, { ...DEFAULT_COUNTDOWN_SETTINGS, ...patch }, now);

describe("the Countdown column", () => {
  it("picks the unit from the time left, from a minute to months", () => {
    expect(read(later(30_000))?.text).toBe("1m");
    expect(read(later(MIN))?.text).toBe("1m");
    expect(read(later(45 * MIN))?.text).toBe("45m");
    expect(read(later(3 * HOUR + 20 * MIN))?.text).toBe("3h 20m");
    expect(read(later(3 * DAY + 3 * HOUR + 57 * MIN))?.text).toBe("3d 4h");
    expect(read(later(3 * DAY + 3 * HOUR))?.text).toBe("3d 3h");
    expect(read(later(3 * DAY + 4 * HOUR))?.text).toBe("3d 4h");
    expect(read(later(16 * DAY))?.text).toBe("2w 2d");
    expect(read(new Date(2026, 11, 25, 12, 0).toISOString())?.text).toBe("3mo");
    expect(read(new Date(2026, 11, 26, 12, 0).toISOString())?.text).toBe("3mo 1w");
    expect(read(new Date(2027, 0, 2, 12, 0).toISOString())?.text).toBe("3mo 2w");
  });

  it("counts up to the next minute, so a value just set reads as it was typed", () => {
    expect(read(later(3 * DAY + 4 * HOUR - 2_000))?.text).toBe("3d 4h");
    expect(read(later(45 * MIN - 2_000))?.text).toBe("45m");
    expect(readCountdown(new Date(2026, 10, 25, 12, 0).toISOString(), DEFAULT_COUNTDOWN_SETTINGS, new Date(now.getTime() + 2_000))?.text).toBe("2mo");
    expect(readCountdown(new Date(2026, 10, 25, 12, 0).toISOString(), DEFAULT_COUNTDOWN_SETTINGS, new Date(now.getTime() + 3 * MIN))?.text).toBe("2mo");
    expect(readCountdown(new Date(2026, 10, 25, 12, 0).toISOString(), DEFAULT_COUNTDOWN_SETTINGS, new Date(now.getTime() + 8 * DAY))?.text).toBe("1mo 4w");
  });

  it("leaves a zero second unit off", () => {
    expect(read(later(2 * DAY))?.text).toBe("2d");
    expect(read(later(2 * DAY - 5 * MIN))?.text).toBe("2d");
  });

  it("follows the column's style and units", () => {
    expect(read(later(3 * DAY + 4 * HOUR), { style: "words" })?.text).toBe("3 days 4 hours");
    expect(read(later(DAY + HOUR), { style: "words" })?.text).toBe("1 day 1 hour");
    expect(read(later(3 * DAY + 4 * HOUR), { precision: 1 })?.text).toBe("4d");
    expect(read(later(3 * DAY), { precision: 1 })?.text).toBe("3d");
  });

  it("turns amber near the end, and says what happened after it", () => {
    expect(read(later(2 * DAY))?.tone).toBe("normal");
    expect(read(later(5 * HOUR))?.tone).toBe("warning");
    expect(read(later(5 * HOUR), { warnWithin: "none" })?.tone).toBe("normal");
    expect(read(later(-2 * HOUR))).toEqual({ text: "2h over", tone: "over" });
    expect(read(later(-20_000))).toEqual({ text: "Now", tone: "over" });
    expect(read(later(-2 * HOUR), { ending: "ended" })).toEqual({ text: "Ended", tone: "ended" });
    expect(readCountdown(null, DEFAULT_COUNTDOWN_SETTINGS, now)).toBeNull();
  });

  it("counts calendar months, holding the 31st to a short month's end", () => {
    expect(addMonths(new Date(2026, 0, 31, 9, 0), 1)).toEqual(new Date(2026, 1, 28, 9, 0));
    expect(readCountdown(new Date(2026, 1, 28, 9, 0).toISOString(), DEFAULT_COUNTDOWN_SETTINGS, new Date(2026, 0, 31, 9, 0))?.text).toBe("1mo");
  });

  it("reads a typed time from now", () => {
    expect(parseCountdownDuration("45m", now)).toEqual(new Date(now.getTime() + 45 * MIN));
    expect(parseCountdownDuration("1h 30m", now)).toEqual(new Date(now.getTime() + 90 * MIN));
    expect(parseCountdownDuration("2 days", now)).toEqual(new Date(now.getTime() + 2 * DAY));
    expect(parseCountdownDuration("2w", now)).toEqual(new Date(now.getTime() + 14 * DAY));
    expect(parseCountdownDuration("4mo", now)).toEqual(new Date(2027, 0, 25, 12, 0));
    expect(parseCountdownDuration("3 months and 2d", now)).toEqual(new Date(2026, 11, 27, 12, 0));
    expect(parseCountdownDuration("0m", now)).toBeNull();
    expect(parseCountdownDuration("soon", now)).toBeNull();
    expect(parseCountdownDuration("3x", now)).toBeNull();
    expect(parseCountdownDuration("3", now)).toBeNull();
  });

  it("stores the end, empty until set, with defaults for an old column", () => {
    expect(emptyValueFor("COUNTDOWN")).toEqual({ type: "COUNTDOWN", at: null });
    expect(isEmptyValue({ type: "COUNTDOWN", at: null })).toBe(true);
    expect(defaultSettingsFor("COUNTDOWN")).toEqual(DEFAULT_COUNTDOWN_SETTINGS);
    expect(countdownSettings({ kind: "none" })).toEqual(DEFAULT_COUNTDOWN_SETTINGS);
    expect(countdownSettings({ kind: "countdown", style: "words", precision: 7 } as never)).toEqual({ ...DEFAULT_COUNTDOWN_SETTINGS, style: "words" });
  });

  it("logs the end moment, not the time left", () => {
    const column = { id: "c", boardId: "b", name: "Launch", type: "COUNTDOWN" as const, settings: DEFAULT_COUNTDOWN_SETTINGS, position: 0, width: 110, hidden: false, createdAt: "" };
    expect(displayValue(column, { type: "COUNTDOWN", at: new Date(new Date().getFullYear(), 8, 16, 19, 6).toISOString() }, [])).toBe("Sep 16, 19:06");
  });
});

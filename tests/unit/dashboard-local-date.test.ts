import { describe, expect, it } from "vitest";
import { localDateOf } from "@/features/dashboard/local-date";

/**
 * Days on the dashboard (v0.159.2): a stored timestamp is read as a date where
 * the team is, not in UTC. Cutting the date off the UTC string put anything
 * made between midnight and 7am in Vietnam on the day before.
 */
describe("the day a moment fell on", () => {
  const VN = "Asia/Ho_Chi_Minh";

  it("is the team's day, not UTC's, either side of midnight", () => {
    // 00:30 on Monday 23 Nov in Vietnam is still Sunday in UTC.
    expect(localDateOf("2026-11-22T17:30:00.000Z", VN)).toBe("2026-11-23");
    // 23:30 on Sunday in Vietnam.
    expect(localDateOf("2026-11-22T16:30:00.000Z", VN)).toBe("2026-11-22");
    // The working day reads the same either way.
    expect(localDateOf("2026-11-23T03:00:00.000Z", VN)).toBe("2026-11-23");
  });

  it("crosses months and years with the team, not with UTC", () => {
    expect(localDateOf("2026-10-31T18:00:00.000Z", VN)).toBe("2026-11-01");
    expect(localDateOf("2025-12-31T20:00:00+00:00", VN)).toBe("2026-01-01");
  });

  it("follows the timezone it is given", () => {
    expect(localDateOf("2026-11-22T14:00:00.000Z", "Australia/Melbourne")).toBe("2026-11-23");
    expect(localDateOf("2026-11-22T14:00:00.000Z", "UTC")).toBe("2026-11-22");
  });

  it("leaves a plain date as it is", () => {
    expect(localDateOf("2026-11-23", VN)).toBe("2026-11-23");
    expect(localDateOf("2026-11-23", "Pacific/Honolulu")).toBe("2026-11-23");
  });
});

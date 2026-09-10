import { describe, expect, it } from "vitest";
import type { AssetRates } from "@/domain";
import { effortHours, formatHours, hasAnyRate, hoursPerUnit, normaliseAssetRates, perUnitHint, unratedTypes } from "@/domain";

/**
 * Output rates, and the hours they turn deliverables into.
 *
 * The point of the whole mechanism is that a count is not a workload: these
 * check the arithmetic, and — more importantly — that an unrated type is
 * reported rather than guessed at, because a total that quietly leaves work out
 * is the one failure that would make the effort figure worse than no figure.
 */
describe("hoursPerUnit", () => {
  it("reads a rate as time for one unit", () => {
    // 8 a day, an eight-hour day: one an hour.
    expect(hoursPerUnit({ qty: 8, every: 1, per: "day" })).toBe(1);
    // 1 every 2 weeks: two five-day weeks of eight hours.
    expect(hoursPerUnit({ qty: 1, every: 2, per: "week" })).toBe(80);
    // 4 an hour: a quarter of an hour each.
    expect(hoursPerUnit({ qty: 4, every: 1, per: "hour" })).toBe(0.25);
    // 3 every 2 days: two days shared between three.
    expect(hoursPerUnit({ qty: 3, every: 2, per: "day" })).toBeCloseTo(16 / 3, 10);
  });

  it("is zero for anything that is not a rate, so nothing is invented", () => {
    expect(hoursPerUnit(undefined)).toBe(0);
    expect(hoursPerUnit(null)).toBe(0);
    expect(hoursPerUnit({ qty: 0, every: 1, per: "day" })).toBe(0);
    expect(hoursPerUnit({ qty: -3, every: 1, per: "day" })).toBe(0);
    expect(hoursPerUnit({ qty: 1, every: 0, per: "day" })).toBe(0);
    expect(hoursPerUnit({ qty: Number.NaN, every: 1, per: "day" })).toBe(0);
    expect(hoursPerUnit({ qty: Number.POSITIVE_INFINITY, every: 1, per: "day" })).toBe(0);
  });
});

describe("normaliseAssetRates", () => {
  it("keeps what makes sense and drops what does not", () => {
    const rates = normaliseAssetRates({
      Print: { qty: 4, every: 1, per: "day" },
      Social: { qty: 10, every: 1, per: "hour" },
      Zero: { qty: 0, every: 1, per: "day" },
      Negative: { qty: -2, every: 1, per: "day" },
      NoSpan: { qty: 5, every: 0, per: "day" },
      Rubbish: "not a rate",
      Empty: null,
      "  ": { qty: 3, every: 1, per: "day" },
    });
    // Only the two real ones — a dropped rate reads as "not specified", which
    // is true and visible, where a repaired one would be a number nobody chose.
    expect(Object.keys(rates).sort()).toEqual(["Print", "Social"]);
  });

  it("reads a rate written before spans existed", () => {
    expect(normaliseAssetRates({ Print: { qty: 6, per: "day" } })).toEqual({ Print: { qty: 6, every: 1, per: "day" } });
  });

  it("falls back to days for an unknown time base", () => {
    expect(normaliseAssetRates({ Print: { qty: 2, every: 1, per: "fortnight" } }).Print).toEqual({ qty: 2, every: 1, per: "day" });
  });

  it("survives whatever is actually in the column", () => {
    for (const raw of [null, undefined, 42, "text", [], [{ qty: 1 }]]) {
      expect(normaliseAssetRates(raw)).toEqual({});
    }
  });

  it("trims the name it keys by", () => {
    expect(Object.keys(normaliseAssetRates({ "  Print  ": { qty: 1, every: 1, per: "day" } }))).toEqual(["Print"]);
  });
});

describe("effortHours", () => {
  const rates: AssetRates = {
    Print: { qty: 4, every: 1, per: "day" }, // 2 h each
    Social: { qty: 8, every: 1, per: "day" }, // 1 h each
  };

  it("weighs each deliverable by its type", () => {
    // 3 print at 2 h, 10 social at 1 h.
    expect(effortHours([{ type: "Print", units: 3 }, { type: "Social", units: 10 }], rates)).toBe(16);
  });

  it("counts an unrated type as nothing rather than guessing", () => {
    // Video has no rate: the total is the print alone, not print plus a default.
    expect(effortHours([{ type: "Print", units: 1 }, { type: "Video", units: 100 }], rates)).toBe(2);
  });

  it("matches a type however it was capitalised", () => {
    // The ASSET_TYPES list and the tag written on a deliverable are both free
    // text, and people capitalise them differently.
    expect(effortHours([{ type: "print", units: 1 }, { type: " SOCIAL ", units: 2 }], rates)).toBe(4);
  });

  it("ignores lines with no units", () => {
    expect(effortHours([{ type: "Print", units: 0 }, { type: "Print", units: -5 }], rates)).toBe(0);
  });

  it("is zero for a workspace that has recorded nothing", () => {
    expect(effortHours([{ type: "Print", units: 500 }], {})).toBe(0);
    expect(hasAnyRate({})).toBe(false);
    expect(hasAnyRate(null)).toBe(false);
    expect(hasAnyRate(rates)).toBe(true);
  });
});

describe("unratedTypes", () => {
  const rates: AssetRates = { Print: { qty: 4, every: 1, per: "day" } };

  it("names exactly what the total leaves out", () => {
    const missing = unratedTypes([{ type: "Print", units: 2 }, { type: "Video", units: 1 }, { type: "Motion", units: 3 }], rates);
    expect(missing).toEqual(["Motion", "Video"]);
  });

  it("only names types that actually carry volume", () => {
    // Nothing was produced of this type, so there is nothing being left out.
    expect(unratedTypes([{ type: "Video", units: 0 }], rates)).toEqual([]);
  });

  it("names a type once, however many lines carry it", () => {
    expect(unratedTypes([{ type: "Video", units: 1 }, { type: "video", units: 2 }, { type: "Video", units: 3 }], rates)).toEqual(["Video"]);
  });

  it("says nothing when every type in play has a rate", () => {
    expect(unratedTypes([{ type: "Print", units: 9 }], rates)).toEqual([]);
  });
});

describe("formatHours", () => {
  it("keeps a decimal where it changes the plan, and drops it where it is noise", () => {
    expect(formatHours(6.5)).toBe("6.5 h");
    expect(formatHours(0.25)).toBe("0.3 h");
    expect(formatHours(1240.4)).toBe("1,240 h");
    expect(formatHours(100)).toBe("100 h");
  });

  it("has one way of saying nothing", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(-5)).toBe("0 h");
    expect(formatHours(Number.NaN)).toBe("0 h");
  });
});

describe("perUnitHint", () => {
  it("says one unit's time in the unit a person would use", () => {
    expect(perUnitHint({ qty: 4, every: 1, per: "hour" })).toBe("≈ 15 min each");
    expect(perUnitHint({ qty: 4, every: 1, per: "day" })).toBe("≈ 2 h each");
    expect(perUnitHint({ qty: 1, every: 1, per: "day" })).toBe("≈ 1 day each");
    expect(perUnitHint({ qty: 1, every: 2, per: "week" })).toBe("≈ 10 days each");
  });

  it("has nothing to say about a type with no rate", () => {
    expect(perUnitHint(undefined)).toBeNull();
    expect(perUnitHint({ qty: 0, every: 1, per: "day" })).toBeNull();
  });
});

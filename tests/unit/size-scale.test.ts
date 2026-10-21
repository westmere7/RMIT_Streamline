import { describe, expect, it } from "vitest";
import { DEFAULT_SIZE_SCALE, describeEffort, formatSizeSpan, formatSizeSpanShort, normaliseSizeScale, sizeFit, sizeScaleProblem, spanHours } from "@/domain";
import { sizeEvidence } from "@/features/boards/size-fit";

describe("the size scale", () => {
  it("defaults to the GCMC sheet and reads its spans in working hours", () => {
    expect(formatSizeSpan(DEFAULT_SIZE_SCALE.XS.span)).toBe("1 week");
    expect(formatSizeSpan(DEFAULT_SIZE_SCALE.S.span)).toBe("2–4 weeks");
    expect(formatSizeSpan(DEFAULT_SIZE_SCALE.XL.span)).toBe("3–6 months");
    expect(formatSizeSpanShort(DEFAULT_SIZE_SCALE.S.span)).toBe("2–4 wk");
    expect(spanHours(DEFAULT_SIZE_SCALE.XS.span)).toEqual({ from: null, to: 40 });
    expect(spanHours(DEFAULT_SIZE_SCALE.XL.span)).toEqual({ from: 504, to: 1008 });
    expect(sizeScaleProblem(DEFAULT_SIZE_SCALE)).toBeNull();
  });

  it("fills in what is missing or broken from the defaults, and keeps what is good", () => {
    expect(normaliseSizeScale(null)).toEqual(DEFAULT_SIZE_SCALE);
    const scale = normaliseSizeScale({
      XS: { span: { from: null, to: 16, unit: "hour" }, scope: "  Quick fixes ", examples: [" Resize ", "", 4] },
      S: { span: { to: -1, unit: "week" } },
      M: { span: { from: 9, to: 6, unit: "week" }, scope: "M", examples: [] },
      L: "junk",
    });
    expect(scale.XS).toEqual({ span: { from: null, to: 16, unit: "hour" }, scope: "Quick fixes", examples: ["Resize"] });
    expect(scale.S).toEqual(DEFAULT_SIZE_SCALE.S);
    // A start after the end is dropped rather than guessed at.
    expect(scale.M.span).toEqual({ from: null, to: 6, unit: "week" });
    expect(scale.L).toEqual(DEFAULT_SIZE_SCALE.L);
  });

  it("says when a size does not end later than the one before", () => {
    const scale = normaliseSizeScale({ ...DEFAULT_SIZE_SCALE, M: { ...DEFAULT_SIZE_SCALE.M, span: { from: null, to: 3, unit: "week" } } });
    expect(sizeScaleProblem(scale)).toBe("M has to end later than S.");
  });

  it("fits hours to the smallest size that reaches them, with a place on the row", () => {
    expect(sizeFit(0, DEFAULT_SIZE_SCALE)).toBeNull();
    expect(sizeFit(20, DEFAULT_SIZE_SCALE)).toEqual({ size: "XS", over: false, position: 0.1 });
    expect(sizeFit(40, DEFAULT_SIZE_SCALE)?.size).toBe("XS");
    expect(sizeFit(41, DEFAULT_SIZE_SCALE)?.size).toBe("S");
    expect(sizeFit(240, DEFAULT_SIZE_SCALE)).toEqual({ size: "M", over: false, position: 0.6 });
    expect(sizeFit(2000, DEFAULT_SIZE_SCALE)).toEqual({ size: "XL", over: true, position: 1 });
  });

  it("puts hours in words", () => {
    expect(describeEffort(6)).toBe("6 h");
    expect(describeEffort(20)).toBe("20 h · about 2.5 days");
    expect(describeEffort(160)).toBe("160 h · about 4 weeks");
  });
});

describe("a task's size evidence", () => {
  const rates = { Poster: { qty: 2, every: 1, per: "day" as const }, Film: { qty: 1, every: 2, per: "week" as const } };

  it("weighs the lines by their rates and names the types it could not weigh", () => {
    const evidence = sizeEvidence(
      [
        { assetType: "Poster", quantity: 4 },
        { assetType: "Film", quantity: 1 },
        { assetType: "Banner", quantity: 3 },
      ],
      rates,
      DEFAULT_SIZE_SCALE,
    );
    // 4 posters at 4 h each, and a film at two weeks: 16 + 80 hours.
    expect(evidence.hours).toBe(96);
    expect(evidence.fit?.size).toBe("S");
    expect(evidence.unrated).toEqual(["Banner"]);
    expect(evidence.hasAssets).toBe(true);
  });

  it("has no fit without rated lines", () => {
    expect(sizeEvidence([], rates, DEFAULT_SIZE_SCALE)).toEqual({ hasAssets: false, hours: 0, fit: null, unrated: [] });
    expect(sizeEvidence([{ assetType: "Banner", quantity: 2 }], rates, DEFAULT_SIZE_SCALE).fit).toBeNull();
  });
});

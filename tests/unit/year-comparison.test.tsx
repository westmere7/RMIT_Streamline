import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MonthlyComparisonRow } from "@/features/dashboard/metrics";
import { YearComparisonChart } from "@/features/dashboard/components/year-comparison";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The shape of the real year to date: nine answers, one spike, three months that have not happened. */
const CURRENT = [1, 1, 1, 35, 19, 22, 53, 251, 104, null, null, null];
const PREVIOUS = [28, 49, 41, 47, 31, 29, 57, 39, 11, null, null, null];
/** The rest of last year, which the current period has not reached. */
const OUTLOOK = [null, null, null, null, null, null, null, null, null, 44, 52, 18];

const rows: MonthlyComparisonRow[] = MONTHS.map((label, index) => {
  const current = CURRENT[index] ?? null;
  const comparison = PREVIOUS[index] ?? null;
  return {
    month: index + 1,
    label,
    current,
    comparison,
    delta: current === null || comparison === null ? null : current - comparison,
    percent: current === null || comparison === null || comparison === 0 ? null : ((current - comparison) / comparison) * 100,
    outlook: OUTLOOK[index] ?? null,
  };
});

/**
 * The chart measures the box it is given and spends the room on detail, so a
 * test has to say how big that box is — happy-dom reports every element as
 * 0×0, which would put every chart in its most cramped form.
 */
function sized(width: number, height: number) {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return { width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const draw = (width = 1100, height = 620) => {
  restore = sized(width, height);
  const { container } = render(<YearComparisonChart rows={rows} currentLabel="2026 to 10 Sep" comparisonLabel="2025 to 10 Sep" unitWord="tasks" />);
  return container;
};

const svgText = (container: Element) => [...container.querySelectorAll("text")].map((t) => t.textContent ?? "");

describe("the year comparison chart, given room", () => {
  it("draws no line overlays over the bars", () => {
    // A trend through the tops and a running total per year were tried and
    // dropped: four series over twelve paired columns is more than one chart
    // can say at a glance, which is the only way this one is read.
    const container = draw();
    expect(container.querySelectorAll("path")).toHaveLength(0);
    expect(screen.queryByText("Running total")).not.toBeInTheDocument();
    expect(svgText(container).some((t) => t.startsWith("avg"))).toBe(false);
  });

  it("names the peak, since it is the bar people point at", () => {
    expect(svgText(draw())).toContain("Peak · 251");
  });

  it("marks how far the year has got, and dims the months it has not reached", () => {
    const container = draw();
    expect(svgText(container)).toContain("NOW");
    const label = (name: string) => [...container.querySelectorAll("text")].find((t) => t.textContent === name)!;
    // September has an answer; October has not happened.
    expect(label("Sep").getAttribute("class")).not.toContain("muted-foreground/40");
    expect(label("Oct").getAttribute("class")).toContain("muted-foreground/40");
  });

  it("says nothing under the month names", () => {
    // The per-month change used to sit there and was noise; the running totals
    // and the hover card carry that now.
    expect(svgText(draw()).filter((t) => /^[+-]\d+%$/.test(t))).toHaveLength(0);
  });

  it("has no banding behind the columns", () => {
    const container = draw();
    const banded = [...container.querySelectorAll("rect")].filter((r) => (r.getAttribute("class") ?? "").includes("fill-foreground/[0.015]"));
    expect(banded).toHaveLength(0);
  });
});

describe("the same chart in a short panel", () => {
  it("falls back to the plain paired bars", () => {
    // A cramped chart with six things in it is worse than a cramped chart with
    // one, so none of the extra detail is drawn.
    const container = draw(1100, 180);
    const text = svgText(container);
    expect(text).not.toContain("NOW");
    expect(text.some((t) => t.startsWith("Peak"))).toBe(false);
    expect(container.querySelectorAll("path")).toHaveLength(0);
    // The bars and their months are still there — that is the chart.
    expect(text).toContain("Aug");
    expect([...container.querySelectorAll("rect")].length).toBeGreaterThan(12);
  });
});

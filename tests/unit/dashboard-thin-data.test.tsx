import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { niceScale } from "@/features/dashboard/charts/chart-utils";
import { ChangeChip, HeadlineFigure } from "@/features/dashboard/components/figures";

describe("a dashboard with little or nothing in it", () => {
  it("steps a count axis in whole numbers, so a nearly empty chart does not read 0, 1, 1, 1", () => {
    for (const [peak, steps] of [[1, 8], [2, 6], [3, 4], [7, 8]] as const) {
      const { ticks } = niceScale(peak, steps);
      expect(ticks.every(Number.isInteger), `peak ${peak}: ${ticks.join(", ")}`).toBe(true);
      expect(new Set(ticks).size).toBe(ticks.length);
    }
    // Hours are not whole, and can still ask for fine steps.
    expect(niceScale(1, 4, false).ticks).toContain(0.25);
  });

  it("gives no percentage against a base too small to mean anything, and says why", () => {
    render(<ChangeChip delta={4} percent={400} base={1} />);
    expect(screen.getByText(/too few for a %/)).toBeInTheDocument();
    expect(screen.queryByText(/400/)).not.toBeInTheDocument();
  });

  it("keeps the percentage once the base is big enough", () => {
    render(<ChangeChip delta={5} percent={50} base={10} />);
    expect(screen.getByText(/\+50%/)).toBeInTheDocument();
  });

  it("says a headline card has nothing yet instead of drawing a flat line", () => {
    render(
      <HeadlineFigure
        label="Tasks"
        unitWord="tasks"
        comparison={{ current: 0, comparison: null, delta: null, percent: null }}
        periodLabel="2026 to 25 Sep"
        comparisonLabel="2025 to 25 Sep"
        basisLine="Requested"
        trend={[0, 0, 0, null]}
      />,
    );
    expect(screen.getByText("No tasks in 2026 to 25 Sep yet.")).toBeInTheDocument();
  });
});

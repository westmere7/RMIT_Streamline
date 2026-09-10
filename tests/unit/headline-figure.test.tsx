import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatHours } from "@/domain";
import { HeadlineFigure } from "@/features/dashboard/components/figures";
import type { Comparison } from "@/features/dashboard/metrics";

const comparison = (current: number, previous: number | null): Comparison => ({
  current,
  comparison: previous,
  delta: previous === null ? null : current - previous,
  percent: previous === null || previous === 0 ? null : ((current - previous) / previous) * 100,
});

/**
 * The headline cards, and the effort one in particular.
 *
 * Effort is the third figure on the Overview and the only one whose unit is not
 * a count. Every figure on the card has to agree about that — the headline, the
 * ring, the comparison and the change — because "6,186" and "6,186 h" are not
 * the same claim, and a card that mixes them is worse than one that omits the
 * measure.
 */
describe("HeadlineFigure", () => {
  const base = {
    label: "Effort",
    unitWord: "hours",
    periodLabel: "2026",
    comparisonLabel: "2025",
    basisLine: "Requested in 2026 to 10 Sep",
  };

  it("reads every figure in hours when effort passes its own formatter", () => {
    render(
      <HeadlineFigure
        {...base}
        comparison={comparison(1240, 800)}
        valueFormat={formatHours}
        ring={{ value: 620, total: 1240, label: "done" }}
        testId="effort"
      />,
    );

    // The headline.
    expect(screen.getByTestId("effort-value")).toHaveTextContent("1,240 h");
    // The comparison, and the change against it — hours, not bare counts.
    expect(screen.getByText(/vs/)).toHaveTextContent("800 h");
    expect(screen.getByText(/\+440 h/)).toBeInTheDocument();
    expect(screen.getByText(/\+55%/)).toBeInTheDocument();
    // The ring: half of it done, said in hours.
    expect(screen.getByText("620 h")).toBeInTheDocument();
    expect(screen.getByText(/50% of 1,240 h/)).toBeInTheDocument();
  });

  it("still counts plainly for the two figures that are counts", () => {
    render(<HeadlineFigure {...base} label="Tasks" unitWord="tasks" comparison={comparison(485, 332)} ring={{ value: 156, total: 485, label: "done" }} testId="tasks" />);
    expect(screen.getByTestId("tasks-value")).toHaveTextContent("485");
    expect(screen.getByTestId("tasks-value")).not.toHaveTextContent("h");
    expect(screen.getByText(/32% of 485/)).toBeInTheDocument();
  });

  it("names what the effort total leaves out, when something is missing", () => {
    render(
      <HeadlineFigure
        {...base}
        comparison={comparison(1240, 800)}
        valueFormat={formatHours}
        footnote={<>No rate yet for Motion, Video — their deliverables count as nought hours.</>}
        testId="effort"
      />,
    );
    // An incomplete total that says so beats one that looks complete.
    expect(screen.getByText(/No rate yet for Motion, Video/)).toBeInTheDocument();
  });

  it("says Unavailable rather than a change against nothing", () => {
    render(<HeadlineFigure {...base} comparison={comparison(1240, null)} valueFormat={formatHours} testId="effort" />);
    expect(screen.getByTestId("effort-unavailable")).toHaveTextContent(/No 2025 to compare with/);
    expect(screen.queryByText(/vs/)).not.toBeInTheDocument();
  });

  it("leaves no dead space under the footer when the row stretches the card", () => {
    // The card sits in a grid row with a taller chart, so it gets stretched.
    // The trend has to be what absorbs that, or the height piles up as a blank
    // band beneath the footer — which is exactly what it used to do.
    const { container } = render(<HeadlineFigure {...base} comparison={comparison(10, 5)} valueFormat={formatHours} trend={[1, 2, 3, 4]} testId="effort" />);
    const grower = container.querySelector(".flex-1");
    expect(grower).not.toBeNull();
    expect(grower!.querySelector("svg")).not.toBeNull();
  });
});

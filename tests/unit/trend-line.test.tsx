import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendLine } from "@/features/dashboard/components/stat-visuals";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A year to date: nine months of answers and three that have not happened. */
const ytd = [10, 12, 9, 14, 13, 20, 26, 40, 55, null, null, null];

/**
 * The sparkline inside a headline card.
 *
 * Its three failures were all about the coordinate system being stretched to
 * the card: a round marker came out an ellipse, a year-to-date series stopped a
 * third short of the right edge, and there was nothing to read a height
 * against.
 */
describe("TrendLine", () => {
  const marker = () => screen.getByTestId("trend-line-marker");

  it("fills the width even when the year is not over", () => {
    render(<TrendLine values={ytd} label="Tasks by month" />);
    // September is the last answer, so it sits at the right-hand edge rather
    // than at nine twelfths of it.
    expect(marker().style.left).toBe("100%");
  });

  it("marks the last month that has an answer, not the last month", () => {
    render(<TrendLine values={[5, 40, null, null]} label="Tasks by month" />);
    expect(marker().style.left).toBe("100%");
    // The peak is that last point, so it sits at the top of the band.
    expect(parseFloat(marker().style.top)).toBeLessThan(15);
  });

  it("keeps the marker round rather than letting the stretch flatten it", () => {
    render(<TrendLine values={ytd} label="Tasks by month" />);
    // An HTML element with equal width and height, positioned by percentage —
    // not an SVG <circle>, which the viewBox stretch turns into an ellipse.
    expect(marker().tagName).toBe("SPAN");
    expect(marker().className).toContain("size-2");
    expect(marker().className).toContain("rounded-full");
  });

  it("draws something to read the height against", () => {
    const { container } = render(<TrendLine values={ytd} label="Tasks by month" />);
    // Three quiet gridlines and a baseline.
    expect(container.querySelectorAll("line")).toHaveLength(4);
  });

  it("says what the height is worth, on the right and at the peak's own height", () => {
    render(<TrendLine values={[10, 12, 9, 1400, null]} label="Tasks by month" />);
    const axis = screen.getByTestId("trend-line-axis");
    // Compact, because the exact figure is the headline above this chart.
    expect(axis).toHaveTextContent("1.4k");
    expect(axis).toHaveTextContent("0");
    // The top tick sits at the peak, not at the top of the padded box.
    const top = parseFloat((axis.firstElementChild as HTMLElement).style.top);
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(15);
  });

  it("labels the months that have answers, and only those", () => {
    render(<TrendLine values={ytd} labels={MONTHS} label="Tasks by month" />);
    for (const month of ["Jan", "May", "Sep"]) expect(screen.getByText(month)).toBeInTheDocument();
    // October has not happened; labelling it would imply an answer of nothing.
    for (const month of ["Oct", "Nov", "Dec"]) expect(screen.queryByText(month)).not.toBeInTheDocument();
  });

  it("pulls the end labels inside the card instead of hanging them over the edge", () => {
    render(<TrendLine values={ytd} labels={MONTHS} label="Tasks by month" />);
    expect(screen.getByText("Jan").style.transform).toBe("translateX(0)");
    expect(screen.getByText("Sep").style.transform).toBe("translateX(-100%)");
    expect(screen.getByText("May").style.transform).toBe("translateX(-50%)");
  });

  it("draws no axis at all when it was given no months", () => {
    render(<TrendLine values={ytd} label="Tasks by month" />);
    expect(screen.queryByText("Jan")).not.toBeInTheDocument();
  });

  it("says nothing rather than drawing a line through one point", () => {
    const { container } = render(<TrendLine values={[7, null, null]} label="Tasks by month" />);
    expect(container.firstChild).toBeNull();
  });
});

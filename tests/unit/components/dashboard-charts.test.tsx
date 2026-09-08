import { render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assetMix, type AssetFact, type StackedRow } from "@/features/dashboard/analytics";
import { useSize } from "@/features/dashboard/charts/chart-utils";
import { MixChart } from "@/features/dashboard/charts/mix-chart";
import { StackedColumns } from "@/features/dashboard/charts/stacked-columns";
import { YearChart } from "@/features/dashboard/charts/year-chart";

/**
 * happy-dom lays nothing out, so a chart would measure zero and draw nothing.
 * Every box reports a real size for the duration of a test, which is what a
 * browser would do.
 */
function withLayout(width = 600, height = 240) {
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

describe("useSize", () => {
  /** A chart in miniature: the measured box is replaced by an empty state when it has no data. */
  function Chart({ hasData }: { hasData: boolean }) {
    const [ref, size] = useSize<HTMLDivElement>();
    if (!hasData) return <p>Nothing to show</p>;
    return (
      <div ref={ref}>
        <span data-testid="size">{`${size.width}x${size.height}`}</span>
      </div>
    );
  }

  it("measures the box as soon as it is attached, without waiting for a frame", () => {
    restore = withLayout(640, 200);
    render(<Chart hasData />);
    // A tab that is not being painted gets no ResizeObserver callbacks, so the
    // first measurement cannot depend on one.
    expect(screen.getByTestId("size")).toHaveTextContent("640x200");
  });

  it("measures the new box when one comes back after an empty state", () => {
    restore = withLayout(640, 200);
    const view = render(<Chart hasData />);
    expect(screen.getByTestId("size")).toHaveTextContent("640x200");

    // The scope changes to one with no data: the measured box unmounts.
    view.rerender(<Chart hasData={false} />);
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();

    // Back to a scope with data, in a panel that is now a different size. The
    // box that mounts is a new element and has to be measured on its own:
    // staying with the first one left the chart believing it had no room, and it
    // drew nothing for as long as the page stayed open.
    restore();
    restore = withLayout(900, 320);
    view.rerender(<Chart hasData />);
    expect(screen.getByTestId("size")).toHaveTextContent("900x320");
  });
});

describe("charts drawn from a scope that had none", () => {
  const months = Array.from({ length: 12 }, (_, month) => ({ month, value: month === 4 ? 12 : 4, done: 2 }));
  const dots = [{ id: "i1", name: "Poster set", x: 0.35, value: 6, color: "#e61e2a", team: { id: "t1", name: "Brand", color: "red" as const }, date: "2025-05-06", boardId: "b1", isDone: true, lines: 2 }];
  const teams = [{ id: "t1", name: "Brand", color: "red" as const }];
  const rows: StackedRow[] = [{ name: "Print", total: 9, segments: [{ key: "t1", label: "Brand", value: 9, color: "#e61e2a" }] }];
  const asset = (type: string, units: number): AssetFact => ({ id: `a-${type}`, taskId: "i1", team: teams[0]!, boardId: "b1", type, units, done: true, completedAt: "2025-05-06", dueDate: null, createdAt: "2025-05-01", taskDueDate: null, assignees: [] });

  it("renders the year chart, the distribution and the mix again after an empty scope", () => {
    restore = withLayout(700, 260);
    const view = render(
      <>
        <YearChart months={months} dots={dots} nowMonth={null} unitLabel="Asset units" teams={teams} />
        <StackedColumns rows={rows} mode="count" />
        <MixChart data={assetMix([asset("Print", 9), asset("Digital", 3)])} />
      </>,
    );
    const svgCount = () => view.container.querySelectorAll("svg").length;
    const drawn = svgCount();
    expect(drawn).toBeGreaterThanOrEqual(3);

    // Nothing in scope: each chart says so instead of drawing.
    view.rerender(
      <>
        <YearChart months={months.map((m) => ({ ...m, value: 0, done: 0 }))} dots={[]} nowMonth={null} unitLabel="Asset units" teams={teams} emptyMessage="Nothing dated" />
        <StackedColumns rows={[]} mode="count" emptyMessage="Nothing to distribute" />
        <MixChart data={[]} emptyMessage="Nothing to split" />
      </>,
    );
    expect(svgCount()).toBe(0);
    expect(screen.getByText("Nothing dated")).toBeInTheDocument();

    // Back in scope: every chart draws again.
    view.rerender(
      <>
        <YearChart months={months} dots={dots} nowMonth={null} unitLabel="Asset units" teams={teams} />
        <StackedColumns rows={rows} mode="count" />
        <MixChart data={assetMix([asset("Print", 9), asset("Digital", 3)])} />
      </>,
    );
    expect(svgCount()).toBe(drawn);
  });

  it("keeps the last measured size when a box reports none on its way out", () => {
    restore = withLayout(700, 260);
    const observers: Array<(entries: Array<{ contentRect: { width: number; height: number } }>) => void> = [];
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    try {
      const view = render(<StackedColumns rows={rows} mode="count" />);
      expect(view.container.querySelectorAll("svg")).toHaveLength(1);
      // Removing an observed element notifies a size of 0×0; taking that as the
      // truth would collapse the chart.
      for (const notify of observers) notify([{ contentRect: { width: 0, height: 0 } }]);
      expect(view.container.querySelectorAll("svg")).toHaveLength(1);
    } finally {
      globalThis.ResizeObserver = original;
      vi.restoreAllMocks();
    }
  });
});

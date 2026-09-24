import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KineticNumber, useSprings } from "@/features/dashboard/charts/motion";

function Probe({ value }: { value: number }) {
  const { v } = useSprings({ v: value });
  return <span data-testid="probe">{v}</span>;
}

const read = () => Number(screen.getByTestId("probe").textContent);

describe("dashboard motion", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance", "setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("paints the first value as it is, with no animation", () => {
    render(<Probe value={40} />);
    expect(read()).toBe(40);
  });

  it("eases to a new value over several frames, never past it", () => {
    const { rerender } = render(<Probe value={0} />);
    rerender(<Probe value={100} />);
    // Not a jump: the change starts from where the value was.
    expect(read()).toBe(0);

    const seen: number[] = [];
    for (let frame = 0; frame < 120; frame++) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      seen.push(read());
    }
    // It moved through values in between, only ever upwards, and never beyond the target.
    expect(seen.some((v) => v > 5 && v < 95)).toBe(true);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(Math.max(...seen)).toBeLessThanOrEqual(100);
    expect(seen.at(-1)).toBe(100);
  });

  it("counts a figure to its new value and tells a screen reader the final one", () => {
    const { rerender } = render(<KineticNumber value={10} format={(v) => Math.round(v).toLocaleString()} />);
    rerender(<KineticNumber value={2000} format={(v) => Math.round(v).toLocaleString()} />);
    expect(screen.getByLabelText("2,000")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByLabelText("2,000")).toHaveTextContent("2,000");
  });
});

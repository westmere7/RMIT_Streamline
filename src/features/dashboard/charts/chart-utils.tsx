"use client";

import * as React from "react";

/** RMIT red, the one warm accent every chart shares. */
export const BRAND_RED = "#e61e2a";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 1,796 — the figures on the dashboard are counts, never fractions. */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

/** 1.8k for tight spots such as axis ticks. */
export function compactCount(value: number): string {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(value));
}

/**
 * A "nice" y-axis for a [0, peak] range: rounds the top up to a round tick just
 * above the peak so gridlines stay evenly spaced and the peak sits below the
 * top edge. Returns the domain top and the tick values.
 */
export function niceScale(peak: number, steps = 4): { top: number; ticks: number[] } {
  if (peak <= 0) return { top: 1, ticks: [0, 1] };
  const rough = peak / steps;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  let top = Math.ceil(peak / step) * step;
  if (top <= peak) top += step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 1e-6; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { top, ticks };
}

/**
 * The size of an element, kept current as the panel or window resizes.
 *
 * The ref is a callback rather than a ref object on purpose. A chart whose data
 * runs out is replaced by its empty state, which unmounts the box being
 * measured; when data returns, a *new* box mounts. Observing once on mount would
 * leave the observer watching the old, detached node — and since removing an
 * observed node reports a size of 0×0, the chart would be told it has no room
 * and would render nothing at all, for good. Keyed on the node, the observer
 * follows it, and a 0×0 report is ignored so the last real size stands.
 */
export function useSize<T extends HTMLElement>(): [(node: T | null) => void, { width: number; height: number }] {
  const [node, setNode] = React.useState<T | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const ref = React.useCallback((next: T | null) => {
    setNode(next);
  }, []);
  React.useEffect(() => {
    if (!node) return;
    const apply = (width: number, height: number) => {
      const next = { width: Math.round(width), height: Math.round(height) };
      if (next.width === 0 && next.height === 0) return;
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    // Measured here and not left to the observer's first callback: those are
    // delivered with the next frame, and a tab that is not being painted gets no
    // frames — the chart would wait for a resize that never comes.
    const box = node.getBoundingClientRect();
    apply(box.width, box.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [ref, size];
}

/**
 * A smooth path through the points (monotone cubic, so the curve never
 * overshoots a month's value the way a Catmull-Rom spline can).
 */
export function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0]!.x},${points[0]!.y}`;
  const n = points.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1]!.x - points[i]!.x);
    dy.push(points[i + 1]!.y - points[i]!.y);
    m.push(dx[i]! === 0 ? 0 : dy[i]! / dx[i]!);
  }
  const tangents: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = m[i - 1]!;
    const b = m[i]!;
    tangents.push(a * b <= 0 ? 0 : (2 * a * b) / (a + b) || 0);
  }
  tangents.push(m[n - 2]!);
  let d = `M${points[0]!.x},${points[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const h = dx[i]! / 3;
    d += ` C${p0.x + h},${p0.y + tangents[i]! * h} ${p1.x - h},${p1.y - tangents[i + 1]! * h} ${p1.x},${p1.y}`;
  }
  return d;
}

/** True once mounted, for entry animations that should not run on the server. */
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia?.(REDUCED_MOTION);
      if (!mq) return () => undefined;
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false,
  );
}

/** The floating readout charts show on hover, positioned against the chart's box. */
export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: React.ReactNode }) {
  const flip = x > width * 0.62;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 min-w-[10rem] max-w-[16rem] rounded-lg border border-border/70 bg-popover/95 px-2.5 py-2 text-xs text-popover-foreground shadow-lg backdrop-blur"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 8) }}
    >
      {children}
    </div>
  );
}

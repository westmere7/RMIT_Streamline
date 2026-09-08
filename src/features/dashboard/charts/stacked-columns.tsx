"use client";

import * as React from "react";
import type { StackedRow } from "@/features/dashboard/analytics";
import { cn } from "@/lib/utils";
import { ChartTooltip, formatCount, useSize } from "./chart-utils";
import { ChartEmpty } from "./ranked-bars";

/**
 * One column per row, each split into its segments. In `share` mode every column
 * is stretched to 100% so the split is what reads; in `count` mode columns are
 * sized to their totals against a shared axis.
 */
export function StackedColumns({
  rows,
  mode = "share",
  legend,
  onSelect,
  emptyMessage = "Nothing to distribute yet.",
  className,
}: {
  rows: StackedRow[];
  mode?: "share" | "count";
  /** Legend entries in stack order; derived from the rows when omitted. */
  legend?: Array<{ key: string; label: string; color: string }>;
  onSelect?: (row: StackedRow, segmentKey: string) => void;
  emptyMessage?: string;
  className?: string;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<{ row: StackedRow; key: string; x: number; y: number } | null>(null);
  const shown = rows.filter((r) => r.total > 0);
  if (shown.length === 0) return <ChartEmpty message={emptyMessage} />;

  const entries =
    legend ??
    (() => {
      const seen = new Map<string, { key: string; label: string; color: string }>();
      for (const r of shown) for (const s of r.segments) if (!seen.has(s.key)) seen.set(s.key, { key: s.key, label: s.label, color: s.color });
      return [...seen.values()];
    })();

  const pad = { top: 8, right: 8, bottom: 34, left: mode === "count" ? 30 : 34 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = Math.max(0, height - pad.top - pad.bottom);
  const max = mode === "count" ? Math.max(1, ...shown.map((r) => r.total)) : 1;
  const slot = shown.length ? plotW / shown.length : 0;
  const barW = Math.max(6, Math.min(56, slot * 0.68));
  const ticks = mode === "share" ? [0, 25, 50, 75, 100] : undefined;

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div ref={ref} className="relative min-h-[180px] flex-1">
        {width > 0 && height > 0 && (
          <svg width={width} height={height} className="block" role="img" aria-label="Distribution">
            {ticks &&
              ticks.map((t) => {
                const y = pad.top + plotH - (t / 100) * plotH;
                return (
                  <g key={t}>
                    <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "2 4"} />
                    <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                      {t}%
                    </text>
                  </g>
                );
              })}
            {!ticks && <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} stroke="var(--border)" />}
            {shown.map((row, i) => {
              const x = pad.left + slot * i + (slot - barW) / 2;
              let y = pad.top + plotH;
              const scale = mode === "share" ? plotH / row.total : plotH / max;
              return (
                <g key={row.name}>
                  {row.segments.map((s) => {
                    const h = s.value * scale;
                    y -= h;
                    const dim = hover && !(hover.row === row && hover.key === s.key);
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(0, h - 1)}
                        rx={2}
                        fill={s.color}
                        opacity={dim ? 0.4 : 1}
                        className={cn("transition-opacity duration-150", onSelect && "cursor-pointer")}
                        onMouseEnter={(e) => {
                          const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ row, key: s.key, x: e.clientX - box.left, y: e.clientY - box.top });
                        }}
                        onMouseMove={(e) => {
                          const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                          setHover({ row, key: s.key, x: e.clientX - box.left, y: e.clientY - box.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onClick={onSelect ? () => onSelect(row, s.key) : undefined}
                      />
                    );
                  })}
                  <text x={x + barW / 2} y={pad.top + plotH + 14} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
                    {truncateLabel(row.name, Math.max(4, Math.floor(slot / 6.2)))}
                  </text>
                  {mode === "count" && (
                    <text x={x + barW / 2} y={pad.top + plotH - row.total * scale - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)">
                      {formatCount(row.total)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hover && (
          <ChartTooltip x={hover.x} y={hover.y} width={width}>
            <p className="font-semibold">{hover.row.name}</p>
            {hover.row.segments.map((s) => (
              <p key={s.key} className={cn("flex items-center gap-1.5 tabular", s.key === hover.key ? "text-foreground" : "text-muted-foreground")}>
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                <span className="flex-1 truncate">{s.label}</span>
                <span>{formatCount(s.value)}</span>
                <span className="w-8 text-right">{Math.round((s.value / hover.row.total) * 100)}%</span>
              </p>
            ))}
          </ChartTooltip>
        )}
      </div>
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {entries.map((e) => (
          <li key={e.key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: e.color }} />
            {e.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function truncateLabel(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

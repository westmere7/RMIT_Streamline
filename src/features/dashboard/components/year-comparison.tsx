"use client";

import * as React from "react";
import { formatCount, niceScale, useSize } from "@/features/dashboard/charts/chart-utils";
import type { MonthlyComparisonRow } from "@/features/dashboard/metrics";
import { ChangeChip } from "./figures";
import { cn } from "@/lib/utils";

/**
 * Two years, month by month.
 *
 * Paired columns rather than two lines: the question is "how does March
 * compare with March", and a pair of bars answers it by standing next to each
 * other. Two years only — a third would need a third colour and this chart is
 * read at a glance from across a desk.
 *
 * A month the current period has not reached draws nothing at all, which is
 * different from a month that drew a zero-height bar. Bars start at zero
 * because they encode a quantity.
 */
export function YearComparisonChart({
  rows,
  currentLabel,
  comparisonLabel,
  unitWord,
  onSelectMonth,
}: {
  rows: MonthlyComparisonRow[];
  currentLabel: string;
  comparisonLabel: string;
  unitWord: string;
  onSelectMonth?: (month: number) => void;
}) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const peak = Math.max(1, ...rows.map((r) => Math.max(r.current ?? 0, r.comparison ?? 0)));
  const { top, ticks } = niceScale(peak);
  const height = 168;
  const width = Math.max(size.width, 320);
  const padLeft = 34;
  const padBottom = 20;
  const plot = height - padBottom;
  const slot = (width - padLeft) / rows.length;
  const barWidth = Math.max(4, Math.min(14, slot / 3));
  const y = (value: number) => plot - (value / top) * (plot - 6);

  return (
    // The two colours are declared on the wrapper, not on the <svg>: the legend
    // sits outside the drawing and its swatches have to reach them too.
    <div ref={ref} className="w-full [--chart-comparison:theme(colors.slate.400)] [--chart-current:#e61e2a] dark:[--chart-comparison:theme(colors.slate.500)]">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
        <Key style={{ background: "var(--chart-current)" }} label={currentLabel} />
        <Key style={{ background: "var(--chart-comparison)" }} label={comparisonLabel} />
        <span className="text-muted-foreground">{unitWord}</span>
      </div>
      <svg
        role="img"
        aria-label={`${unitWord} by month, ${currentLabel} against ${comparisonLabel}`}
        viewBox={`0 0 ${width} ${height}`}
        className="h-[168px] w-full"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width} y1={y(tick)} y2={y(tick)} className="stroke-border/50" strokeWidth={1} />
            <text x={padLeft - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular">
              {formatCount(tick)}
            </text>
          </g>
        ))}
        {rows.map((row, index) => {
          const x = padLeft + index * slot;
          const centre = x + slot / 2;
          return (
            <g key={row.month} onMouseEnter={() => setHover(row.month)} onClick={onSelectMonth ? () => onSelectMonth(row.month) : undefined} className={onSelectMonth ? "cursor-pointer" : undefined}>
              <rect x={x} y={0} width={slot} height={plot} className={cn("fill-transparent", hover === row.month && "fill-foreground/[0.04]")} />
              {row.comparison !== null && (
                <rect x={centre - barWidth - 1} y={y(row.comparison)} width={barWidth} height={Math.max(0, plot - y(row.comparison))} rx={2} fill="var(--chart-comparison)" />
              )}
              {row.current !== null && <rect x={centre + 1} y={y(row.current)} width={barWidth} height={Math.max(0, plot - y(row.current))} rx={2} fill="var(--chart-current)" />}
              <text x={centre} y={height - 6} textAnchor="middle" className={cn("fill-muted-foreground text-[9px]", hover === row.month && "fill-foreground")}>
                {row.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 min-h-4 text-2xs text-muted-foreground" aria-live="polite">
        {hover !== null &&
          (() => {
            const row = rows.find((r) => r.month === hover)!;
            if (row.current === null) return `${row.label} — not reached yet`;
            return `${row.label}: ${formatCount(row.current)} in ${currentLabel}${row.comparison === null ? " · no comparison available" : ` · ${formatCount(row.comparison)} in ${comparisonLabel}`}`;
          })()}
      </p>
    </div>
  );
}

function Key({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span aria-hidden className="size-2.5 rounded-sm" style={style} />
      {label}
    </span>
  );
}

/**
 * The same two years as a table.
 *
 * Every chart on this page has one. A bar is quick and a number is exact, and a
 * manager reporting upwards needs the exact one; it is also the version that
 * works on a phone, with a screen reader, and in a copy-paste into an email.
 */
export function ComparisonTable({
  rows,
  currentLabel,
  comparisonLabel,
  firstColumn,
  onSelect,
  caption,
}: {
  rows: Array<{ key: string; name: string; current: number | null; comparison: number | null; delta: number | null; percent: number | null }>;
  currentLabel: string;
  comparisonLabel: string;
  firstColumn: string;
  onSelect?: (key: string) => void;
  caption?: string;
}) {
  return (
    <div className="overflow-x-auto" data-testid="dashboard-comparison-table">
      <table className="w-full min-w-[26rem] text-left text-xs">
        {caption && <caption className="pb-2 text-left text-2xs text-muted-foreground">{caption}</caption>}
        <thead>
          <tr className="border-b border-border/60 text-2xs text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              {firstColumn}
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium tabular">
              {currentLabel}
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium tabular">
              {comparisonLabel}
            </th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">
              Change
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              %
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row) => (
            <tr key={row.key} className={cn("group", onSelect && "cursor-pointer hover:bg-surface/70")} onClick={onSelect ? () => onSelect(row.key) : undefined}>
              <th scope="row" className="max-w-[14rem] truncate py-1.5 pr-3 font-normal" title={row.name}>
                {row.name}
              </th>
              <td className="py-1.5 pr-3 text-right tabular">{row.current === null ? "—" : formatCount(row.current)}</td>
              <td className="py-1.5 pr-3 text-right tabular text-muted-foreground">{row.comparison === null ? "Unavailable" : formatCount(row.comparison)}</td>
              <td className="py-1.5 pr-3 text-right tabular">{row.delta === null ? "—" : `${row.delta > 0 ? "+" : ""}${formatCount(row.delta)}`}</td>
              <td className="py-1.5 text-right tabular text-muted-foreground">
                {row.delta === null ? "—" : row.percent === null ? "n/a" : `${row.percent > 0 ? "+" : ""}${row.percent.toFixed(0)}%`}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground">
                Nothing in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export { ChangeChip };

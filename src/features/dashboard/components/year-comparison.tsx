"use client";

import * as React from "react";
import { formatCount, niceScale, useSize } from "@/features/dashboard/charts/chart-utils";
import type { MonthlyComparisonRow } from "@/features/dashboard/metrics";
import { ChangeChip } from "./figures";
import { cn } from "@/lib/utils";

/**
 * Two years, month by month.
 *
 * Paired columns rather than two lines: the question is "how does March compare
 * with March", and a pair of bars answers it by standing next to each other.
 * Two years only — a third would need a third colour and this chart is read at a
 * glance from across a desk.
 *
 * A month the current period has not reached draws nothing at all, which is
 * different from a month that drew a zero-height bar. Bars start at zero
 * because they encode a quantity.
 *
 * It draws itself into whatever box it is given rather than a fixed 168px, and
 * it spends the extra room on detail rather than on taller bars alone: more
 * gridlines to read a height against, the figure printed over each bar, and
 * each month's change against the year before under its name. All of it appears
 * only when there is room for it — a short box gets the plain chart it always
 * was, because a cramped chart with labels on top of each other is worse than a
 * cramped chart.
 *
 * The viewBox matches the measured pixel size, so nothing is stretched and the
 * text is the size it says it is.
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

  const width = Math.max(size.width, 320);
  const height = Math.max(size.height, 168);
  // What the room affords. Each of these is a thing the old fixed-height chart
  // had no space to say.
  const roomy = height >= 260;
  const generous = height >= 340;
  const { top, ticks } = niceScale(peak, generous ? 8 : roomy ? 6 : 4);

  // Wide enough for the largest tick it will print. Fixed at 38 the axis fitted
  // "300" comfortably and "12,000" exactly, so asset units in the tens of
  // thousands would have clipped against the left edge.
  const padLeft = Math.max(38, 14 + formatCount(top).length * 6);
  const padTop = generous ? 18 : 10;
  const padBottom = generous ? 34 : 20;
  const plot = height - padBottom;
  const slot = (width - padLeft) / rows.length;
  const barWidth = Math.max(4, Math.min(generous ? 22 : 14, slot / 2.6));
  const y = (value: number) => plot - (value / top) * (plot - padTop);

  return (
    // The two colours are declared on the wrapper, not on the <svg>: the legend
    // sits outside the drawing and its swatches have to reach them too.
    <div className="flex h-full min-h-0 w-full flex-col [--chart-comparison:theme(colors.slate.400)] [--chart-current:#e61e2a] dark:[--chart-comparison:theme(colors.slate.500)]">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
        <Key style={{ background: "var(--chart-current)" }} label={currentLabel} />
        <Key style={{ background: "var(--chart-comparison)" }} label={comparisonLabel} />
        <span className="text-muted-foreground">{unitWord}</span>
      </div>

      {/* The box the chart measures itself against, and the only thing that grows. */}
      <div ref={ref} className="min-h-[168px] w-full flex-1">
        <svg
          role="img"
          aria-label={`${unitWord} by month, ${currentLabel} against ${comparisonLabel}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="size-full"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padLeft} x2={width} y1={y(tick)} y2={y(tick)} className={cn(tick === 0 ? "stroke-border/80" : "stroke-border/40")} strokeWidth={1} />
              <text x={padLeft - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular">
                {formatCount(tick)}
              </text>
            </g>
          ))}

          {rows.map((row, index) => {
            const x = padLeft + index * slot;
            const centre = x + slot / 2;
            const on = hover === row.month;
            // Only where the change is meaningful: a month with no comparison,
            // or one that has not happened, has no change to report.
            const percent = row.current !== null && row.comparison !== null && row.comparison !== 0 ? ((row.current - row.comparison) / row.comparison) * 100 : null;
            return (
              <g
                key={row.month}
                onMouseEnter={() => setHover(row.month)}
                onClick={onSelectMonth ? () => onSelectMonth(row.month) : undefined}
                className={onSelectMonth ? "cursor-pointer" : undefined}
              >
                <rect x={x} y={0} width={slot} height={plot} className={cn("fill-transparent", on && "fill-foreground/[0.04]")} />

                {row.comparison !== null && (
                  <rect x={centre - barWidth - 1} y={y(row.comparison)} width={barWidth} height={Math.max(0, plot - y(row.comparison))} rx={2} fill="var(--chart-comparison)" />
                )}
                {row.current !== null && <rect x={centre + 1} y={y(row.current)} width={barWidth} height={Math.max(0, plot - y(row.current))} rx={2} fill="var(--chart-current)" />}

                {/* The figure itself, over the bar it belongs to. Hidden when
                    the bar is a sliver, where the number would sit on its
                    neighbour rather than on it. */}
                {roomy && row.current !== null && row.current > 0 && (
                  <text x={centre + 1 + barWidth / 2} y={y(row.current) - 4} textAnchor="middle" className="fill-foreground text-[9px] font-medium tabular">
                    {formatCount(row.current)}
                  </text>
                )}
                {generous && row.comparison !== null && row.comparison > 0 && (
                  <text x={centre - barWidth / 2 - 1} y={y(row.comparison) - 4} textAnchor="middle" className="fill-muted-foreground text-[9px] tabular">
                    {formatCount(row.comparison)}
                  </text>
                )}

                <text x={centre} y={plot + 13} textAnchor="middle" className={cn("text-[9px]", on ? "fill-foreground" : "fill-muted-foreground")}>
                  {row.label}
                </text>

                {/* Each month against the same month last year, under its name.
                    Not coloured green and red: more work arriving may be a good
                    year or an unmanageable one, and the page does not know. */}
                {generous && percent !== null && (
                  <text x={centre} y={plot + 26} textAnchor="middle" className={cn("text-[9px] tabular", on ? "fill-foreground/80" : "fill-muted-foreground/70")}>
                    {percent > 0 ? "+" : ""}
                    {percent.toFixed(0)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-1 min-h-4 shrink-0 text-2xs text-muted-foreground" aria-live="polite">
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

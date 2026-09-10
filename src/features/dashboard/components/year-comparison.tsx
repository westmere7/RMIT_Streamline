"use client";

import * as React from "react";
import { ChartTooltip, compactCount, formatCount, niceScale, useMounted, usePrefersReducedMotion, useSize } from "@/features/dashboard/charts/chart-utils";
import type { MonthlyComparisonRow } from "@/features/dashboard/metrics";
import { ChangeChip } from "./figures";
import { cn } from "@/lib/utils";

/**
 * Two years, month by month.
 *
 * Paired columns rather than two lines: the question is "how does March compare
 * with March", and a pair of bars answers it by standing next to each other.
 * Two years only — a third would need a third colour and this chart is read at a
 * glance from across a desk. A month the current period has not reached draws
 * nothing at all, which is different from a month that drew a zero-height bar.
 *
 * It was the barest chart on the page — bars, four gridlines and a line of text
 * under it — while its siblings in charts/ had a marker for today, a peak label
 * and a proper hover card. This brings it up to them, and every addition answers
 * something the paired bars cannot:
 *
 *  · A **marker at the last month with an answer**, and dimmed labels past it.
 *    The right-hand third of a year-to-date chart is empty because those months
 *    have not happened, and the chart should say so rather than look unfinished.
 *  · The **peak** named, since the tallest bar is the one people point at.
 *
 * It carried three line overlays for a while — a trend through the tops and a
 * running total per year on a second axis — and they were dropped: four series
 * over twelve paired columns is more than one chart can say at a glance, which
 * is the only way this one is read. The bars are the answer; the marker, the
 * peak and the hover card are what help you read them.
 *
 * All of it is gated on the height the panel actually gives: a short box gets
 * the plain paired bars it always was, because a cramped chart with everything
 * in it is worse than a cramped chart with one thing.
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
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();

  const peak = Math.max(1, ...rows.map((r) => Math.max(r.current ?? 0, r.comparison ?? 0)));
  const width = Math.max(size.width, 320);
  const height = Math.max(size.height, 168);
  const roomy = height >= 260;
  const generous = height >= 340;
  const { top, ticks } = niceScale(peak, generous ? 8 : roomy ? 6 : 4);

  const lastAnswered = rows.reduce((last, row, index) => (row.current === null ? last : index), -1);
  const peakIndex = rows.reduce((best, row, index) => (row.current !== null && row.current > (rows[best]?.current ?? -1) ? index : best), -1);

  const padLeft = Math.max(38, 14 + compactCount(top).length * 6);
  const padRight = 6;
  const padTop = roomy ? 22 : 10;
  const padBottom = 22;
  const plot = height - padBottom;
  const slot = (width - padLeft - padRight) / rows.length;
  const barWidth = Math.max(4, Math.min(generous ? 22 : 14, slot / 2.6));
  const y = (value: number) => plot - (value / top) * (plot - padTop);
  const centreOf = (index: number) => padLeft + index * slot + slot / 2;

  const hovered = hover === null ? null : rows.findIndex((r) => r.month === hover);

  return (
    // The two colours are declared on the wrapper, not on the <svg>: the legend
    // sits outside the drawing and its swatches have to reach them too.
    <div className="flex h-full min-h-0 w-full flex-col [--chart-comparison:theme(colors.slate.400)] [--chart-current:#e61e2a] dark:[--chart-comparison:theme(colors.slate.500)]">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-2xs">
        <Key style={{ background: "var(--chart-current)" }} label={currentLabel} />
        <Key style={{ background: "var(--chart-comparison)" }} label={comparisonLabel} />
        <span className="text-muted-foreground">{unitWord}</span>
      </div>

      {/* The box the chart measures itself against, and the only thing that
          grows. Relative, because the hover card is an HTML overlay on it. */}
      <div ref={ref} className="relative min-h-[168px] w-full flex-1">
        <svg
          role="img"
          aria-label={`${unitWord} by month, ${currentLabel} against ${comparisonLabel}`}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="size-full select-none"
          onMouseLeave={() => setHover(null)}
        >
          {/* Past the last answer the year has not happened. Saying so is why
              the right-hand third is empty. */}
          {roomy && lastAnswered >= 0 && lastAnswered < rows.length - 1 && (
            <rect x={padLeft + (lastAnswered + 1) * slot} y={0} width={(rows.length - 1 - lastAnswered) * slot} height={plot} className="fill-foreground/[0.025]" />
          )}

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y(tick)}
                y2={y(tick)}
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : "2 4"}
                className={cn(tick === 0 ? "stroke-border/80" : "stroke-border/60")}
              />
              <text x={padLeft - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular">
                {compactCount(tick)}
              </text>
            </g>
          ))}

          {rows.map((row, index) => {
            const centre = centreOf(index);
            const on = hover === row.month;
            const future = lastAnswered >= 0 && index > lastAnswered;
            return (
              <g
                key={row.month}
                onMouseEnter={() => setHover(row.month)}
                onClick={onSelectMonth ? () => onSelectMonth(row.month) : undefined}
                className={onSelectMonth ? "cursor-pointer" : undefined}
              >
                <rect x={padLeft + index * slot} y={0} width={slot} height={plot} className={cn("fill-transparent", on && "fill-foreground/[0.05]")} />

                {row.comparison !== null && (
                  <rect
                    x={centre - barWidth - 1}
                    y={y(row.comparison)}
                    width={barWidth}
                    height={Math.max(0, plot - y(row.comparison))}
                    rx={2}
                    fill="var(--chart-comparison)"
                    fillOpacity={hover !== null && !on ? 0.5 : 0.85}
                    className="transition-[fill-opacity] duration-150"
                  />
                )}
                {row.current !== null && (
                  <rect
                    x={centre + 1}
                    y={y(row.current)}
                    width={barWidth}
                    height={Math.max(0, plot - y(row.current))}
                    rx={2}
                    fill="var(--chart-current)"
                    fillOpacity={hover !== null && !on ? 0.55 : 1}
                    className={cn("transition-[fill-opacity] duration-150", mounted && !reduced && "dashboard-area-in")}
                    // Left to right, the way the year happened.
                    style={mounted && !reduced ? { animationDelay: `${Math.min(360, index * 30)}ms` } : undefined}
                  />
                )}

                {roomy && row.current !== null && row.current > 0 && index !== peakIndex && (
                  <text x={centre + 1 + barWidth / 2} y={y(row.current) - 4} textAnchor="middle" className="fill-foreground text-[9px] font-medium tabular">
                    {formatCount(row.current)}
                  </text>
                )}
                {generous && row.comparison !== null && row.comparison > 0 && (
                  <text x={centre - barWidth / 2 - 1} y={y(row.comparison) - 4} textAnchor="middle" className="fill-muted-foreground text-[9px] tabular">
                    {formatCount(row.comparison)}
                  </text>
                )}

                <text
                  x={centre}
                  y={plot + 14}
                  textAnchor="middle"
                  className={cn("text-[9px]", on ? "fill-foreground" : future ? "fill-muted-foreground/40" : "fill-muted-foreground")}
                >
                  {row.label}
                </text>
              </g>
            );
          })}

          {/* Over the bars, and after them. None of this catches the mouse —
              the month columns above own the hover. */}
          <g className="pointer-events-none">
            {/* The tallest month, named, because it is the one people point at. */}
            {roomy && peakIndex >= 0 && (rows[peakIndex]?.current ?? 0) > 0 && (
              <text
                x={centreOf(peakIndex) + 1 + barWidth / 2 + (peakIndex >= rows.length - 2 ? -6 : 0)}
                y={y(rows[peakIndex]!.current!) - 5}
                textAnchor={peakIndex >= rows.length - 2 ? "end" : "middle"}
                className="fill-[color:var(--chart-current)] text-[9px] font-bold tabular"
              >
                Peak · {formatCount(rows[peakIndex]!.current!)}
              </text>
            )}

            {/* Where the year has got to. */}
            {roomy && lastAnswered >= 0 && lastAnswered < rows.length - 1 && (
              <g>
                <line
                  x1={padLeft + (lastAnswered + 1) * slot}
                  x2={padLeft + (lastAnswered + 1) * slot}
                  y1={padTop - 8}
                  y2={plot}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  className="stroke-muted-foreground/70"
                />
                <text x={padLeft + (lastAnswered + 1) * slot - 4} y={padTop - 11} textAnchor="end" className="fill-muted-foreground text-[9px] font-semibold">
                  NOW
                </text>
              </g>
            )}
          </g>
        </svg>

        {/* The readout the sibling charts have had all along. */}
        {hovered !== null && hovered >= 0 && rows[hovered] && (
          <ChartTooltip x={centreOf(hovered)} y={rows[hovered]!.current === null ? plot / 2 : y(rows[hovered]!.current!)} width={width}>
            <p className="font-semibold">{rows[hovered]!.label}</p>
            {rows[hovered]!.current === null ? (
              <p className="mt-0.5 text-muted-foreground">Not reached yet</p>
            ) : (
              <>
                <p className="mt-1 flex items-center gap-1.5 tabular">
                  <span aria-hidden className="size-2 rounded-sm" style={{ background: "var(--chart-current)" }} />
                  {formatCount(rows[hovered]!.current!)} <span className="text-muted-foreground">in {currentLabel}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 tabular">
                  <span aria-hidden className="size-2 rounded-sm" style={{ background: "var(--chart-comparison)" }} />
                  {rows[hovered]!.comparison === null ? <span className="text-muted-foreground">no comparison</span> : <>{formatCount(rows[hovered]!.comparison!)} <span className="text-muted-foreground">in {comparisonLabel}</span></>}
                </p>
                {rows[hovered]!.delta !== null && (
                  <p className="mt-1">
                    <ChangeChip delta={rows[hovered]!.delta} percent={rows[hovered]!.percent} className="text-2xs" />
                  </p>
                )}
              </>
            )}
            {onSelectMonth && <p className="mt-1 text-2xs text-muted-foreground">Click to open</p>}
          </ChartTooltip>
        )}
      </div>
    </div>
  );
}

function Key({ style, label, dashed }: { style?: React.CSSProperties; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      {dashed ? (
        // A rule rather than a block: the running totals are lines, and a legend
        // should look like the thing it names.
        <span aria-hidden className="h-0 w-3 border-t-2 border-dashed border-muted-foreground" />
      ) : (
        <span aria-hidden className="size-2.5 rounded-sm" style={style} />
      )}
      {label}
    </span>
  );
}

export { ChangeChip };

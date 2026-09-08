"use client";

import * as React from "react";
import type { MonthPoint, TeamRef, YearDot } from "@/features/dashboard/analytics";
import { cn } from "@/lib/utils";
import { BRAND_RED, ChartTooltip, compactCount, formatCount, MONTH_LABELS, niceScale, smoothPath, useMounted, usePrefersReducedMotion, useSize } from "./chart-utils";
import { ChartEmpty } from "./ranked-bars";

const MONTH_MID = Array.from({ length: 12 }, (_, i) => (i + 0.5) / 12);
const DOT_R = 3.5;
const DOT_R_HOT = 6;

/**
 * Workload across a year: a smooth red area of the monthly totals with one dot
 * per task under it, placed on the task's exact day and lifted by its value, so
 * a single big job stands apart from a run of small ones. Dots are coloured by
 * team. A "now" line marks the current month when the year is the current one,
 * and the line stops there — nothing is drawn for months that have not happened.
 */
export function YearChart({
  months,
  dots,
  nowMonth,
  unitLabel,
  teams,
  onDotClick,
  onHoverDot,
  emptyMessage = "Nothing dated in this year yet.",
  className,
}: {
  months: MonthPoint[];
  dots: YearDot[];
  /** 0–11 when the chart shows the current year, else null. */
  nowMonth: number | null;
  unitLabel: string;
  teams: TeamRef[];
  onDotClick?: (dot: YearDot) => void;
  onHoverDot?: (dot: YearDot | null) => void;
  emptyMessage?: string;
  className?: string;
}) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<YearDot | null>(null);
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const gradientId = React.useId();

  const setHot = (dot: YearDot | null) => {
    setHover(dot);
    onHoverDot?.(dot);
  };

  const withData = months.filter((m) => m.value > 0).length;
  if (withData === 0 && dots.length === 0) return <ChartEmpty message={emptyMessage} />;

  const pad = { top: 22, right: 14, bottom: 26, left: 40 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = Math.max(0, height - pad.top - pad.bottom);
  const lastMonth = nowMonth ?? 11;
  const peak = Math.max(...months.slice(0, lastMonth + 1).map((m) => m.value), ...dots.map((d) => d.value), 0);
  const { top, ticks } = niceScale(peak);
  const xOf = (frac: number) => pad.left + frac * plotW;
  const yOf = (v: number) => pad.top + plotH - (v / top) * plotH;

  const shownMonths = months.slice(0, lastMonth + 1);
  const linePoints = shownMonths.map((m) => ({ x: xOf(MONTH_MID[m.month]!), y: yOf(m.value) }));
  const endX = nowMonth !== null ? xOf(MONTH_MID[nowMonth]!) : xOf(1);
  const startPoint = shownMonths.length ? { x: xOf(0), y: yOf(shownMonths[0]!.value) } : null;
  const endPoint = shownMonths.length && nowMonth === null ? { x: xOf(1), y: yOf(shownMonths[shownMonths.length - 1]!.value) } : null;
  const curvePoints = [startPoint, ...linePoints, endPoint].filter((p): p is { x: number; y: number } => !!p);
  const line = smoothPath(curvePoints);
  const area = curvePoints.length ? `${line} L${curvePoints[curvePoints.length - 1]!.x},${yOf(0)} L${curvePoints[0]!.x},${yOf(0)} Z` : "";
  const donePoints = shownMonths.map((m) => ({ x: xOf(MONTH_MID[m.month]!), y: yOf(m.done) }));
  const doneCurve = [startPoint ? { x: xOf(0), y: yOf(shownMonths[0]!.done) } : null, ...donePoints, endPoint ? { x: xOf(1), y: yOf(shownMonths[shownMonths.length - 1]!.done) } : null].filter((p): p is { x: number; y: number } => !!p);
  const doneLine = smoothPath(doneCurve);
  const peakMonth = shownMonths.reduce<MonthPoint | null>((best, m) => (m.value > 0 && (!best || m.value > best.value) ? m : best), null);

  const visibleDots = dots.filter((d) => nowMonth === null || d.x <= (nowMonth + 1) / 12);
  const hotDot = (clientX: number, clientY: number): YearDot | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const px = clientX - box.left;
    const py = clientY - box.top;
    let best: YearDot | null = null;
    let bestDist = 18;
    for (const d of visibleDots) {
      const dx = xOf(d.x) - px;
      const dy = yOf(d.value) - py;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  };

  return (
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      {/* Absolute so the svg's size cannot feed back into this flex parent and grow it
          frame by frame wherever no definite height sits above it (stacked on a phone). */}
      <div ref={ref} className="relative min-h-[180px] flex-1">
        {width > 0 && height > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            className="absolute inset-0 block select-none"
            role="img"
            aria-label={`${unitLabel} per month`}
            onMouseMove={(e) => setHot(hotDot(e.clientX, e.clientY))}
            onMouseLeave={() => setHot(null)}
            onClick={(e) => {
              const d = hotDot(e.clientX, e.clientY);
              if (d && onDotClick) onDotClick(d);
            }}
            style={{ cursor: hover && onDotClick ? "pointer" : "default" }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={BRAND_RED} stopOpacity={0.42} />
                <stop offset="100%" stopColor={BRAND_RED} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.left} x2={width - pad.right} y1={yOf(t)} y2={yOf(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={pad.left - 8} y={yOf(t) + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                  {compactCount(t)}
                </text>
              </g>
            ))}
            {MONTH_LABELS.map((label, i) => (
              <text key={label} x={xOf(MONTH_MID[i]!)} y={height - 8} textAnchor="middle" fontSize={10} fill={nowMonth !== null && i > nowMonth ? "var(--border)" : "var(--muted-foreground)"}>
                {label}
              </text>
            ))}
            {area && <path d={area} fill={`url(#${gradientId})`} className={cn(mounted && !reduced && "dashboard-area-in")} />}
            {doneLine && shownMonths.some((m) => m.done > 0) && <path d={doneLine} fill="none" stroke="var(--foreground)" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="3 4" />}
            {line && <path d={line} fill="none" stroke={BRAND_RED} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className={cn(mounted && !reduced && "dashboard-line-in")} />}
            {peakMonth && (
              // Anchored away from the NOW marker and the plot's right edge so the label never sits on either.
              <text
                x={xOf(MONTH_MID[peakMonth.month]!) + (peakMonth.month === nowMonth || peakMonth.month >= 10 ? -8 : 0)}
                y={yOf(peakMonth.value) - 8}
                textAnchor={peakMonth.month === nowMonth || peakMonth.month >= 10 ? "end" : "middle"}
                fontSize={10}
                fontWeight={700}
                fill={BRAND_RED}
              >
                Peak · {formatCount(peakMonth.value)}
              </text>
            )}
            {nowMonth !== null && (
              <g>
                <line x1={endX} x2={endX} y1={pad.top - 6} y2={yOf(0)} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.7} />
                <text x={endX} y={pad.top - 10} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--muted-foreground)">
                  NOW
                </text>
              </g>
            )}
            {visibleDots.map((d, i) => {
              const hot = hover?.id === d.id;
              return (
                <circle
                  key={d.id}
                  cx={xOf(d.x)}
                  cy={yOf(d.value)}
                  r={hot ? DOT_R_HOT : DOT_R}
                  fill={d.color}
                  fillOpacity={hover && !hot ? 0.35 : 0.95}
                  stroke={hot ? "var(--background)" : "none"}
                  strokeWidth={hot ? 2 : 0}
                  className={cn("transition-[r,fill-opacity] duration-150", mounted && !reduced && "dashboard-dot-in")}
                  style={{ animationDelay: `${Math.min(700, (i / Math.max(1, visibleDots.length)) * 700)}ms` }}
                />
              );
            })}
          </svg>
        )}
        {hover && width > 0 && (
          <ChartTooltip x={xOf(hover.x)} y={yOf(hover.value) - 6} width={width}>
            <p className="truncate font-semibold">{hover.name}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: hover.color }} />
              {hover.team.name}
            </p>
            <p className="mt-0.5 text-muted-foreground tabular">
              {formatCount(hover.value)} {unitLabel.toLowerCase()} · {hover.date}
              {hover.isDone ? " · done" : ""}
            </p>
            {onDotClick && <p className="mt-1 text-2xs text-muted-foreground">Click to open</p>}
          </ChartTooltip>
        )}
      </div>
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {teams
          .filter((t) => visibleDots.some((d) => d.team.id === t.id))
          .map((t) => (
            <li key={t.id} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: visibleDots.find((d) => d.team.id === t.id)?.color }} />
              {t.name}
            </li>
          ))}
        {shownMonths.some((m) => m.done > 0) && (
          <li className="flex items-center gap-1.5">
            <span className="h-px w-3 border-t border-dashed border-foreground/60" />
            Done
          </li>
        )}
      </ul>
    </div>
  );
}

"use client";

import * as React from "react";
import { BRAND_RED, ChartTooltip, compactCount, formatCount, niceScale, useSize } from "@/features/dashboard/charts/chart-utils";
import { KineticNumber, useSprings } from "@/features/dashboard/charts/motion";
import { ChartEmpty, RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { formatDays, formatPercent, inAndOut, onTime, sentBack, timeInStatus, turnaround, type FlowBucket, type RateFigure } from "@/features/dashboard/flow";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

/**
 * How the work moves: how long it takes, whether it lands on time, how often
 * it comes back, whether more arrives than leaves, and where it waits.
 *
 * Below everything else on purpose. The page above is volume and who carries
 * it; this is delivery, and it is read from when work finished rather than
 * from the page's basis, so it sits apart instead of amongst figures that
 * count something else.
 */
export function FlowSection({ facts, report, prefs, today, links }: DashboardViewProps) {
  const period = report.period;
  const teamIds = prefs.teamIds;
  const speed = React.useMemo(() => turnaround(facts, period, teamIds), [facts, period, teamIds]);
  const punctual = React.useMemo(() => onTime(facts, period, teamIds), [facts, period, teamIds]);
  const returned = React.useMemo(() => sentBack(facts, period, teamIds), [facts, period, teamIds]);
  const flow = React.useMemo(() => inAndOut(facts, period, teamIds, today), [facts, period, teamIds, today]);
  const waits = React.useMemo(() => timeInStatus(facts, period, teamIds), [facts, period, teamIds]);
  const net = flow.totalIn - flow.totalOut;
  const teamHref = links ? (id: string) => links.team(id) : undefined;

  return (
    <>
      <div className="grid gap-3 xl:grid-cols-3" data-testid="dashboard-flow-rates">
        <RatePanel
          title="Turnaround"
          subtitle="Median days, made to done"
          info="Days from a task being made to its last move into Done, for work finished in the period."
          figure={speed}
          format={formatDays}
          better="lower"
          countLabel="finished"
          comparisonLabel={period.comparisonLabel}
          teamHref={teamHref}
          testId="dashboard-turnaround"
        />
        <RatePanel
          title="On time"
          subtitle="Finished by the due date"
          info="Of the work finished in the period that had a due date, the share done on or before it."
          figure={punctual}
          format={formatPercent}
          max={100}
          better="higher"
          countLabel="with a due date"
          comparisonLabel={period.comparisonLabel}
          teamHref={teamHref}
          testId="dashboard-on-time"
        />
        <RatePanel
          title="Sent back"
          subtitle={`Reopened, or returned from review · ${formatCount(returned.times)} ${returned.times === 1 ? "time" : "times"}`}
          info="Of the work finished in the period, the share that went back at least once: out of Done, or from review back to work."
          figure={returned}
          format={formatPercent}
          max={100}
          better="lower"
          countLabel="finished"
          comparisonLabel={period.comparisonLabel}
          teamHref={teamHref}
          testId="dashboard-sent-back"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel
          title="In and out"
          subtitle={`New and finished tasks by ${flow.weekly ? "week" : "month"} · ${period.label}`}
          info="More in than out means the backlog is growing."
          action={
            <span className="text-2xs text-muted-foreground tabular" data-testid="dashboard-in-out-net">
              {formatCount(flow.totalIn)} in · {formatCount(flow.totalOut)} out ·{" "}
              <span className={cn("font-medium", net > 0 ? "text-destructive" : net < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>
                backlog {net > 0 ? "+" : ""}
                {formatCount(net)}
              </span>
            </span>
          }
          className="p-4"
          testId="dashboard-in-out"
        >
          <InOutChart buckets={flow.buckets} />
        </Panel>
        <Panel title="Time in each status" subtitle="Median days, done left out" info="How long work sits in each status before it moves on, including work still sitting there today." className="p-4" testId="dashboard-time-in-status">
          <RankedBars data={waits.slice(0, 8)} format={formatDays} valueLabel="median" compact emptyMessage="No status changes in this period." />
        </Panel>
      </div>
    </>
  );
}

const DIMENSIONS = [
  { key: "team", label: "Team" },
  { key: "department", label: "Department" },
] as const;

/** One delivery figure, how it compares, and the teams or departments behind it. */
function RatePanel({
  title,
  subtitle,
  info,
  figure,
  format,
  max,
  better,
  countLabel,
  comparisonLabel,
  teamHref,
  testId,
}: {
  title: string;
  subtitle: string;
  info: string;
  figure: RateFigure;
  format: (value: number) => string;
  max?: number;
  better: "lower" | "higher";
  countLabel: string;
  comparisonLabel: string;
  teamHref?: (id: string) => string;
  testId: string;
}) {
  const [dimension, setDimension] = React.useState<(typeof DIMENSIONS)[number]["key"]>("team");
  const rows = dimension === "team" ? figure.byTeam : figure.byDepartment;
  const { value, comparison } = figure;
  // Whether the change is good news depends on the figure: fewer days is better, fewer on time is not.
  const change = value !== null && comparison !== null && Math.abs(value - comparison) > 1e-9 ? (better === "lower" ? comparison - value : value - comparison) : null;
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      info={info}
      action={
        <div role="radiogroup" aria-label={`Break ${title.toLowerCase()} down by`} className="inline-flex items-center rounded-full border border-border/70 p-0.5">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              type="button"
              role="radio"
              aria-checked={dimension === d.key}
              onClick={() => setDimension(d.key)}
              className={cn("h-9 rounded-full px-3 text-2xs font-medium transition-colors sm:h-7 sm:px-2.5", dimension === d.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {d.label}
            </button>
          ))}
        </div>
      }
      className="p-4"
      testId={testId}
    >
      {value === null ? (
        <ChartEmpty message="Nothing finished in this period." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <KineticNumber value={value} format={format} className="text-2xl font-semibold tracking-tight tabular" />
            <span className="text-2xs text-muted-foreground tabular">
              {formatCount(figure.count)} {countLabel}
            </span>
            {comparison !== null && (
              <span
                className={cn("text-2xs tabular", change === null ? "text-muted-foreground" : change > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}
                data-testid={`${testId}-comparison`}
              >
                {comparisonLabel}: {format(comparison)}
              </span>
            )}
          </div>
          <RankedBars
            data={rows.slice(0, 6)}
            format={format}
            max={max}
            compact
            hrefOf={teamHref && dimension === "team" ? (row) => (row.id ? teamHref(row.id) : null) : undefined}
            emptyMessage={dimension === "team" ? "No team finished work in this period." : "Nothing finished carries a department."}
          />
        </>
      )}
    </Panel>
  );
}

const IN_COLOR = BRAND_RED;
const OUT_COLOR = "#10b981";

/**
 * New against finished, a pair of columns a bucket, each with its count, and
 * under the month what it did to the backlog. A stretch that has not happened
 * yet draws nothing. The columns spring as a share of the scale, so a new
 * period or filter cannot draw them off the top (see year-comparison).
 */
function InOutChart({ buckets }: { buckets: FlowBucket[] }) {
  const [ref, size] = useSize<HTMLDivElement>();
  const [hover, setHover] = React.useState<string | null>(null);
  const peak = Math.max(1, ...buckets.map((b) => Math.max(b.in ?? 0, b.out ?? 0)));
  const width = Math.max(size.width, 320);
  const height = Math.max(size.height, 180);
  const { top: targetTop, ticks } = niceScale(peak, 4);
  const top = Math.max(1e-6, targetTop);
  const sprung = useSprings(Object.fromEntries(buckets.flatMap((b) => [[`i${b.key}`, (b.in ?? 0) / top], [`o${b.key}`, (b.out ?? 0) / top]])));
  const live = (key: string, fallback: number) => Math.min(1, Math.max(0, sprung[key] ?? fallback / top)) * top;

  const padLeft = Math.max(30, 14 + compactCount(top).length * 6);
  const padRight = 6;
  const padTop = 18;
  const padBottom = 36;
  const plot = height - padBottom;
  const slot = (width - padLeft - padRight) / Math.max(1, buckets.length);
  const barWidth = Math.max(4, Math.min(36, slot * 0.34));
  const y = (value: number) => plot - (value / top) * (plot - padTop);
  // Every label while they fit; past that, every other one. Counts sit on the bars only when a bar is wide enough to carry one.
  const labelEvery = slot < 34 ? 2 : 1;
  const counts = barWidth >= 14;
  const hovered = buckets.findIndex((b) => b.key === hover);
  const empty = buckets.every((b) => !b.in && !b.out);

  const happened = buckets.filter((b) => b.in !== null);
  const totalIn = happened.reduce((sum, b) => sum + (b.in ?? 0), 0);
  const totalOut = happened.reduce((sum, b) => sum + (b.out ?? 0), 0);
  const busiest = happened.reduce<FlowBucket | null>((best, b) => ((b.in ?? 0) > (best?.in ?? 0) ? b : best), null);
  const mostDone = happened.reduce<FlowBucket | null>((best, b) => ((b.out ?? 0) > (best?.out ?? 0) ? b : best), null);
  // The backlog as it stood after each bucket, counted from the start of the period.
  const running = new Map<string, number>();
  let sofar = 0;
  for (const b of happened) {
    sofar += (b.in ?? 0) - (b.out ?? 0);
    running.set(b.key, sofar);
  }
  const netTone = (net: number) => (net > 0 ? "fill-destructive" : net < 0 ? "fill-emerald-600 dark:fill-emerald-400" : "fill-muted-foreground");

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 text-2xs">
        <Key color={IN_COLOR} label="New" />
        <Key color={OUT_COLOR} label="Finished" />
        {totalIn > 0 && (
          <dl className="ml-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular" data-testid="in-out-figures">
            <Figure label="Finish rate" value={formatPercent((totalOut / totalIn) * 100)} />
            {busiest && <Figure label="Most new" value={`${busiest.label} · ${formatCount(busiest.in ?? 0)}`} />}
            {mostDone && (mostDone.out ?? 0) > 0 && <Figure label="Most finished" value={`${mostDone.label} · ${formatCount(mostDone.out ?? 0)}`} />}
          </dl>
        )}
      </div>
      <div ref={ref} className="relative min-h-[180px] w-full flex-1">
        {empty && (
          <div className="absolute inset-0 z-[1] flex bg-card">
            <ChartEmpty message="No work made or finished in this period." />
          </div>
        )}
        <svg role="img" aria-label="New and finished tasks" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="size-full select-none" onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padLeft} x2={width - padRight} y1={y(tick)} y2={y(tick)} strokeWidth={1} strokeDasharray={tick === 0 ? undefined : "2 4"} className={tick === 0 ? "stroke-border/80" : "stroke-border/60"} />
              <text x={padLeft - 6} y={y(tick) + 3} textAnchor="end" className="fill-muted-foreground text-[9px] tabular">
                {compactCount(tick)}
              </text>
            </g>
          ))}
          {buckets.map((bucket, index) => {
            const centre = padLeft + index * slot + slot / 2;
            const on = hover === bucket.key;
            const dim = hover !== null && !on;
            return (
              <g key={bucket.key} onMouseEnter={() => setHover(bucket.key)} data-testid="in-out-bucket">
                <rect x={padLeft + index * slot} y={0} width={slot} height={plot} className={cn("fill-transparent", on && "fill-foreground/[0.05]")} />
                {bucket.in !== null && (
                  <rect x={centre - barWidth - 1} y={y(live(`i${bucket.key}`, bucket.in))} width={barWidth} height={Math.max(0, plot - y(live(`i${bucket.key}`, bucket.in)))} rx={3} fill={IN_COLOR} fillOpacity={dim ? 0.5 : 1} />
                )}
                {bucket.out !== null && (
                  <rect x={centre + 1} y={y(live(`o${bucket.key}`, bucket.out))} width={barWidth} height={Math.max(0, plot - y(live(`o${bucket.key}`, bucket.out)))} rx={3} fill={OUT_COLOR} fillOpacity={dim ? 0.5 : 1} />
                )}
                {counts && bucket.in !== null && bucket.in > 0 && (
                  <text x={centre - barWidth / 2 - 1} y={y(live(`i${bucket.key}`, bucket.in)) - 4} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular">
                    {formatCount(bucket.in)}
                  </text>
                )}
                {counts && bucket.out !== null && bucket.out > 0 && (
                  <text x={centre + barWidth / 2 + 1} y={y(live(`o${bucket.key}`, bucket.out)) - 4} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular">
                    {formatCount(bucket.out)}
                  </text>
                )}
                {index % labelEvery === 0 && (
                  <text x={centre} y={plot + 14} textAnchor="middle" className={cn("text-[10px]", bucket.in === null ? "fill-muted-foreground/50" : "fill-muted-foreground")}>
                    {bucket.label}
                  </text>
                )}
                {/* What the bucket did to the backlog: more in than out adds to it. */}
                {index % labelEvery === 0 && bucket.in !== null && (
                  <text x={centre} y={plot + 28} textAnchor="middle" className={cn("text-[10px] font-medium tabular", netTone((bucket.in ?? 0) - (bucket.out ?? 0)))} data-testid="in-out-net">
                    {signed((bucket.in ?? 0) - (bucket.out ?? 0))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered >= 0 && buckets[hovered]!.in !== null && (
          <ChartTooltip x={padLeft + hovered * slot + slot / 2} y={y(Math.max(buckets[hovered]!.in ?? 0, buckets[hovered]!.out ?? 0))} width={width}>
            <p className="font-medium text-foreground">{buckets[hovered]!.label}</p>
            <p className="mt-1 flex items-center gap-1.5 tabular">
              <span aria-hidden className="size-1.5 rounded-sm" style={{ background: IN_COLOR }} />
              <span className="flex-1 text-muted-foreground">New</span>
              <span className="font-medium">{formatCount(buckets[hovered]!.in ?? 0)}</span>
            </p>
            <p className="flex items-center gap-1.5 tabular">
              <span aria-hidden className="size-1.5 rounded-sm" style={{ background: OUT_COLOR }} />
              <span className="flex-1 text-muted-foreground">Finished</span>
              <span className="font-medium">{formatCount(buckets[hovered]!.out ?? 0)}</span>
            </p>
            <p className="mt-1 flex items-center gap-1.5 border-t border-border/50 pt-1 tabular">
              <span className="flex-1 text-muted-foreground">Backlog</span>
              <span className="font-medium">{signed((buckets[hovered]!.in ?? 0) - (buckets[hovered]!.out ?? 0))}</span>
            </p>
            <p className="flex items-center gap-1.5 tabular">
              <span className="flex-1 text-muted-foreground">Since the start</span>
              <span className="font-medium">{signed(running.get(buckets[hovered]!.key) ?? 0)}</span>
            </p>
          </ChartTooltip>
        )}
      </div>
    </div>
  );
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCount(Math.abs(n))}`;

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </span>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span aria-hidden className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

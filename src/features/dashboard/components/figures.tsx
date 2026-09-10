"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import * as React from "react";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import type { Comparison } from "@/features/dashboard/metrics";
import { cn } from "@/lib/utils";
import { StatBar, TrendLine } from "./stat-visuals";

/**
 * A headline figure and what it is being compared with.
 *
 * Two of these lead the Overview, side by side and the same size, because tasks
 * and asset units answer different questions and a manager reports both. The
 * number is large; everything qualifying it — the period, the date basis, the
 * comparison — is stated in words underneath rather than left to a tooltip.
 *
 * The change is **not** coloured green for up and red for down. More work
 * arriving may be a good year or an unmanageable one, and the page does not
 * know which; an arrow and a sign say what happened and leave the judgement to
 * the reader. Red is kept for the one thing on this page that really is bad
 * news, which is work already late.
 */
export function HeadlineFigure({
  label,
  unitWord,
  comparison,
  periodLabel,
  comparisonLabel,
  basisLine,
  footnote,
  onDrill,
  trend,
  trendLabels,
  valueFormat = formatCount,
  testId,
}: {
  label: string;
  unitWord: string;
  comparison: Comparison;
  periodLabel: string;
  comparisonLabel: string;
  basisLine: string;
  footnote?: React.ReactNode;
  onDrill?: () => void;
  /** The same measure month by month, drawn inside the card. */
  trend?: Array<number | null>;
  /** Month names for the trend's own axis, aligned to `trend`. */
  trendLabels?: readonly string[];
  /**
   * How every figure on the card reads: the headline, the ring, the comparison
   * and the change. Counts by default; effort passes `formatHours`, because
   * "6,186" and "6,186 h" are not the same claim.
   */
  valueFormat?: (value: number) => string;
  testId?: string;
}) {
  const { current, comparison: previous, delta, percent } = comparison;
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-xs" data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium text-muted-foreground">{label}</h3>
          <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
            {/* Big, because this is the figure the team reports upwards. */}
            <span className="text-[2.5rem] font-semibold leading-none tracking-tight tabular sm:text-[3rem]" data-testid={testId ? `${testId}-value` : undefined}>
              {valueFormat(current)}
            </span>
            <span className="text-[13px] text-muted-foreground">{unitWord}</span>
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">{basisLine}</p>
        </div>
      </div>

      {/* The card sits in a grid row with the year chart, which is taller, so
          the row stretches it. The trend takes up whatever that stretch gives
          rather than leaving it blank under the footer: the same line, drawn
          bigger, and no dead space. `preserveAspectRatio="none"` on the svg is
          what lets it fill a height it does not choose. */}
      <div className="mt-3 flex min-h-14 flex-1 flex-col justify-end">
        {trend && <TrendLine values={trend} labels={trendLabels} label={`${label} by month`} className="h-full min-h-14" />}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2.5 text-xs">
        {previous === null ? (
          <span className="text-muted-foreground" data-testid={testId ? `${testId}-unavailable` : undefined}>
            No {comparisonLabel} to compare with — <span className="font-medium text-foreground/80">Unavailable</span>
          </span>
        ) : (
          <>
            <ChangeChip delta={delta} percent={percent} format={valueFormat} />
            <span className="text-muted-foreground">
              vs <span className="tabular text-foreground/80">{valueFormat(previous)}</span> in {comparisonLabel}
            </span>
          </>
        )}
      </div>
      {footnote && <p className="mt-1.5 text-2xs text-muted-foreground">{footnote}</p>}
      {onDrill && (
        <button type="button" onClick={onDrill} className="mt-3 self-start text-xs font-medium text-foreground/80 underline-offset-4 hover:underline" data-testid={testId ? `${testId}-drill` : undefined}>
          Show the {periodLabel} records
        </button>
      )}
    </section>
  );
}

/** The change itself: a direction, a number, and a percentage only when one exists. */
export function ChangeChip({ delta, percent, className, format = formatCount }: { delta: number | null; percent: number | null; className?: string; format?: (value: number) => string }) {
  if (delta === null) return null;
  const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-surface-strong/60 px-2 py-0.5 font-medium tabular", className)}>
      <Icon className="size-3.5" aria-hidden />
      {/* The sign is the arrow's and the prefix's job, so the figure itself is
          a magnitude. `formatHours` cannot express a negative — it reads
          anything at or below nothing as "0 h" — and a fall of 2,409 hours
          rendering as "0 h" is worse than no chip at all. */}
      {delta > 0 ? "+" : delta < 0 ? "-" : ""}
      {format(Math.abs(delta))}
      {percent === null ? (
        // A zero baseline. "+12 from nothing" is a fact; "+∞%" is not.
        <span className="font-normal text-muted-foreground">· no % comparison</span>
      ) : (
        <span className="font-normal text-muted-foreground">
          · {percent > 0 ? "+" : ""}
          {percent.toFixed(percent > -10 && percent < 10 ? 1 : 0)}%
        </span>
      )}
    </span>
  );
}

/**
 * Counts that are true right now, whatever period is being reported on.
 *
 * Its own strip, with its own date, because the two kinds of number on this
 * page answer different questions and mixing them is how a manager comes to
 * believe last March's overdue work is today's. The figures overlap — a task
 * can be overdue and blocked — and the strip says so rather than offering a
 * total that would double-count.
 */
export function OperationsStrip({
  asOf,
  items,
  onSelect,
}: {
  asOf: string;
  items: Array<{ key: string; label: string; count: number; tone?: "urgent" | "neutral"; hint: string }>;
  onSelect?: (key: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card px-4 py-3 shadow-xs sm:px-5" data-testid="dashboard-operations">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-semibold">Current operations</h3>
        <p className="text-2xs text-muted-foreground">
          as of {asOf} · these overlap and are not a total
        </p>
      </div>
      {/* Each count against the largest of them. They do not sum — a task can be
          overdue and blocked — so the bar compares rather than apportions, and
          the shape of the morning is visible without reading four numbers. */}
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <StatBar
            key={item.key}
            value={item.count}
            peak={Math.max(1, ...items.map((i) => i.count))}
            label={item.label}
            tone={item.tone}
            hint={item.hint}
            onSelect={onSelect ? () => onSelect(item.key) : undefined}
            testId={`dashboard-op-${item.key}`}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * What the figures above cannot see.
 *
 * Not an error and not a warning — a footnote with a number in it. A due-date
 * report over a workspace where a third of the work is undated is a different
 * document from one where all of it is dated, and the reader cannot tell which
 * they are holding unless the page says.
 */
export function CoverageNote({ lines, className }: { lines: string[]; className?: string }) {
  if (lines.length === 0) return null;
  return (
    <p className={cn("text-2xs leading-relaxed text-muted-foreground", className)} data-testid="dashboard-coverage">
      {lines.join(" · ")}
    </p>
  );
}

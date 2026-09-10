"use client";

import { ChevronDown } from "lucide-react";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import * as React from "react";
import { RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { assetTypeHex, teamHex, type TeamRef } from "@/features/dashboard/analytics";
import { departmentHex, dimensionComparison, type ComparisonDimension } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

const DIMENSIONS: Array<{ key: ComparisonDimension; label: string; column: string }> = [
  { key: "team", label: "Team", column: "Team" },
  { key: "department", label: "Department", column: "Department" },
  { key: "assetType", label: "Asset type", column: "Asset type" },
];

/**
 * Where the work came from, and how this period compares with the last.
 *
 * Was a tab of its own, and repeated the by-month chart the page already had
 * above it plus a twelve-row table saying the same thing again. Folded in here
 * it keeps the two things the chart cannot answer — how many *requests* arrived
 * as opposed to tasks, and the same period broken down by team, department or
 * asset type — and drops the duplication.
 *
 * Ranked bars, and the figure printed beside each one. It carried the whole
 * period-against-period table under a disclosure for a while: the numbers were
 * already on the bars, the change was already on the year chart above, and it
 * left the panel taller than the one beside it for a table nobody opened.
 */
export function DemandSection({ facts, report, ops, prefs, set, publicLink }: DashboardViewProps) {
  const [dimension, setDimension] = React.useState<ComparisonDimension>("team");
  const unitWord = prefs.unit === "assets" ? "asset units" : "tasks";

  const colorOf = React.useMemo(() => {
    const teams = new Map(facts.teams.map((t: TeamRef) => [t.id, teamHex(t)]));
    return (key: string) => {
      if (dimension === "team") return teams.get(key) ?? "#94a3b8";
      if (dimension === "assetType") return assetTypeHex(key);
      return departmentHex(key);
    };
  }, [dimension, facts.teams]);

  const rows = React.useMemo(() => dimensionComparison(report, dimension, prefs.unit, colorOf), [report, dimension, prefs.unit, colorOf]);
  const measured = dimension === "assetType" ? "asset units" : unitWord;
  const active = DIMENSIONS.find((d) => d.key === dimension)!;

  // Requests are counted by the day they arrived, and a request is not a task —
  // one request can become several — so the two series are never subtracted.
  const requestsNow = report.current.tasks.filter((task) => task.request);
  const requestsThen = report.comparison?.tasks.filter((task) => task.request) ?? null;
  const openNow = ops.unallocated.length;
  const peak = Math.max(requestsNow.length, requestsThen?.length ?? 0, openNow, 1);

  // Two panels of one width. Given a third of the row the bars had a 26rem cap
  // and several inches of nothing to the right of them; on half the row the cap
  // never binds and the bars fill the panel they are in.
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {/* `h-auto` undoes Panel's own `h-full`, which resolves to 100% of the
          grid row and would stretch this panel to match whichever of the two is
          taller. `self-start` alone cannot win against a height of 100%. */}
      <Panel title="Requests in" subtitle="By the day they arrived" className="h-auto self-start p-4" testId="dashboard-demand-requests">
        {/* Three bordered cards with a 2xl figure each was a lot of furniture
            for three numbers in a narrow column. One row apiece: the figure, its
            label, and a rule underneath showing it against the larger of the two
            years — so the comparison is still visible without three boxes. */}
        <dl className="flex flex-col gap-2.5">
          <RequestFigure label={report.period.label} value={requestsNow.length} peak={peak} tone="good" />
          <RequestFigure label={report.period.comparisonLabel} value={requestsThen?.length ?? null} peak={peak} />
          {!publicLink && <RequestFigure label="Open right now" value={openNow} peak={peak} tone={openNow > 0 ? "urgent" : undefined} hint="no team, nobody assigned" />}
        </dl>
        <p className="mt-3 border-t border-border/50 pt-2 text-2xs leading-relaxed text-muted-foreground">
          One request can become several tasks, so these are never subtracted from the task count.
        </p>
      </Panel>

      <Panel
        title={`By ${active.label.toLowerCase()}`}
        subtitle={`${measured} · ${report.period.label} against ${report.period.comparisonLabel}`}
        className="p-4"
        action={
          <div role="radiogroup" aria-label="Break the comparison down by" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
            {DIMENSIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={dimension === d.key}
                onClick={() => setDimension(d.key)}
                className={cn(
                  "h-7 rounded-full px-2.5 text-2xs font-medium transition-colors",
                  dimension === d.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`dashboard-dimension-${d.key}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
        testId="dashboard-dimension-panel"
      >
        {/* This period only. The bar answers "which is biggest"; last year's
            figure beside it made every row read "10,148 · 28,644" and belongs
            with the other exact numbers, in the table below. */}
        <RankedBars
          data={rows.slice(0, 8).map((r) => ({ id: r.key, name: r.name, value: r.current, color: r.color }))}
          valueLabel={measured}
          emptyMessage="Nothing in this period."
        />
        {dimension === "assetType" && (
          <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
            Asset types are measured in units, and one task can hold several — so these rows are not unique task counts and do not sum to the task total.
          </p>
        )}
        {prefs.teamIds && (
          <p className="mt-2 text-2xs text-muted-foreground">
            <button type="button" onClick={() => set({ teamIds: null })} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              Clear the team filter
            </button>
          </p>
        )}
      </Panel>
    </div>
  );
}

/**
 * One figure, its label, and a rule showing it against the biggest of them.
 *
 * Deliberately light: three of these sit in a narrow column, and three bordered
 * cards with a 2xl number each read as furniture rather than as three related
 * numbers.
 */
function RequestFigure({ label, value, peak, tone, hint }: { label: string; value: number | null; peak: number; tone?: "good" | "urgent"; hint?: string }) {
  return (
    <div className="border-b border-border/40 pb-2.5 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 text-[13px] text-muted-foreground">
          <span className="block truncate">{label}</span>
          {hint && <span className="block text-2xs text-muted-foreground/70">{hint}</span>}
        </dt>
        <dd
          className={cn(
            "shrink-0 text-xl font-semibold leading-none tabular tracking-tight",
            value === null && "text-xs font-normal text-muted-foreground",
            tone === "urgent" && (value ?? 0) > 0 && "text-destructive",
            tone === "good" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {value === null ? "Nothing recorded" : formatCount(value)}
        </dd>
      </div>
      {value !== null && (
        <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-strong/70">
          <span
            className={cn("block h-full rounded-full", tone === "urgent" ? "bg-destructive" : tone === "good" ? "bg-emerald-500" : "bg-foreground/40")}
            style={{ width: `${peak > 0 ? Math.max(2, (value / peak) * 100) : 0}%` }}
          />
        </span>
      )}
    </div>
  );
}

/**
 * The exact figures, one click away.
 *
 * Every chart on this page used to carry its table beside it, which is honest
 * and made the page a spreadsheet. A `<details>` keeps the numbers reachable —
 * and reachable by a screen reader and a copy-paste into an email — without
 * them competing with the picture for the first look.
 */
export function Numbers({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group mt-3 border-t border-border/50 pt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground">
        <ChevronDown className="size-3 transition-transform group-open:rotate-180" aria-hidden />
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

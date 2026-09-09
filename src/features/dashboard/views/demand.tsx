"use client";

import * as React from "react";
import { RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { assetTypeHex, teamHex, type TeamRef } from "@/features/dashboard/analytics";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { CoverageNote } from "@/features/dashboard/components/figures";
import { ComparisonTable, YearComparisonChart } from "@/features/dashboard/components/year-comparison";
import { dimensionComparison, UNKNOWN_DEPARTMENT, type ComparisonDimension } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { tagColorFor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

const DIMENSIONS: Array<{ key: ComparisonDimension; label: string; column: string }> = [
  { key: "team", label: "Team", column: "Team" },
  { key: "department", label: "Department", column: "Stakeholder department" },
  { key: "assetType", label: "Asset type", column: "Asset type" },
];

/**
 * The operations review: how much work arrived, and how that compares.
 *
 * Everything here is one `VolumeReport` cut different ways, so the chart, the
 * table and the Overview's headline are the same number by construction rather
 * than by three functions happening to agree.
 *
 * Requests and production are **not** subtracted from one another anywhere on
 * this page. An incoming request and a production task are different entities —
 * one request can become several tasks — and "net backlog growth" computed by
 * subtracting one series from the other would be arithmetic on two different
 * populations.
 */
export function DemandView({ facts, report, monthly, prefs, set, ops }: DashboardViewProps) {
  const [dimension, setDimension] = React.useState<ComparisonDimension>("team");
  const unitWord = prefs.unit === "assets" ? "asset units" : "tasks";

  const colorOf = React.useMemo(() => {
    const teams = new Map(facts.teams.map((t: TeamRef) => [t.id, teamHex(t)]));
    return (key: string) => {
      if (dimension === "team") return teams.get(key) ?? "#94a3b8";
      if (dimension === "assetType") return assetTypeHex(key);
      return key === UNKNOWN_DEPARTMENT ? "#94a3b8" : tagColorFor(key);
    };
  }, [dimension, facts.teams]);

  const rows = React.useMemo(() => dimensionComparison(report, dimension, prefs.unit, colorOf), [report, dimension, prefs.unit, colorOf]);
  const measured = dimension === "assetType" ? "asset units" : unitWord;

  // Requests, counted by when they arrived, as their own series.
  const requestsNow = facts.requests.filter((r) => r.createdAt >= report.period.current.from && r.createdAt <= report.period.current.to);
  const requestsThen = report.period.comparison
    ? facts.requests.filter((r) => r.createdAt >= report.period.comparison!.from && r.createdAt <= report.period.comparison!.to)
    : null;

  const coverageLines = [
    prefs.basis === "due" && report.current.undatedTasks > 0 ? `${report.current.undatedTasks} tasks have no due date and are outside this report` : "",
    report.period.partial ? `${report.period.label} is not finished — these are partial actuals` : "",
    report.comparison === null ? `Nothing recorded for ${report.period.comparisonLabel}` : "",
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel
            title={`${prefs.unit === "assets" ? "Asset units" : "Tasks"} by month`}
            subtitle={`${report.period.label} against ${report.period.comparisonLabel} · ${prefs.basis === "created" ? "by request date" : "by due date"}`}
            testId="dashboard-demand-chart"
          >
            <YearComparisonChart rows={monthly} currentLabel={report.period.label} comparisonLabel={report.period.comparisonLabel} unitWord={unitWord} />
          </Panel>
        </div>
        <Panel title="Incoming requests" subtitle="Counted by the day they arrived" testId="dashboard-demand-requests">
          <dl className="flex flex-col gap-3 text-sm">
            <Figure term={report.period.label} value={requestsNow.length} />
            <Figure term={report.period.comparisonLabel} value={requestsThen?.length ?? null} />
            <Figure term="Open right now" value={ops.unallocated.length} hint="no team and nobody assigned" />
          </dl>
          <p className="mt-3 border-t border-border/50 pt-2 text-2xs leading-relaxed text-muted-foreground">
            A request and a production task are different things — one request can become several tasks — so these two series are shown side by side and never subtracted from
            one another.
          </p>
        </Panel>
      </div>

      <Panel
        title={`Compared by ${DIMENSIONS.find((d) => d.key === dimension)!.label.toLowerCase()}`}
        subtitle={`${measured} · ${report.period.label} against ${report.period.comparisonLabel}`}
        action={
          <div role="radiogroup" aria-label="Break the comparison down by" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
            {DIMENSIONS.map((d) => (
              <button
                key={d.key}
                type="button"
                role="radio"
                aria-checked={dimension === d.key}
                onClick={() => setDimension(d.key)}
                className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", dimension === d.key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                data-testid={`dashboard-dimension-${d.key}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        }
        testId="dashboard-dimension-panel"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <RankedBars data={rows.slice(0, 8).map((r) => ({ id: r.key, name: r.name, value: r.current, color: r.color }))} emptyMessage="Nothing in this period." />
          <ComparisonTable
            rows={rows}
            currentLabel={report.period.label}
            comparisonLabel={report.period.comparisonLabel}
            firstColumn={DIMENSIONS.find((d) => d.key === dimension)!.column}
            caption={
              dimension === "assetType"
                ? "Asset types are measured in units. One task can hold several types, so these rows are not unique task counts and do not sum to the task total."
                : undefined
            }
          />
        </div>
        <CoverageNote lines={coverageLines} className="mt-3" />
      </Panel>

      <Panel title="Every month, in full" subtitle={`${unitWord}, ${report.period.label} against ${report.period.comparisonLabel}`} testId="dashboard-monthly-table">
        <ComparisonTable
          rows={monthly.map((row) => ({ key: String(row.month), name: row.label, current: row.current, comparison: row.comparison, delta: row.delta, percent: row.percent }))}
          currentLabel={report.period.label}
          comparisonLabel={report.period.comparisonLabel}
          firstColumn="Month"
          caption="A month with no answer has not happened yet in the selected period; a zero is a month in which nothing was counted."
        />
      </Panel>

      <p className="text-2xs text-muted-foreground">
        Planned versus urgent demand is not shown: a priority label records how urgent somebody considered the work, not whether it was planned. Request notice — the gap
        between a request arriving and its requested deadline — would need the original requested date, which is not recorded separately from the current due date.
        {prefs.teamIds && (
          <>
            {" "}
            <button type="button" onClick={() => set({ teamIds: null })} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              Clear the team filter
            </button>
          </>
        )}
      </p>
    </div>
  );
}

function Figure({ term, value, hint }: { term: string; value: number | null; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-2 last:border-0 last:pb-0">
      <dt className="text-[13px] text-muted-foreground">
        {term}
        {hint && <span className="block text-2xs">{hint}</span>}
      </dt>
      <dd className="text-lg font-semibold tabular">{value === null ? <span className="text-xs font-normal text-muted-foreground">Unavailable</span> : formatCount(value)}</dd>
    </div>
  );
}

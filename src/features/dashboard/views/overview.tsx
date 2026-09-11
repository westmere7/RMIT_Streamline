"use client";

import * as React from "react";
import { formatHours, hasAnyRate, unratedTypes } from "@/domain";
import { assetEffortMix, assetMix, priorityMix, teamHex, UNTYPED } from "@/features/dashboard/analytics";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { TreemapChart } from "@/features/dashboard/charts/treemap";
import { CoverageNote, HeadlineFigure, OperationsStrip } from "@/features/dashboard/components/figures";
import { YearComparisonChart } from "@/features/dashboard/components/year-comparison";
import { departmentHex, UNKNOWN_DEPARTMENT } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import { DemandSection } from "./demand-section";
import type { DashboardViewProps } from "./types";
import { WorkloadSection } from "./workload-section";

/**
 * The dashboard: one page.
 *
 * It was three tabs — Overview, Demand & Delivery, Resourcing — and they cost
 * more than they gave. Two of them drew the same by-month chart, one restated
 * that chart as a twelve-row table underneath it, and answering "are we busier
 * than last year, and who is carrying it" meant visiting all three and holding
 * the first in your head. Folded together the duplication goes and the page
 * reads in one pass, top to bottom:
 *
 *   what the period came to      the three headline figures
 *   how it arrived               the year against last year, and how it divides
 *   where it came from           requests in, and the period by team or department
 *   what is true right now       the operations strip
 *   who is carrying it           a bar per person, split by stakeholder group
 *
 * Read as a picture, not a page. Almost everything is a shape; where a figure
 * has to be exact it sits behind a disclosure rather than beside the shape,
 * because a manager reporting upwards needs the exact one and everybody else
 * needs the picture first.
 *
 * Nothing here mixes the two kinds of time. Everything above the operations
 * strip is *reporting* and moves with the period control; everything from the
 * strip down is *now* and does not, because a manager reading last year's
 * volume still needs to know what is late today.
 */
export function DashboardBody(props: DashboardViewProps) {
  // Destructured for the body, and kept whole for the sections that take the
  // lot — they are handed the same figures this page is drawn from, so the two
  // cannot disagree about the period they describe.
  const { report, monthly, monthlyTasks, monthlyAssets, monthlyEffort, rates, ops, gaps, prefs, set } = props;
  const unitWord = prefs.unit === "assets" ? "asset units" : "tasks";
  const basisLine = `${prefs.basis === "created" ? "Requested" : "Scheduled"} in ${report.period.label}${report.period.partial ? " · partial actuals" : ""}`;

  const scoped = report.current.tasks;
  const scopedAssets = report.current.assets;
  const priority = React.useMemo(() => priorityMix(scoped), [scoped]);
  const mix = React.useMemo(() => assetMix(scopedAssets), [scopedAssets]);
  const mixUnits = React.useMemo(() => mix.reduce((sum, row) => sum + row.value, 0), [mix]);
  // The same deliverables weighed into hours. Kept beside the count rather
  // than replacing it: which types there are most of and which take the most
  // work are two different questions, and the answers rarely agree.
  const mixEffort = React.useMemo(() => assetEffortMix(scopedAssets, rates), [scopedAssets, rates]);
  const [assetMeasure, setAssetMeasure] = React.useState<"units" | "effort">("units");
  const byTeam = React.useMemo(() => {
    const rowsByTeam = new Map<string, { name: string; value: number; color: string }>();
    for (const task of scoped) {
      const entry = rowsByTeam.get(task.team.id) ?? { name: task.team.name, value: 0, color: teamHex(task.team) };
      entry.value += prefs.unit === "assets" ? task.assetUnits : 1;
      rowsByTeam.set(task.team.id, entry);
    }
    return [...rowsByTeam.entries()].map(([id, row]) => ({ id, ...row })).sort((a, b) => b.value - a.value);
  }, [scoped, prefs.unit]);
  const byDepartment = React.useMemo(() => {
    const rowsByDept = new Map<string, { name: string; value: number; color: string }>();
    for (const task of scoped) {
      const name = task.department?.name ?? UNKNOWN_DEPARTMENT;
      const entry = rowsByDept.get(name) ?? { name, value: 0, color: departmentHex(name) };
      entry.value += prefs.unit === "assets" ? task.assetUnits : 1;
      rowsByDept.set(name, entry);
    }
    return [...rowsByDept.values()].sort((a, b) => b.value - a.value);
  }, [scoped, prefs.unit]);

  // Effort leads only when somebody has recorded a rate. With none, the figure
  // would be a confident nought against a thousand deliverables, so the row
  // goes back to the two counts and the Settings link says what is missing.
  const ratesOn = hasAnyRate(rates);
  // Effort is only offered where a rate exists to weigh by; with none the
  // toggle would switch to an empty map.
  const byEffort = ratesOn && assetMeasure === "effort";
  const effortTotal = React.useMemo(() => mixEffort.reduce((sum, row) => sum + row.value, 0), [mixEffort]);
  // Types carrying volume with no rate: exactly what the total leaves out.
  //
  // "Untyped" is not one of them. It is the placeholder for a deliverable that
  // was never given a type, so there is no type to rate and nothing anybody
  // could do about being told — a permanent warning is worse than none. Those
  // units still count as nought hours, exactly as before; what the note names
  // is the types a rate is actually missing from.
  const unrated = React.useMemo(() => unratedTypes(scopedAssets, rates).filter((name) => name !== UNTYPED), [scopedAssets, rates]);

  const coverageLines: string[] = [];
  if (prefs.basis === "due" && report.current.undatedTasks > 0) coverageLines.push(`${report.current.undatedTasks} tasks have no due date and are not counted here`);
  if (gaps.withoutDepartment > 0) coverageLines.push(`${gaps.withoutDepartment} of ${gaps.tasks} have no department`);
  if (gaps.withoutStatus > 0) coverageLines.push(`${gaps.withoutStatus} have no status`);
  if (!ratesOn) coverageLines.push("no output rates recorded, so there is no effort figure — Settings → Lists → Asset types");

  return (
    <div className="flex flex-col gap-3">
      {/* Effort leads, with the two counts beside it.
          Hours are what a manager plans capacity with — three hundred photo
          edits and ten films are not thirty times the work — so effort gets the
          wide column and the counts sit next to it, exact and secondary. The
          year chart moves to its own row underneath: it was taller than these
          cards and stretched them, which is what left the dead space under
          their footers. */}
      <div className={cn("grid gap-3", ratesOn ? "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]" : "xl:grid-cols-2")}>
        {ratesOn && (
          <HeadlineFigure
            label="Effort"
            unitWord="hours"
            valueFormat={formatHours}
            comparison={report.effort}
            periodLabel={report.period.label}
            comparisonLabel={report.period.comparisonLabel}
            basisLine={basisLine}
            trend={monthlyEffort.map((row) => row.current)}
            trendLabels={monthlyEffort.map((row) => row.label)}
            footnote={
              unrated.length > 0 ? (
                <>
                  No rate yet for {unrated.slice(0, 3).join(", ")}
                  {unrated.length > 3 ? ` and ${unrated.length - 3} more` : ""} — their deliverables count as nought hours.
                </>
              ) : undefined
            }
            accent
            testId="dashboard-headline-effort"
          />
        )}
        <HeadlineFigure
          label="Tasks"
          unitWord="tasks"
          comparison={report.tasks}
          periodLabel={report.period.label}
          comparisonLabel={report.period.comparisonLabel}
          basisLine={basisLine}
          trend={monthlyTasks.map((row) => row.current)}
          trendLabels={monthlyTasks.map((row) => row.label)}
          testId="dashboard-headline-tasks"
        />
        <HeadlineFigure
          label="Asset units"
          unitWord="units"
          comparison={report.assetUnits}
          periodLabel={report.period.label}
          comparisonLabel={report.period.comparisonLabel}
          basisLine={basisLine}
          trend={monthlyAssets.map((row) => row.current)}
          trendLabels={monthlyAssets.map((row) => row.label)}
          testId="dashboard-headline-assets"
        />
      </div>

      {/* The year against last year, with what the period is made of beside
          it. The four splits are a column rather than a row of their own:
          read down the right-hand side they answer "and of what?" about the
          chart they sit next to, which is the question the chart raises. */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel
          title={`${prefs.unit === "assets" ? "Asset units" : "Tasks"} by month`}
          subtitle={`${report.period.label} against ${report.period.comparisonLabel}`}
          className="p-4"
          testId="dashboard-year-comparison"
        >
          <YearComparisonChart rows={monthly} currentLabel={report.period.label} comparisonLabel={report.period.comparisonLabel} unitWord={unitWord} />
        </Panel>

        {/* Three ranked splits, and only three: the column sets the height of
            the row, so every panel added here is height the chart beside it has
            to grow into. The two share-of-whole splits sit on their own line
            underneath for that reason. */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1" data-testid="dashboard-composition">
          <Panel title="By team" subtitle={unitWord} className="p-4" testId="dashboard-by-team">
            <RankedBars data={byTeam.slice(0, 5)} compact emptyMessage="No work in this period." />
          </Panel>
          <Panel title="By department" subtitle={unitWord} className="p-4" testId="dashboard-by-department">
            <RankedBars data={byDepartment.slice(0, 5)} compact emptyMessage="Nothing carries a department." />
          </Panel>
          <Panel title="Priority" subtitle="tasks" className="p-4" testId="dashboard-fourth-mix">
            <RankedBars data={priority.slice(0, 5)} compact emptyMessage="Nothing to split yet." />
          </Panel>
        </div>
      </div>

      {/* Where the work came from, and what it was made of. Asset types is
          twenty categories and cannot be a stacked bar — half of them become
          slivers, and a slice too thin to hover is a category nobody can ask
          about — so it takes the map and two thirds of the row. The column
          beside it sets the height and the map scales to whatever that comes
          to, rather than the row being as tall as a map wants to be. */}
      <div className="grid gap-3 xl:grid-cols-3" data-testid="dashboard-shares">
        {/* A grid, not a flex column: every Panel is `h-full` so that a panel
            given a column span fills it, and in a flex column that height wins
            against `flex-1` and the first panel eats the lot. Grid rows size
            the panels instead, and `h-full` then means the row it is in. */}
        <div className="grid min-h-0 grid-rows-[auto_1fr] gap-3">
          <DemandSection {...props} />
        </div>
        <Panel
          title="Asset types"
          subtitle={byEffort ? `${formatHours(effortTotal)} across ${mixEffort.length} rated types · area is effort` : `${formatCount(mixUnits)} units across ${mix.length} types · area is units`}
          className="p-4 xl:col-span-2"
          bodyClassName="flex min-h-0 flex-1 flex-col"
          action={ratesOn ? <MeasureToggle measure={assetMeasure} onChange={setAssetMeasure} /> : undefined}
          testId="dashboard-asset-mix"
        >
          <TreemapChart
            data={byEffort ? mixEffort : mix}
            totalLabel={byEffort ? "hours" : "units"}
            format={byEffort ? formatHours : formatCount}
            emptyMessage={byEffort ? "Nothing in this period has a rate to weigh it by." : "No deliverables in this period."}
            testId="dashboard-asset-treemap"
            className="min-h-0 flex-1"
          />
        </Panel>
      </div>

      <OperationsStrip
        asOf={ops.asOf}
        items={[
          { key: "overdue", label: "open and overdue", count: ops.overdue.length, tone: "urgent", hint: "Open, non-done work with a due date before today." },
          { key: "week", label: "due within 7 days", count: ops.dueThisWeek.length, hint: "Open work due in the next seven days." },
          { key: "unallocated", label: "awaiting allocation", count: ops.unallocated.length, hint: "Requests with no team and nobody assigned." },
          { key: "blocked", label: "blocked", count: ops.blocked.length, hint: "Work whose board says it is stuck." },
        ]}
      />

      {/* Who is carrying it. */}
      <WorkloadSection {...props} />

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <CoverageNote lines={coverageLines} />
        <p className="text-2xs text-muted-foreground">
          Completed output and delivery reliability are not shown: no task completion event is recorded.
          {prefs.teamIds && (
            <>
              {" "}
              <button type="button" onClick={() => set({ teamIds: null })} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
                Clear the {prefs.teamIds.length}-team filter
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Count or effort, for the asset mix.
 *
 * The same pill as the period and window controls elsewhere on the page, and
 * deliberately local to this panel: it changes what one map measures, not what
 * the page reports, so it does not belong in the toolbar with the controls that
 * do.
 */
function MeasureToggle({ measure, onChange }: { measure: "units" | "effort"; onChange: (measure: "units" | "effort") => void }) {
  return (
    <div role="radiogroup" aria-label="Measure the asset mix by" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
      {(["units", "effort"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={measure === option}
          onClick={() => onChange(option)}
          className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", measure === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          data-testid={`dashboard-asset-measure-${option}`}
        >
          {option === "units" ? "Asset units" : "Effort"}
        </button>
      ))}
    </div>
  );
}

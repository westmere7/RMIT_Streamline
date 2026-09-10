"use client";

import * as React from "react";
import { effortHours, formatHours, hasAnyRate, unratedTypes } from "@/domain";
import { assetMix, priorityMix, statusMix, teamHex, type TaskFact } from "@/features/dashboard/analytics";
import { RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { AttentionList, UpcomingList } from "@/features/dashboard/components/attention";
import { CoverageNote, HeadlineFigure, OperationsStrip } from "@/features/dashboard/components/figures";
import { ShareBar } from "@/features/dashboard/components/stat-visuals";
import { YearComparisonChart } from "@/features/dashboard/components/year-comparison";
import { departmentHex, UNKNOWN_DEPARTMENT } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

/**
 * The morning stand-up, and the number the team reports upwards.
 *
 * Read as a picture, not a page. The two figures that get reported are large
 * and carry their own twelve-month trend; the counts that are true *now* are
 * bars, so the shape of the morning is visible before any of them is read; the
 * composition of the work — status, team, department, asset type — is four
 * charts in one row rather than four tabs. Only the two lists at the bottom are
 * meant to be read, and they are the two that name individual tasks.
 *
 * Nothing on this page mixes the two kinds of time. Everything above the strip
 * is *reporting* and moves with the period control; everything from the strip
 * down is *now* and does not, because a manager reading last year's volume
 * still needs to know what is late today.
 */
export function OverviewView({ facts, report, monthly, monthlyTasks, monthlyAssets, monthlyEffort, rates, ops, attentionRows, upcomingTasks, gaps, prefs, set, onOpenTask, publicLink }: DashboardViewProps) {
  // A public payload carries no people, so every task looks unowned. The two
  // reasons that do not depend on an owner are still true and still useful; the
  // two that do are dropped rather than shown as a page of false positives.
  const rows = publicLink ? attentionRows.filter((row) => row.reason === "overdue" || row.reason === "blocked") : attentionRows;
  const open = (task: TaskFact) => onOpenTask?.(task.id, task.boardId);
  const unitWord = prefs.unit === "assets" ? "asset units" : "tasks";
  const basisLine = `${prefs.basis === "created" ? "Requested" : "Scheduled"} in ${report.period.label}${report.period.partial ? " · partial actuals" : ""}`;

  const scoped = report.current.tasks;
  const scopedAssets = report.current.assets;
  const status = React.useMemo(() => statusMix(scoped), [scoped]);
  const priority = React.useMemo(() => priorityMix(scoped), [scoped]);
  const mix = React.useMemo(() => assetMix(scopedAssets), [scopedAssets]);
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

  const doneTasks = scoped.filter((t) => t.isDone).length;
  const doneUnits = scopedAssets.reduce((sum, a) => sum + (a.done ? a.units : 0), 0);

  // Effort leads only when somebody has recorded a rate. With none, the figure
  // would be a confident nought against a thousand deliverables, so the row
  // goes back to the two counts and the Settings link says what is missing.
  const ratesOn = hasAnyRate(rates);
  const doneEffort = React.useMemo(() => effortHours(scopedAssets.filter((a) => a.done), rates), [scopedAssets, rates]);
  // Types carrying volume with no rate: exactly what the total leaves out.
  const unrated = React.useMemo(() => unratedTypes(scopedAssets, rates), [scopedAssets, rates]);

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
            ring={{ value: doneEffort, total: report.effort.current, label: "done" }}
            footnote={
              unrated.length > 0 ? (
                <>
                  No rate yet for {unrated.slice(0, 3).join(", ")}
                  {unrated.length > 3 ? ` and ${unrated.length - 3} more` : ""} — their deliverables count as nought hours.
                </>
              ) : undefined
            }
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
          ring={{ value: doneTasks, total: report.tasks.current, label: "done" }}
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
          ring={{ value: doneUnits, total: report.assetUnits.current, label: "done" }}
          testId="dashboard-headline-assets"
        />
      </div>

      <Panel
        title={`${prefs.unit === "assets" ? "Asset units" : "Tasks"} by month`}
        subtitle={`${report.period.label} against ${report.period.comparisonLabel}`}
        className="p-4"
        testId="dashboard-year-comparison"
      >
        <YearComparisonChart rows={monthly} currentLabel={report.period.label} comparisonLabel={report.period.comparisonLabel} unitWord={unitWord} />
      </Panel>

      <OperationsStrip
        asOf={ops.asOf}
        items={[
          { key: "overdue", label: "open and overdue", count: ops.overdue.length, tone: "urgent", hint: "Open, non-done work with a due date before today." },
          { key: "week", label: "due within 7 days", count: ops.dueThisWeek.length, hint: "Open work due in the next seven days." },
          ...(publicLink ? [] : [{ key: "unallocated", label: "awaiting allocation", count: ops.unallocated.length, hint: "Requests with no team and nobody assigned." }]),
          { key: "blocked", label: "blocked", count: ops.blocked.length, hint: "Work whose board says it is stuck." },
        ]}
      />

      {/* What the period is made of. Four questions a manager would otherwise
          have to change tab to ask, each answered by a shape. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Panel title="Status" subtitle={`${report.tasks.current} tasks`} className="p-4" testId="dashboard-status-mix">
          <ShareBar data={status} />
        </Panel>
        <Panel title="By team" subtitle={unitWord} className="p-4" testId="dashboard-by-team">
          <RankedBars data={byTeam.slice(0, 5)} compact emptyMessage="No work in this period." />
        </Panel>
        <Panel title="By department" subtitle={unitWord} className="p-4" testId="dashboard-by-department">
          <RankedBars data={byDepartment.slice(0, 5)} compact emptyMessage="Nothing carries a department." />
        </Panel>
        <Panel title={prefs.unit === "assets" ? "Asset types" : "Priority"} subtitle={prefs.unit === "assets" ? "units" : "tasks"} className="p-4" testId="dashboard-fourth-mix">
          <RankedBars data={(prefs.unit === "assets" ? mix : priority).slice(0, 5)} compact emptyMessage="Nothing to split yet." />
        </Panel>
      </div>

      {/* The only two things on this page meant to be read, because they name
          individual tasks somebody has to decide about. */}
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Attention needed" subtitle={publicLink ? "Overdue and blocked work" : "Ordered by reason, then by deadline"} className="p-4" testId="dashboard-attention-panel">
            <AttentionList rows={rows} users={facts.users} onOpen={onOpenTask ? open : undefined} limit={8} />
          </Panel>
        </div>
        <Panel title="Due in the next four weeks" subtitle="By due date — not campaign launches" className="p-4" testId="dashboard-upcoming-panel">
          <UpcomingList tasks={upcomingTasks} onOpen={onOpenTask ? open : undefined} limit={8} />
        </Panel>
      </div>

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

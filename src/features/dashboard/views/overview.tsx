"use client";

import * as React from "react";
import type { TaskFact } from "@/features/dashboard/analytics";
import { AttentionList, UpcomingList } from "@/features/dashboard/components/attention";
import { CoverageNote, HeadlineFigure, OperationsStrip } from "@/features/dashboard/components/figures";
import { YearComparisonChart } from "@/features/dashboard/components/year-comparison";
import { Panel } from "@/features/dashboard/panels";
import type { DashboardViewProps } from "./types";

/**
 * The morning stand-up, and the number the team reports upwards.
 *
 * Reading order, top to bottom: how much work there is and how that compares
 * with last year; the same thing month by month; what is true right now; and
 * then the list of things somebody has to decide about today. The two headline
 * figures and the operations strip are meant to fit on a 1440×900 screen
 * without scrolling past decoration, so the trend chart between them is
 * deliberately short.
 *
 * Nothing on this page mixes the two kinds of time. Everything above the strip
 * is *reporting* and moves with the period control; everything from the strip
 * down is *now* and does not, because a manager reading last year's volume
 * still needs to know what is late today.
 */
export function OverviewView({ facts, report, monthly, ops, attentionRows, upcomingTasks, gaps, prefs, set, onOpenTask, publicLink }: DashboardViewProps) {
  // A public payload carries no people, so every task looks unowned. The two
  // reasons that do not depend on an owner are still true and still useful; the
  // two that do are dropped rather than shown as a page of false positives.
  const rows = publicLink ? attentionRows.filter((row) => row.reason === "overdue" || row.reason === "blocked") : attentionRows;
  const open = (task: TaskFact) => onOpenTask?.(task.id, task.boardId);
  const unitWord = prefs.unit === "assets" ? "asset units" : "tasks";
  const basisLine = `${prefs.basis === "created" ? "Requested" : "Scheduled"} in ${report.period.label}${report.period.partial ? " · partial actuals" : ""}`;

  const coverageLines: string[] = [];
  if (prefs.basis === "due" && report.current.undatedTasks > 0) {
    coverageLines.push(`${report.current.undatedTasks} tasks have no due date and are not in this count`);
  }
  if (gaps.withoutDepartment > 0) coverageLines.push(`${gaps.withoutDepartment} of ${gaps.tasks} have no department`);
  if (gaps.withoutStatus > 0) coverageLines.push(`${gaps.withoutStatus} have no status`);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <HeadlineFigure
          label="Tasks"
          unitWord="tasks"
          comparison={report.tasks}
          periodLabel={report.period.label}
          comparisonLabel={report.period.comparisonLabel}
          basisLine={basisLine}
          testId="dashboard-headline-tasks"
        />
        <HeadlineFigure
          label="Asset units"
          unitWord="units"
          comparison={report.assetUnits}
          periodLabel={report.period.label}
          comparisonLabel={report.period.comparisonLabel}
          basisLine={basisLine}
          footnote="One task can carry many units and many types."
          testId="dashboard-headline-assets"
        />
      </div>

      <Panel
        title={`${prefs.unit === "assets" ? "Asset units" : "Tasks"} by month`}
        subtitle={`${report.period.label} against ${report.period.comparisonLabel}`}
        testId="dashboard-year-comparison"
      >
        <YearComparisonChart rows={monthly} currentLabel={report.period.label} comparisonLabel={report.period.comparisonLabel} unitWord={unitWord} />
        <CoverageNote lines={coverageLines} className="mt-2" />
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

      {/* Two thirds to the decisions, one third to what is coming. */}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel title="Attention needed" subtitle={publicLink ? "Overdue and blocked work" : "Ordered by reason, then by deadline"} testId="dashboard-attention-panel">
            <AttentionList rows={rows} users={facts.users} onOpen={onOpenTask ? open : undefined} />
          </Panel>
        </div>
        <Panel title="Due in the next four weeks" subtitle="By due date — not campaign launches" testId="dashboard-upcoming-panel">
          <UpcomingList tasks={upcomingTasks} onOpen={onOpenTask ? open : undefined} />
        </Panel>
      </div>

      <p className="text-2xs text-muted-foreground">
        Delivery reliability and completed output are not shown: this workspace records no task completion event, so a finished date would be the day somebody last edited the
        task. See the implementation note for what would have to be captured.
        {prefs.teamIds && (
          <>
            {" "}
            <button type="button" onClick={() => set({ teamIds: null })} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              Showing {prefs.teamIds.length} of {facts.teams.length} teams — clear
            </button>
          </>
        )}
      </p>
    </div>
  );
}

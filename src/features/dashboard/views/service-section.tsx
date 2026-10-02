"use client";

import * as React from "react";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { ChartEmpty } from "@/features/dashboard/charts/ranked-bars";
import { useDrill } from "@/features/dashboard/drill/drill";
import { formatDays, formatPercent } from "@/features/dashboard/flow";
import { Panel } from "@/features/dashboard/panels";
import { AGE_BANDS, aging, departmentService, type AgingRow, type DepartmentServiceRow } from "@/features/dashboard/service-levels";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

/** Each age band's colour: quiet while work is fresh, amber then red as it sits. */
const BAND_CLASSES = ["bg-slate-300 dark:bg-slate-600", "bg-slate-400 dark:bg-slate-500", "bg-amber-500", "bg-red-500"] as const;

/**
 * Where open work sits and who it is for: how long it has been in each status,
 * and how each requesting department is being served. Below the delivery
 * figures, which say how fast finished work moved; this is the work that has
 * not finished yet, and the people waiting on it.
 */
export function ServiceSection({ facts, report, prefs }: DashboardViewProps) {
  const drill = useDrill();
  // One moment for the whole section, so every age is counted to the same instant.
  const [now] = React.useState(Date.now);
  const rows = React.useMemo(() => aging(facts, prefs.teamIds, now), [facts, prefs.teamIds, now]);
  const departments = React.useMemo(() => departmentService(facts, report.period, prefs.teamIds, now), [facts, report.period, prefs.teamIds, now]);
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <AgingPanel rows={rows} open={drill} />
      <DepartmentsPanel rows={departments} periodLabel={report.period.label} open={drill} />
    </div>
  );
}

type Open = ReturnType<typeof useDrill>;

function AgingPanel({ rows, open }: { rows: AgingRow[]; open: Open }) {
  const total = rows.reduce((n, r) => n + r.total, 0);
  const stale = rows.reduce((n, r) => n + r.bands[3]!.length, 0);
  const widest = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Panel
      title="Aging work"
      subtitle="Open tasks by how long they have sat in their status"
      help="aging"
      action={
        total > 0 && (
          <span className="text-2xs text-muted-foreground tabular" data-testid="dashboard-aging-summary">
            {formatCount(total)} open · <span className={cn("font-medium", stale > 0 ? "text-destructive" : "text-foreground")}>{formatCount(stale)} two weeks or more</span>
          </span>
        )
      }
      className="p-4"
      testId="dashboard-aging"
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No open work." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground">
            {AGE_BANDS.map((band, i) => (
              <span key={band.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-sm", BAND_CLASSES[i])} />
                {band.label}
              </span>
            ))}
          </div>
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.label} data-testid="dashboard-aging-row" data-status={row.label}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{row.label}</span>
                  <span className="shrink-0 text-2xs text-muted-foreground tabular">
                    {formatCount(row.total)} · oldest {formatDays(row.oldest)}
                  </span>
                </div>
                {/* One bar a status, as long as its open work, split by age. */}
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-strong" style={{ width: `${Math.max(8, (row.total / widest) * 100)}%` }}>
                  {row.bands.map((tasks, i) =>
                    tasks.length === 0 ? null : (
                      <button
                        key={AGE_BANDS[i]!.key}
                        type="button"
                        disabled={!open}
                        onClick={() => open?.({ title: `${row.label} · ${AGE_BANDS[i]!.label}`, subtitle: "Open tasks, by time in their status", tasks })}
                        className={cn("h-full transition-opacity hover:opacity-80 disabled:cursor-default", BAND_CLASSES[i])}
                        style={{ width: `${(tasks.length / row.total) * 100}%` }}
                        aria-label={`${row.label}: ${tasks.length} ${AGE_BANDS[i]!.label.toLowerCase()}`}
                        title={`${tasks.length} · ${AGE_BANDS[i]!.label}`}
                      />
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

const dash = <span className="text-muted-foreground/60">—</span>;

function DepartmentsPanel({ rows, periodLabel, open }: { rows: DepartmentServiceRow[]; periodLabel: string; open: Open }) {
  // A count that opens the tasks behind it, where the page can list them.
  const count = (tasks: DepartmentServiceRow["open"], title: string, subtitle: string, testId?: string) =>
    tasks.length === 0 ? (
      dash
    ) : open ? (
      <button type="button" onClick={() => open({ title, subtitle, tasks })} className="tabular underline-offset-4 hover:underline" data-testid={testId}>
        {formatCount(tasks.length)}
      </button>
    ) : (
      <span className="tabular">{formatCount(tasks.length)}</span>
    );
  // Past these the reading is worth a look: slower than a fortnight, under 60% on time, over a quarter sent back, a week to be picked up.
  const warn = (bad: boolean) => cn("tabular", bad && "font-medium text-destructive");
  return (
    <Panel title="Departments" subtitle={`How each department is served · open now, finished in ${periodLabel}`} help="service" className="p-4" testId="dashboard-departments">
      {rows.length === 0 ? (
        <ChartEmpty message="No work names a department." />
      ) : (
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-border/60 text-left text-2xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Department</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Work in hand on the boards">Open</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Requests not yet placed on a board">Waiting</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Oldest open task, days since it was made">Oldest</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Median days to the first change of status">Picked up</th>
                <th className="px-2 py-1.5 text-right font-medium">Finished</th>
                <th className="px-2 py-1.5 text-right font-medium" title="Median days, made to done">Turnaround</th>
                <th className="px-2 py-1.5 text-right font-medium">On time</th>
                <th className="py-1.5 pl-2 text-right font-medium">Sent back</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border/40 last:border-0" data-testid="dashboard-department-row" data-department={row.name}>
                  <td className="max-w-48 py-2 pr-3">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
                      <span className="truncate">{row.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">{count(row.open, `${row.name} · open`, "Work in hand on the boards", "dashboard-department-open")}</td>
                  <td className="px-2 py-2 text-right">{count(row.waiting, `${row.name} · waiting`, "Requests not yet placed on a board")}</td>
                  <td className={cn("px-2 py-2 text-right", warn((row.oldestOpen ?? 0) >= 30))}>{row.oldestOpen === null ? dash : formatDays(row.oldestOpen)}</td>
                  <td className={cn("px-2 py-2 text-right", warn((row.firstMove ?? 0) >= 7))}>{row.firstMove === null ? dash : formatDays(row.firstMove)}</td>
                  <td className="px-2 py-2 text-right">{count(row.finished, `${row.name} · finished`, `Finished in ${periodLabel}`)}</td>
                  <td className={cn("px-2 py-2 text-right", warn((row.turnaround ?? 0) > 14))}>{row.turnaround === null ? dash : formatDays(row.turnaround)}</td>
                  <td className={cn("px-2 py-2 text-right", warn(row.onTime !== null && row.onTime < 60))}>{row.onTime === null ? dash : formatPercent(row.onTime)}</td>
                  <td className={cn("py-2 pl-2 text-right", warn((row.sentBack ?? 0) > 25))}>{row.sentBack === null ? dash : formatPercent(row.sentBack)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

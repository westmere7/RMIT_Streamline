"use client";

import * as React from "react";
import type { DashboardSnapshot } from "@/domain";
import { normaliseAssetRates } from "@/domain";
import { buildFacts } from "@/features/dashboard/analytics";
import { ScopeToolbar, UnitToggle } from "@/features/dashboard/dashboard-controls";
import { useToday } from "@/features/dashboard/hooks";
import {
  attention,
  coverage,
  monthlyComparison,
  operations,
  resolvePeriod,
  upcoming,
  volumeReport,
  BUSINESS_TIMEZONE,
  type ReportingPeriod,
} from "@/features/dashboard/metrics";
import { useDashboardPrefs } from "@/features/dashboard/prefs";
import { DashboardBody } from "@/features/dashboard/views/overview";
import type { DashboardViewProps } from "@/features/dashboard/views/types";
import { cn } from "@/lib/utils";

export interface DashboardScreenProps {
  snapshot: DashboardSnapshot;
  /** Who is reading, so preferences belong to them rather than to the browser. */
  viewerId: string;
  onOpenTask?: (taskId: string, boardId: string) => void;
  onOpenBoard?: (boardId: string) => void;
  /** Rendered at the right of the header: Share, full screen, theme. */
  toolbarExtras?: React.ReactNode;
  /** When the snapshot was read, and whether a newer read is in flight. */
  freshness?: React.ReactNode;
  className?: string;
}

/**
 * The workspace dashboard.
 *
 * Three views over one snapshot: Overview for the morning and the number
 * reported upwards, Demand & Delivery for the operations review, Resourcing for
 * the allocation meeting. Everything is derived here, once, and handed down —
 * so a headline on one tab and a table on another are the same computation
 * rather than two that ought to agree.
 *
 * The same component serves the signed-in page and the public link, and draws
 * the same panels for both — a report that leaves half of itself out behind a
 * link is read as the whole and is wrong. What differs is what is passed in: a
 * public visitor gets no task callbacks, so nothing on the page leads anywhere
 * they cannot go.
 */
export function DashboardScreen({ snapshot, viewerId, onOpenTask, onOpenBoard, toolbarExtras, freshness, className }: DashboardScreenProps) {
  const today = useToday();
  const facts = React.useMemo(() => buildFacts(snapshot), [snapshot]);
  const teamIds = React.useMemo(() => facts.teams.map((t) => t.id), [facts.teams]);
  const { prefs, set, reset } = useDashboardPrefs(viewerId, snapshot.workspace.id, teamIds);

  const currentYear = Number(today.slice(0, 4));
  const years = React.useMemo(() => {
    const all = new Set([currentYear, ...facts.years]);
    return [...all].sort((a, b) => b - a);
  }, [facts.years, currentYear]);
  const selectedYear = prefs.year ?? currentYear;

  const period = React.useMemo<ReportingPeriod>(
    () => ({
      mode: prefs.periodMode,
      year: selectedYear,
      quarter: prefs.quarter,
      month: prefs.month,
      from: prefs.from,
      to: prefs.to,
      comparisonYear: prefs.comparisonYear ?? selectedYear - 1,
    }),
    [prefs.periodMode, selectedYear, prefs.quarter, prefs.month, prefs.from, prefs.to, prefs.comparisonYear],
  );
  const resolved = React.useMemo(() => resolvePeriod(period, today), [period, today]);

  // Recorded in Settings and read straight off the workspace: the rates are
  // what turn deliverables into hours, and nothing is stored per task.
  const rates = React.useMemo(() => normaliseAssetRates(snapshot.workspace.assetRates), [snapshot.workspace.assetRates]);
  const report = React.useMemo(() => volumeReport(facts, resolved, prefs.basis, prefs.teamIds, rates), [facts, resolved, prefs.basis, prefs.teamIds, rates]);
  const monthly = React.useMemo(() => monthlyComparison(facts, resolved, prefs.basis, prefs.unit, prefs.teamIds), [facts, resolved, prefs.basis, prefs.unit, prefs.teamIds]);
  // Both measures, because each headline card draws its own trend and the unit
  // toggle must not change what the other card is showing.
  const monthlyTasks = React.useMemo(() => monthlyComparison(facts, resolved, prefs.basis, "tasks", prefs.teamIds), [facts, resolved, prefs.basis, prefs.teamIds]);
  const monthlyAssets = React.useMemo(() => monthlyComparison(facts, resolved, prefs.basis, "assets", prefs.teamIds), [facts, resolved, prefs.basis, prefs.teamIds]);
  const monthlyEffort = React.useMemo(() => monthlyComparison(facts, resolved, prefs.basis, "effort", prefs.teamIds, rates), [facts, resolved, prefs.basis, prefs.teamIds, rates]);
  // As of now, and deliberately not a function of the reporting period.
  const ops = React.useMemo(() => operations(facts, today, prefs.teamIds), [facts, today, prefs.teamIds]);
  const attentionRows = React.useMemo(() => attention(ops, today), [ops, today]);
  const upcomingTasks = React.useMemo(() => upcoming(facts, today, prefs.teamIds, 4), [facts, today, prefs.teamIds]);
  const scopedTasks = report.current.tasks;
  const gaps = React.useMemo(() => coverage(scopedTasks), [scopedTasks]);

  const shared: DashboardViewProps = { facts, report, monthly, monthlyTasks, monthlyAssets, monthlyEffort, rates, ops, attentionRows, upcomingTasks, gaps, prefs, set, today, onOpenTask, onOpenBoard };
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-testid="dashboard-screen">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6" data-testid="dashboard-header">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-[1.5rem]">Dashboard</h1>
          <p className="truncate text-xs text-muted-foreground">
            {snapshot.workspace.name} · Output so far, who is carrying it, and what needs attention today.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {freshness}
          {toolbarExtras}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5 sm:px-6">
        <ScopeToolbar
          prefs={prefs}
          set={set}
          reset={reset}
          period={resolved}
          teams={facts.teams}
          years={years}
          unitToggle={<UnitToggle unit={prefs.unit} onChange={(unit) => set({ unit })} />}
        />
        <p className="ml-auto hidden text-2xs text-muted-foreground lg:block">
          {resolved.alignment === "elapsed" ? "Matched to the same elapsed period" : "Whole periods"} · {BUSINESS_TIMEZONE}
        </p>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-surface/40">
        <div className="mx-auto w-full max-w-[1600px] p-3 sm:p-5">
          <DashboardBody {...shared} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle, ArrowUpRight, CheckCircle2, Clock, Info, Layers, ListChecks, Users } from "lucide-react";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { User } from "@/domain";
import type { BoardRow, DeliveredEntry, NamedCount, RequestsSummary, StackedRow, Summary, TeamDelivery, Unit } from "@/features/dashboard/analytics";
import { percentChange, STATUS_BUCKETS, teamHex } from "@/features/dashboard/analytics";
import { AnimatedNumber } from "@/features/dashboard/charts/animated-number";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { MixChart } from "@/features/dashboard/charts/mix-chart";
import { ChartEmpty, RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { MonthSparkline } from "@/features/dashboard/charts/sparkline";
import { StackedColumns } from "@/features/dashboard/charts/stacked-columns";
import { colorClasses } from "@/lib/colors";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Frame

/** The card every panel sits in: a title, a line under it, an optional control on the right. */
export function Panel({ title, subtitle, action, info, children, className, bodyClassName, testId }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; info?: string; children: React.ReactNode; className?: string; bodyClassName?: string; testId?: string }) {
  return (
    // h-full: a panel wrapped in a column-span div would otherwise stop at its content
    // and leave the canvas showing under it while its neighbour ran on.
    <section className={cn("flex h-full min-h-0 min-w-0 flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-xs sm:p-5", className)} data-testid={testId}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold tracking-tight">
            <span className="truncate">{title}</span>
            {info && (
              <SimpleTooltip label={info} side="top">
                <span className="text-muted-foreground/70 hover:text-foreground">
                  <Info className="size-3.5" />
                </span>
              </SimpleTooltip>
            )}
          </h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </header>
      <div className={cn("flex min-h-0 flex-1 flex-col", bodyClassName)}>{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Headline figures

function Delta({ current, previous, label }: { current: number; previous: number | null; label: string }) {
  if (previous === null) return null;
  const change = percentChange(current, previous);
  if (change === null) return <span className="text-2xs text-muted-foreground">nothing {label.replace(/^vs /, "in ")}</span>;
  const up = change > 0;
  const flat = Math.abs(change) < 0.05;
  return (
    <span className={cn("inline-flex items-center gap-1 text-2xs font-medium tabular", flat ? "text-muted-foreground" : up ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>
      {!flat && <ArrowUpRight className={cn("size-3", !up && "rotate-90")} />}
      {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(change) < 10 ? Math.abs(change).toFixed(1) : Math.round(Math.abs(change))}%`}
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  );
}

export function HeroCard({ label, value, hint, previous, deltaLabel, accent = "navy", testId }: { label: string; value: number; hint: React.ReactNode; previous: number | null; deltaLabel: string; accent?: "navy" | "red"; testId?: string }) {
  return (
    <section className="relative flex min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-xs [container-type:inline-size]" data-testid={testId}>
      <span aria-hidden className={cn("pointer-events-none absolute -top-16 -right-16 size-48 rounded-full blur-3xl", accent === "red" ? "bg-primary/15" : "bg-[#4b52d6]/15")} />
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex min-w-0 flex-1 flex-col justify-center py-2">
        <AnimatedNumber value={value} className={cn("font-semibold tracking-tight text-[clamp(2.75rem,22cqw,6rem)]", accent === "red" ? "text-primary" : "text-navy-800 dark:text-foreground")} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
        <Delta current={value} previous={previous} label={deltaLabel} />
      </div>
    </section>
  );
}

export function StatTile({ icon: Icon, label, value, hint, tone = "neutral", className }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode; hint?: string; tone?: "neutral" | "good" | "warn"; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-3 shadow-xs", className)}>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone === "good" ? "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300" : tone === "warn" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-surface text-muted-foreground")}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-[19px] font-semibold leading-tight tracking-tight tabular">{value}</p>
        {hint && <p className="truncate text-2xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export function StatTiles({ summary }: { summary: Summary }) {
  const donePct = summary.tasks > 0 ? Math.round((summary.doneTasks / summary.tasks) * 100) : 0;
  const assetPct = summary.assetUnits > 0 ? Math.round((summary.doneAssetUnits / summary.assetUnits) * 100) : 0;
  return (
    <div className="grid h-full auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="dashboard-tiles">
      <StatTile icon={CheckCircle2} label="Tasks done" value={`${donePct}%`} hint={`${formatCount(summary.doneTasks)} of ${formatCount(summary.tasks)}`} tone={donePct >= 60 ? "good" : "neutral"} />
      <StatTile icon={Layers} label="Assets done" value={`${assetPct}%`} hint={`${formatCount(summary.doneAssetUnits)} of ${formatCount(summary.assetUnits)} units`} tone={assetPct >= 60 ? "good" : "neutral"} />
      <StatTile icon={Clock} label="On time" value={summary.onTimeRate === null ? "—" : `${summary.onTimeRate}%`} hint="finished by their due date" tone={summary.onTimeRate !== null && summary.onTimeRate >= 75 ? "good" : "neutral"} />
      <StatTile icon={AlertTriangle} label="Overdue" value={formatCount(summary.overdue)} hint={summary.stuck > 0 ? `${formatCount(summary.stuck)} stuck` : "open past due"} tone={summary.overdue > 0 ? "warn" : "neutral"} />
      <StatTile icon={Users} label="People" value={formatCount(summary.people)} hint={`across ${formatCount(summary.teams)} ${summary.teams === 1 ? "team" : "teams"}`} />
      <StatTile icon={ListChecks} label="In progress" value={formatCount(summary.inProgress)} hint={`${formatCount(summary.boards)} ${summary.boards === 1 ? "board" : "boards"} active`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teams

export function TeamsPanel({ rows, unit, onSelect, action }: { rows: TeamDelivery[]; unit: Unit; onSelect?: (teamId: string) => void; action?: React.ReactNode }) {
  const data: NamedCount[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: teamHex(r),
    value: unit === "assets" ? r.assetUnits : r.tasks,
    secondary: unit === "assets" ? r.tasks : r.assetUnits,
    detail: `${formatCount(r.doneTasks)} of ${formatCount(r.tasks)} tasks done · ${formatCount(r.doneAssetUnits)} of ${formatCount(r.assetUnits)} asset units done${r.overdue ? ` · ${r.overdue} overdue` : ""}`,
  }));
  return (
    <Panel title="Delivery by team" subtitle={unit === "assets" ? "Asset units · tasks" : "Tasks · asset units"} info="What each team delivered in the current scope. Click a team to focus the whole dashboard on it." action={action} testId="dashboard-teams-panel">
      {/* Spread down the panel: it shares a column with the workload chart, so a short
          team list would otherwise sit in the top third with blank space under it. */}
      <RankedBars
        data={data}
        valueLabel={unit === "assets" ? "asset units" : "tasks"}
        secondaryLabel={unit === "assets" ? "tasks" : "asset units"}
        onSelect={onSelect ? (row) => onSelect(row.id!) : undefined}
        emptyMessage="No team has work in this scope."
        className="flex-1 justify-around"
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Requests

export function RequestsPanel({ requests, nowMonth, year, action }: { requests: RequestsSummary; nowMonth: number | null; year: number; action?: React.ReactNode }) {
  return (
    <Panel title="Stakeholder requests" subtitle="Bookings received" info="Tasks booked by stakeholders: everything on the Task Allocation board plus tasks whose board records who asked. Counted by the day they were booked." action={action} testId="dashboard-requests-panel">
      <div className="flex items-end justify-between gap-3">
        <div>
          <AnimatedNumber value={requests.total} className="text-[40px] font-semibold tracking-tight" />
          <p className="text-xs text-muted-foreground">
            {formatCount(requests.open)} open
            {requests.medianLeadDays !== null && <> · typically {requests.medianLeadDays} days notice</>}
          </p>
        </div>
        <div className="flex gap-3 text-right">
          {requests.byStage.map((s) => (
            <div key={s.id}>
              <p className="text-[17px] font-semibold tabular" style={{ color: s.color }}>
                {formatCount(s.value)}
              </p>
              <p className="text-2xs text-muted-foreground">{s.name}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <p className="label-quiet mb-1">Requests per month · {year}</p>
        <MonthSparkline values={requests.perMonth} nowMonth={nowMonth} color={colorClasses("indigo").hex} label="Requests per month" />
      </div>
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <p className="label-quiet mb-1.5">By school or department</p>
        <RankedBars data={requests.byDepartment.slice(0, 7)} valueLabel="requests" compact emptyMessage="No requests in this scope." className="flex-1 justify-around" />
      </div>
    </Panel>
  );
}

export function RequestDetailPanel({ requests }: { requests: RequestsSummary }) {
  return (
    <Panel title="Request breakdown" subtitle="Who asked which team for what" info="Requested team is what the stakeholder chose on the form, or the team whose board took the booking directly." testId="dashboard-request-detail">
      {/* Three lists of different lengths: they keep one rhythm and stay top-aligned so
          the eye can read across them. Spreading each to the card's height gave every
          column a different row pitch. */}
      <div className="grid min-h-0 flex-1 gap-5 sm:grid-cols-3">
        <div className="flex min-h-0 flex-col">
          <p className="label-quiet mb-1.5">Requested team</p>
          <RankedBars data={requests.byTeam} valueLabel="requests" compact emptyMessage="Nothing yet." />
        </div>
        <div className="flex min-h-0 flex-col">
          <p className="label-quiet mb-1.5">Urgency</p>
          <RankedBars data={requests.byUrgency} valueLabel="requests" compact emptyMessage="Nothing yet." />
        </div>
        <div className="flex min-h-0 flex-col">
          <p className="label-quiet mb-1.5">Asset type asked for</p>
          <RankedBars data={requests.byAssetType} valueLabel="requests" compact emptyMessage="Nothing yet." />
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Mixes and distributions

export function AssetMixPanel({ data, onSelect }: { data: NamedCount[]; onSelect?: (row: NamedCount) => void }) {
  return (
    <Panel title="Asset mix" subtitle="Units delivered by asset type" info="Every asset line's quantity, grouped by its type. A line without a quantity counts as one unit." testId="dashboard-asset-mix">
      <MixChart data={data} totalLabel="units" onSelect={onSelect} emptyMessage="No asset lines in this scope." />
    </Panel>
  );
}

export function StatusPanel({ rows }: { rows: StackedRow[] }) {
  return (
    <Panel title="Progress by team" subtitle="Tasks by status" info="Each team's tasks split by what their status means: done, in progress, stuck or still queued." testId="dashboard-status">
      <StackedColumns rows={rows} mode="count" legend={STATUS_BUCKETS.filter((b) => rows.some((r) => r.segments.some((s) => s.key === b.key))).map((b) => ({ key: b.key, label: b.label, color: b.color }))} emptyMessage="No tasks in this scope." />
    </Panel>
  );
}

export function DistributionPanel({ rows, onSelect }: { rows: StackedRow[]; onSelect?: (teamId: string) => void }) {
  return (
    <Panel title="Asset distribution" subtitle="Share of each asset type across teams" info="For every asset type, which teams produce it. Click a segment to focus on that team." testId="dashboard-distribution">
      <StackedColumns rows={rows} mode="share" onSelect={onSelect ? (_row, key) => onSelect(key) : undefined} emptyMessage="No asset lines in this scope." />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// People, boards, delivered

export function PeoplePanel({ data, users }: { data: NamedCount[]; users: Map<string, User> }) {
  return (
    <Panel title="People" subtitle="Tasks · asset units per person" info="Tasks count everyone assigned in a people column; asset units count the people in charge of each asset line." testId="dashboard-people">
      <RankedBars data={data} valueLabel="tasks" secondaryLabel="asset units" leading={(row) => <UserAvatar user={row.id ? users.get(row.id) : null} size="xs" tooltip={false} />} emptyMessage="Nobody is assigned in this scope." className="flex-1 justify-around" />
    </Panel>
  );
}

export function BoardsPanel({ rows, onOpen }: { rows: BoardRow[]; onOpen?: (boardId: string) => void }) {
  if (rows.length === 0) {
    return (
      <Panel title="Boards" subtitle="Tasks, assets and progress" testId="dashboard-boards">
        <ChartEmpty message="No boards have work in this scope." />
      </Panel>
    );
  }
  return (
    <Panel title="Boards" subtitle="Tasks · assets · done" info="Every board with work in scope, busiest first." testId="dashboard-boards" bodyClassName="overflow-hidden">
      {/* Rows share the panel's height evenly, so a short list fills the card and the
          dividers stay regular instead of bunching at the top. */}
      <ul className="-mx-1 flex flex-1 flex-col divide-y divide-border/60 text-xs">
        {rows.map((b) => {
          const pct = b.tasks > 0 ? Math.round((b.doneTasks / b.tasks) * 100) : 0;
          const Row = onOpen ? "button" : "div";
          return (
            <li key={b.id} className="flex min-h-[2.25rem] flex-1 flex-col justify-center">
              <Row type={onOpen ? "button" : undefined} onClick={onOpen ? () => onOpen(b.id) : undefined} className={cn("flex w-full items-center gap-2.5 px-1 py-1.5 text-left", onOpen && "rounded-md hover:bg-accent/70")}>
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", colorClasses(b.color).solid)}>
                  <DynamicIcon name={b.icon} className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{b.name}</span>
                  <span className="block truncate text-2xs text-muted-foreground">{b.team.name}</span>
                </span>
                <span className="w-10 text-right tabular">{formatCount(b.tasks)}</span>
                <span className="w-12 text-right text-muted-foreground tabular">{formatCount(b.assetUnits)}</span>
                <span className="flex w-20 items-center gap-1.5">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-strong">
                    <span className="block h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-right text-2xs text-muted-foreground tabular">{pct}%</span>
                </span>
                {b.overdue > 0 && (
                  <SimpleTooltip label={`${b.overdue} overdue`}>
                    <span className="text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3.5" />
                    </span>
                  </SimpleTooltip>
                )}
              </Row>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function DeliveredPanel({ entries, onOpen }: { entries: DeliveredEntry[]; onOpen?: (taskId: string, boardId: string) => void }) {
  return (
    <Panel title="Recently delivered" subtitle="Latest tasks finished" info="Tasks whose status means done, newest first, dated by the last asset ticked off or the last change." testId="dashboard-delivered">
      {entries.length === 0 ? (
        <ChartEmpty message="Nothing finished in this scope yet." />
      ) : (
        <ul className="-mx-1 flex flex-1 flex-col divide-y divide-border/60 text-xs">
          {entries.map(({ task, when }) => {
            const Row = onOpen ? "button" : "div";
            return (
              <li key={task.id} className="flex min-h-[2.25rem] flex-1 flex-col justify-center">
                <Row type={onOpen ? "button" : undefined} onClick={onOpen ? () => onOpen(task.id, task.boardId) : undefined} className={cn("flex w-full items-center gap-2.5 px-1 py-1.5 text-left", onOpen && "rounded-md hover:bg-accent/70")}>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: teamHex(task.team) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{task.name}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {task.team.name} · {task.boardName}
                      {task.assetUnits > 0 ? ` · ${formatCount(task.assetUnits)} ${task.assetUnits === 1 ? "unit" : "units"}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-2xs text-muted-foreground tabular">{formatShortDate(when)}</span>
                </Row>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

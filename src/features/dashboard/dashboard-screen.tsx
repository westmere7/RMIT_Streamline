"use client";

import { X } from "lucide-react";
import * as React from "react";
import type { DashboardSnapshot } from "@/domain";
import {
  acrossTheYear,
  assetMix,
  assetTypesByTeam,
  assetsInScope,
  boardsLeaderboard,
  buildFacts,
  deliveryByTeam,
  loadByPerson,
  previousScope,
  recentlyDelivered,
  requestsInScope,
  scopeLabel,
  statusByTeam,
  summarize,
  summarizeRequests,
  tasksInScope,
  type DashboardScope,
  type YearDot,
} from "@/features/dashboard/analytics";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { YearChart } from "@/features/dashboard/charts/year-chart";
import { DashboardSettings, SpanFilter, TeamFilter, UnitToggle } from "@/features/dashboard/dashboard-controls";
import { useToday } from "@/features/dashboard/hooks";
import { AssetMixPanel, BoardsPanel, DeliveredPanel, DistributionPanel, HeroCard, Panel, PeoplePanel, RequestDetailPanel, RequestsPanel, StatTiles, StatusPanel, TeamsPanel } from "@/features/dashboard/panels";
import { useDashboardPrefs, type PanelId } from "@/features/dashboard/prefs";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

export interface DashboardScreenProps {
  snapshot: DashboardSnapshot;
  /** Where clicking a task or board should go; absent on the public page, where nothing leads anywhere. */
  onOpenTask?: (taskId: string, boardId: string) => void;
  onOpenBoard?: (boardId: string) => void;
  /** Rendered at the right of the toolbar: Share, full screen, theme. */
  toolbarExtras?: React.ReactNode;
  className?: string;
}

/**
 * The dashboard itself: the scope controls and every panel, drawn from one
 * snapshot. Owns the scope (span, year, teams) and reads the browser's
 * preferences for unit, date basis and hidden panels. The same component serves
 * the signed-in page and the public link; only what is passed in differs.
 */
export function DashboardScreen({ snapshot, onOpenTask, onOpenBoard, toolbarExtras, className }: DashboardScreenProps) {
  const today = useToday();
  const unit = useDashboardPrefs((s) => s.unit);
  const basis = useDashboardPrefs((s) => s.basis);
  const span = useDashboardPrefs((s) => s.span);
  const setUnit = useDashboardPrefs((s) => s.setUnit);
  const setBasis = useDashboardPrefs((s) => s.setBasis);
  const setSpan = useDashboardPrefs((s) => s.setSpan);
  const hidden = useDashboardPrefs((s) => s.hiddenPanels);
  const show = (id: PanelId) => !hidden.includes(id);

  const facts = React.useMemo(() => buildFacts(snapshot), [snapshot]);
  const currentYear = Number(today.slice(0, 4));
  const years = React.useMemo(() => (facts.years.includes(currentYear) ? facts.years : [currentYear, ...facts.years].sort((a, b) => b - a)), [facts.years, currentYear]);
  const [year, setYear] = React.useState<number | null>(null);
  const [half, setHalf] = React.useState<1 | 2>(Number(today.slice(5, 7)) <= 6 ? 1 : 2);
  const [quarter, setQuarter] = React.useState<1 | 2 | 3 | 4>(Math.ceil(Number(today.slice(5, 7)) / 3) as 1 | 2 | 3 | 4);
  const [teamIds, setTeamIds] = React.useState<string[] | null>(null);
  const activeYear = year ?? (years.includes(currentYear) ? currentYear : (years[0] ?? currentYear));

  const scope = React.useMemo<DashboardScope>(() => ({ span, year: activeYear, half, quarter, teamIds, basis }), [span, activeYear, half, quarter, teamIds, basis]);
  const prev = React.useMemo(() => previousScope(scope), [scope]);

  const tasks = React.useMemo(() => tasksInScope(facts.tasks, scope), [facts, scope]);
  const assets = React.useMemo(() => assetsInScope(facts.assets, scope), [facts, scope]);
  const requests = React.useMemo(() => requestsInScope(facts.requests, scope), [facts, scope]);
  const summary = React.useMemo(() => summarize(tasks, assets, requests, today), [tasks, assets, requests, today]);
  const prevSummary = React.useMemo(() => (prev ? summarize(tasksInScope(facts.tasks, prev), assetsInScope(facts.assets, prev), requestsInScope(facts.requests, prev), today) : null), [facts, prev, today]);
  const allTime = React.useMemo(() => summarize(facts.tasks, facts.assets, facts.requests, today), [facts, today]);

  const teams = React.useMemo(() => deliveryByTeam(tasks, assets, facts.teams, today, unit), [tasks, assets, facts.teams, today, unit]);
  const mix = React.useMemo(() => assetMix(assets), [assets]);
  const distribution = React.useMemo(() => assetTypesByTeam(assets, facts.teams), [assets, facts.teams]);
  const status = React.useMemo(() => statusByTeam(tasks, facts.teams), [tasks, facts.teams]);
  const people = React.useMemo(() => loadByPerson(tasks, assets, facts.users), [tasks, assets, facts.users]);
  const boards = React.useMemo(() => boardsLeaderboard(tasks, assets, facts.boards, today), [tasks, assets, facts.boards, today]);
  const delivered = React.useMemo(() => recentlyDelivered(tasks), [tasks]);
  const requestSummary = React.useMemo(() => summarizeRequests(requests, activeYear, facts.teams), [requests, activeYear, facts.teams]);

  // The year chart always shows a whole year: the selected one, or the latest with data in Total mode.
  const chartYear = span === "total" ? (years[0] ?? currentYear) : activeYear;
  const yearData = React.useMemo(() => acrossTheYear(facts.tasks, facts.assets, chartYear, basis, unit, teamIds), [facts, chartYear, basis, unit, teamIds]);
  const nowMonth = chartYear === currentYear ? Number(today.slice(5, 7)) - 1 : null;
  const [hoverDot, setHoverDot] = React.useState<YearDot | null>(null);

  const focusTeam = (teamId: string) => setTeamIds((current) => (current?.length === 1 && current[0] === teamId ? null : [teamId]));
  const unitWord = unit === "assets" ? "asset units" : "tasks";
  const label = scopeLabel(scope);
  const focusedTeams = teamIds?.map((id) => facts.teams.find((t) => t.id === id)?.name ?? "").filter(Boolean) ?? [];
  const basisWord = basis === "completed" ? "completed" : basis === "created" ? "created" : "due";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} data-testid="dashboard-screen">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5 sm:px-6" data-testid="dashboard-toolbar">
        <TeamFilter teams={facts.teams} selected={teamIds} onChange={setTeamIds} />
        <SpanFilter span={span} year={activeYear} half={half} quarter={quarter} years={years} onSpan={setSpan} onYear={setYear} onHalf={setHalf} onQuarter={setQuarter} />
        <span className="hidden h-5 w-px bg-border/80 sm:block" aria-hidden />
        <UnitToggle unit={unit} onChange={setUnit} />
        <div className="ml-auto flex items-center gap-1.5">
          {toolbarExtras}
          <DashboardSettings basis={basis} onBasis={setBasis} />
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-surface/40">
        <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-3 p-3 sm:gap-4 sm:p-5">
          {(focusedTeams.length > 0 || basis !== "due") && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="dashboard-scope-note">
              {focusedTeams.length > 0 && (
                <button type="button" onClick={() => setTeamIds(null)} className="inline-flex items-center gap-1 rounded-full state-on px-2.5 py-1 font-medium">
                  {focusedTeams.join(", ")} <X className="size-3" />
                </button>
              )}
              {basis !== "due" && <span className="rounded-full bg-card px-2.5 py-1 shadow-xs">Counting work by {basisWord} date</span>}
            </div>
          )}

          {show("kpis") && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)] sm:gap-4" data-testid="dashboard-kpis">
              <HeroCard label="Assets delivered" value={summary.assetUnits} previous={prevSummary?.assetUnits ?? null} deltaLabel={prev ? `vs ${scopeLabel(prev)}` : ""} hint={span === "total" ? (facts.earliest ? `units since ${formatShortDate(facts.earliest)}` : "units recorded") : `units ${basisWord} in ${label}`} accent="navy" testId="dashboard-hero-assets" />
              <HeroCard label="Tasks" value={summary.tasks} previous={prevSummary?.tasks ?? null} deltaLabel={prev ? `vs ${scopeLabel(prev)}` : ""} hint={`across ${formatCount(summary.boards)} ${summary.boards === 1 ? "board" : "boards"} · ${formatCount(summary.requests)} booked by stakeholders`} accent="red" testId="dashboard-hero-tasks" />
              <StatTiles summary={summary} />
            </div>
          )}

          <div className="grid gap-3 sm:gap-4 xl:grid-cols-12">
            {show("year") && (
              <Panel
                title={`Workload across ${chartYear}`}
                subtitle={hoverDot ? `${hoverDot.name} · ${hoverDot.team.name} · ${formatCount(hoverDot.value)} ${unitWord} · ${formatShortDate(hoverDot.date)}` : `${unit === "assets" ? "Asset units" : "Tasks"} per month by ${basisWord} date · one dot per task${onOpenTask ? " · click a dot to open it" : ""}`}
                info="The red line is the monthly total; the dashed line is how much of it was done. Each dot is a task on its exact day, lifted by its asset count so a big job stands apart from a run of small ones."
                className={cn("min-h-[22rem] xl:col-span-8", !show("assetMix") && !show("status") && "xl:col-span-12")}
                testId="dashboard-year"
              >
                <YearChart months={yearData.months} dots={yearData.dots} nowMonth={nowMonth} unitLabel={unit === "assets" ? "Asset units" : "Tasks"} teams={facts.teams} onDotClick={onOpenTask ? (d) => onOpenTask(d.id, d.boardId) : undefined} onHoverDot={setHoverDot} />
              </Panel>
            )}
            {(show("assetMix") || show("status")) && (
              <div className={cn("grid gap-3 sm:gap-4 xl:col-span-4", !show("year") && "xl:col-span-12 xl:grid-cols-2")}>
                {show("assetMix") && <AssetMixPanel data={mix} />}
                {show("status") && <StatusPanel rows={status} />}
              </div>
            )}
          </div>

          {(show("teams") || show("requests") || show("distribution")) && (
            <div className="grid gap-3 sm:gap-4 xl:grid-cols-12">
              {show("teams") && <div className={cn("xl:col-span-4", !show("requests") && !show("distribution") && "xl:col-span-12")}><TeamsPanel rows={teams} unit={unit} onSelect={focusTeam} /></div>}
              {show("distribution") && <div className={cn("min-h-[20rem] xl:col-span-4", !show("teams") && !show("requests") && "xl:col-span-12", (!show("teams") || !show("requests")) && show("teams") !== show("requests") && "xl:col-span-8")}><DistributionPanel rows={distribution} onSelect={focusTeam} /></div>}
              {show("requests") && <div className={cn("xl:col-span-4", !show("teams") && !show("distribution") && "xl:col-span-12", (!show("teams") || !show("distribution")) && show("teams") !== show("distribution") && "xl:col-span-8")}><RequestsPanel requests={requestSummary} nowMonth={nowMonth} year={activeYear} /></div>}
            </div>
          )}

          {(show("requestDetail") || show("people")) && (
            <div className="grid gap-3 sm:gap-4 xl:grid-cols-12">
              {show("requestDetail") && <div className={cn("xl:col-span-8", !show("people") && "xl:col-span-12")}><RequestDetailPanel requests={requestSummary} /></div>}
              {show("people") && <div className={cn("xl:col-span-4", !show("requestDetail") && "xl:col-span-12")}><PeoplePanel data={people} users={facts.users} /></div>}
            </div>
          )}

          {(show("boards") || show("delivered")) && (
            <div className="grid gap-3 sm:gap-4 xl:grid-cols-12">
              {show("boards") && <div className={cn("xl:col-span-7", !show("delivered") && "xl:col-span-12")}><BoardsPanel rows={boards} onOpen={onOpenBoard} /></div>}
              {show("delivered") && <div className={cn("xl:col-span-5", !show("boards") && "xl:col-span-12")}><DeliveredPanel entries={delivered} onOpen={onOpenTask} /></div>}
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-2xl border border-border/60 bg-card px-5 py-3 text-xs text-muted-foreground shadow-xs" data-testid="dashboard-alltime">
            <span className="font-semibold uppercase tracking-wide text-foreground/80">Full range</span>
            <span>
              <strong className="text-foreground tabular">{formatCount(allTime.assetUnits)}</strong> asset units
            </span>
            <span>
              <strong className="text-foreground tabular">{formatCount(allTime.tasks)}</strong> tasks
            </span>
            <span>
              <strong className="text-foreground tabular">{formatCount(allTime.doneTasks)}</strong> done
            </span>
            <span>
              <strong className="text-foreground tabular">{formatCount(allTime.requests)}</strong> stakeholder requests
            </span>
            <span>
              <strong className="text-foreground tabular">{formatCount(allTime.people)}</strong> people · <strong className="text-foreground tabular">{formatCount(facts.teams.length)}</strong> teams · <strong className="text-foreground tabular">{formatCount(snapshot.boards.length)}</strong> boards
            </span>
            <span>{facts.earliest ? `since ${formatShortDate(facts.earliest)}` : ""}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

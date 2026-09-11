"use client";

import { Boxes, Check, ChevronDown, CircleHelp, Filter, ListChecks, RotateCcw, Timer, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { TeamRef } from "@/features/dashboard/analytics";
import { BASIS_HINTS, BASIS_LABELS, MEASURE_LABELS, MEASURES, REPORTING_BASES, type MeasureKind, type PeriodMode, type ReportingBasis, type ResolvedPeriod } from "@/features/dashboard/metrics";
import type { DashboardPrefs } from "@/features/dashboard/prefs";
import { cn } from "@/lib/utils";

const MODE_LABELS: Record<PeriodMode, string> = {
  ytd: "Year to date",
  year: "Full year",
  quarter: "Quarter",
  month: "Month",
  custom: "Custom range",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The reporting scope, in one row.
 *
 * Period and team are always visible because they change what every figure on
 * the page means; the rest — date basis, comparison year, custom dates — sit
 * behind one labelled control that counts what is active, so the toolbar stays
 * a line rather than a wall of selects.
 */
export function ScopeToolbar({
  prefs,
  set,
  reset,
  period,
  teams,
  years,
  unitToggle,
}: {
  prefs: DashboardPrefs;
  set: (patch: Partial<DashboardPrefs>) => void;
  reset: () => void;
  period: ResolvedPeriod;
  teams: TeamRef[];
  years: number[];
  unitToggle?: React.ReactNode;
}) {
  const selectedYear = prefs.year ?? Number(period.current.from.slice(0, 4));
  const comparisonYear = prefs.comparisonYear ?? selectedYear - 1;
  // What is not at its default, so the filter button can say how many.
  const extra = [prefs.basis !== "created", prefs.comparisonYear !== null, prefs.periodMode === "custom"].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-toolbar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="dashboard-period">
            {MODE_LABELS[prefs.periodMode]} · {period.label} <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Reporting period</DropdownMenuLabel>
          {(Object.keys(MODE_LABELS) as PeriodMode[]).map((mode) => (
            <DropdownMenuItem key={mode} onSelect={() => set({ periodMode: mode })}>
              <span className="flex-1">{MODE_LABELS[mode]}</span>
              {prefs.periodMode === mode && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Year</DropdownMenuLabel>
          {years.slice(0, 6).map((year) => (
            <DropdownMenuItem key={year} onSelect={() => set({ year })}>
              <span className="flex-1 tabular">{year}</span>
              {selectedYear === year && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
          {prefs.periodMode === "quarter" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Quarter</DropdownMenuLabel>
              {([1, 2, 3, 4] as const).map((q) => (
                <DropdownMenuItem key={q} onSelect={() => set({ quarter: q })}>
                  <span className="flex-1">Q{q}</span>
                  {prefs.quarter === q && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
          {prefs.periodMode === "month" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Month</DropdownMenuLabel>
              {MONTHS.map((name, index) => (
                <DropdownMenuItem key={name} onSelect={() => set({ month: index + 1 })}>
                  <span className="flex-1">{name}</span>
                  {prefs.month === index + 1 && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TeamFilter teams={teams} selected={prefs.teamIds} onChange={(teamIds) => set({ teamIds })} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={extra > 0 ? "secondary" : "outline"} size="sm" data-testid="dashboard-more-filters">
            <Filter /> Filters{extra > 0 ? ` · ${extra}` : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Count work by</DropdownMenuLabel>
          {REPORTING_BASES.map((basis) => (
            <DropdownMenuItem key={basis} onSelect={() => set({ basis: basis as ReportingBasis })} className="flex-col items-start gap-0.5">
              <span className="flex w-full items-center">
                <span className="flex-1 font-medium">{BASIS_LABELS[basis]}</span>
                {prefs.basis === basis && <Check className="size-3.5" />}
              </span>
              <span className="text-2xs text-muted-foreground">{BASIS_HINTS[basis]}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Compare with</DropdownMenuLabel>
          {years
            .filter((year) => year !== selectedYear)
            .slice(0, 6)
            .map((year) => (
              <DropdownMenuItem key={year} onSelect={() => set({ comparisonYear: year })}>
                <span className="flex-1 tabular">{year}</span>
                {comparisonYear === year && <Check className="size-3.5" />}
              </DropdownMenuItem>
            ))}
          {prefs.periodMode === "custom" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Range</DropdownMenuLabel>
              <div className="flex items-center gap-2 px-2 pb-2" onKeyDown={(e) => e.stopPropagation()}>
                <Input type="date" value={prefs.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} aria-label="From" className="h-8" />
                <Input type="date" value={prefs.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} aria-label="To" className="h-8" />
              </div>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={reset}>
            <RotateCcw className="size-3.5" /> Reset to defaults
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {unitToggle}
    </div>
  );
}

export function TeamFilter({ teams, selected, onChange }: { teams: TeamRef[]; selected: string[] | null; onChange: (ids: string[] | null) => void }) {
  const label = selected === null ? "All teams" : selected.length === 1 ? (teams.find((t) => t.id === selected[0])?.name ?? "1 team") : `${selected.length} teams`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="dashboard-team-filter">
          <Users /> {label} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          <span className="flex-1">All teams</span>
          {selected === null && <Check className="size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {teams.map((team) => (
          <DropdownMenuCheckboxItem
            key={team.id}
            checked={selected === null || selected.includes(team.id)}
            onCheckedChange={(checked) => {
              const base = selected ?? teams.map((t) => t.id);
              const next = checked ? [...new Set([...base, team.id])] : base.filter((id) => id !== team.id);
              onChange(next.length === 0 || next.length === teams.length ? null : next);
            }}
          >
            {team.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What the whole page is measured in.
 *
 * Effort leads because hours are what a manager plans with — three hundred
 * photo edits and ten films are not thirty times the work — and it is offered
 * only where a rate exists to weigh by; with none it would switch the page to
 * a confident nought. Every split follows this one control, which is what
 * replaced the switches that each chart used to carry.
 */
export function MeasureToggle({ measure, onChange, effortAvailable }: { measure: MeasureKind; onChange: (measure: MeasureKind) => void; effortAvailable: boolean }) {
  const offered = MEASURES.filter((value) => value !== "effort" || effortAvailable);
  return (
    <div className="inline-flex items-center gap-1">
      <div role="radiogroup" aria-label="Measure" className="inline-flex items-center rounded-full border border-border/70 p-0.5" data-testid="dashboard-measure">
        {offered.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={measure === value}
            onClick={() => onChange(value)}
            className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", measure === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            data-testid={`dashboard-measure-${value}`}
          >
            {MEASURE_LABELS[value]}
          </button>
        ))}
      </div>
      <MeasureHelp measure={measure} onChange={onChange} effortAvailable={effortAvailable} />
    </div>
  );
}

/** What each measure counts, what it is worth knowing for, and what it cannot see. */
const MEASURE_HELP: Array<{ measure: MeasureKind; icon: React.ComponentType<{ className?: string }>; line: string; counts: string; tells: string; blind: string }> = [
  {
    measure: "effort",
    icon: Timer,
    line: "How much work it is",
    counts: "Every deliverable weighed by its output rate — “8 photo edits a day”, “1 film a fortnight” — set in Settings → Lists.",
    tells: "The closest this page gets to how much work something is, and the only measure you can talk about capacity with.",
    blind: "A type with no rate counts as nought hours, so the total is a floor rather than the whole.",
  },
  {
    measure: "tasks",
    icon: ListChecks,
    line: "How many things are in the air",
    counts: "Rows on a board. One request that became three tasks counts three; a task mirrored onto two boards still counts once.",
    tells: "Juggling load — how many separate things a person or a team is holding at once.",
    blind: "A forty-page course guide and a tweet are both 1.",
  },
  {
    measure: "assets",
    icon: Boxes,
    line: "How much came out",
    counts: "Every deliverable line on those tasks, times its quantity: six posters is six.",
    tells: "Output volume — what actually left the studio, and how much of it.",
    blind: "Says nothing about how long any of it took.",
  },
];

/**
 * What the three measures mean, as a dialog rather than a popover.
 *
 * It is three explanations, not a tooltip, and in a popover it was a column of
 * grey paragraphs hanging off a toolbar. In the middle of the screen the three
 * can sit side by side as cards — one each, the current one lit, each a button
 * that switches the page — so the thing being explained can be tried on the
 * spot instead of read and remembered.
 */
function MeasureHelp({ measure, onChange, effortAvailable }: { measure: MeasureKind; onChange: (measure: MeasureKind) => void; effortAvailable: boolean }) {
  const [open, setOpen] = React.useState(false);
  const shown = MEASURE_HELP.filter((entry) => entry.measure !== "effort" || effortAvailable);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-7 rounded-full text-muted-foreground hover:text-foreground" aria-label="What these measures mean" data-testid="dashboard-measure-help">
          <CircleHelp />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl" data-testid="dashboard-measure-help-dialog">
        <DialogHeader>
          <DialogTitle>What the page is counting</DialogTitle>
          <DialogDescription>One choice for every chart below, so no two of them can disagree. Pick one here and the whole page follows.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          {shown.map((entry) => {
            const active = entry.measure === measure;
            return (
              <button
                key={entry.measure}
                type="button"
                onClick={() => {
                  onChange(entry.measure);
                  setOpen(false);
                }}
                aria-pressed={active}
                className={cn(
                  "flex flex-col rounded-2xl border p-4 text-left transition-colors",
                  active
                    ? "border-primary/40 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--color-primary)_10%,var(--color-card)),var(--color-card)_65%)]"
                    : "border-border/60 bg-card hover:border-border hover:bg-accent/40",
                )}
                data-testid={`dashboard-measure-help-${entry.measure}`}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", active ? "bg-primary/15 text-primary" : "bg-surface-strong/70 text-muted-foreground")}>
                    <entry.icon className="size-4" />
                  </span>
                  <span className="text-[15px] font-semibold tracking-tight">{MEASURE_LABELS[entry.measure]}</span>
                  {active && <span className="ml-auto text-2xs font-medium text-primary">Showing</span>}
                </span>
                <span className="mt-2 text-[13px] font-medium">{entry.line}</span>
                <span className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{entry.counts}</span>
                <span className="mt-2.5 border-t border-border/50 pt-2.5 text-2xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/80">Use it for </span>
                  {entry.tells}
                </span>
                <span className="mt-1.5 text-2xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground/70">Blind spot </span>
                  {entry.blind}
                </span>
              </button>
            );
          })}
        </div>

        {!effortAvailable && (
          <p className="rounded-xl border border-border/60 bg-surface/60 px-3.5 py-2.5 text-[13px] text-muted-foreground" data-testid="dashboard-measure-help-norates">
            Effort is not offered yet: no output rates are recorded, so hours would read as nought for everything. Settings → Lists → Asset types.
          </p>
        )}

        <p className="text-2xs leading-relaxed text-muted-foreground">
          Two panels cannot answer in all three, and say so where they sit: <span className="font-medium text-foreground/80">Who is carrying what</span> is always tasks, because its bands are states
          and a state is a count; <span className="font-medium text-foreground/80">Asset types</span> is always units, because one task holds several types and a count of tasks by type would not add
          up to the tasks there are.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Overview / Demand & Delivery / Resourcing, with real tab semantics. */
export function ViewTabs<T extends string>({ views, current, onChange, meta }: { views: readonly T[]; current: T; onChange: (view: T) => void; meta: Record<T, { label: string; hint: string }> }) {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (delta: number) => {
    const index = views.indexOf(current);
    const next = views[(index + delta + views.length) % views.length]!;
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Dashboard views" className="flex items-end gap-0.5" data-testid="dashboard-tabs">
      {views.map((view) => {
        const active = view === current;
        return (
          <button
            key={view}
            ref={(node) => {
              refs.current[view] = node;
            }}
            type="button"
            role="tab"
            id={`dashboard-tab-${view}`}
            aria-selected={active}
            aria-controls={`dashboard-panel-${view}`}
            tabIndex={active ? 0 : -1}
            title={meta[view].hint}
            onClick={() => onChange(view)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(1);
              if (event.key === "ArrowLeft") move(-1);
            }}
            className={cn(
              "relative -mb-px inline-flex h-9 items-center rounded-t-lg px-3 text-[13px] font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-[2.5px] after:rounded-full",
              active ? "text-foreground after:bg-ring" : "text-muted-foreground after:bg-transparent hover:text-foreground",
            )}
            data-testid={`dashboard-tab-${view}`}
          >
            {meta[view].label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * How current the figures are, and whether that is still true.
 *
 * The old indicator said "Live" with a green dot whatever had happened, so a
 * dashboard on a wall display whose refresh had been failing for an hour looked
 * exactly like one that was working. Four states, and only one of them is
 * green: reading, live, stale (a refresh failed but the last good snapshot is
 * still on screen), and failed with nothing to show.
 */
export function Freshness({ refreshing, failed, className }: { refreshing?: boolean; failed?: boolean; className?: string }) {
  const state = failed ? "stale" : refreshing ? "reading" : "live";
  return (
    <span
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-2xs font-medium shadow-xs", failed ? "border-amber-500/40 bg-amber-500/10" : "border-border/70 bg-card", className)}
      data-testid="dashboard-live"
      data-state={state}
      title={failed ? "The last refresh failed. These figures are the last good read." : refreshing ? "Reading the boards again." : "Up to date with the boards."}
    >
      <span aria-hidden className={cn("size-2 rounded-full", failed ? "bg-amber-500" : refreshing ? "bg-amber-400" : "bg-green-500")} />
      <span className="text-foreground">{failed ? "Not updating" : refreshing ? "Reading" : "Live"}</span>
    </span>
  );
}

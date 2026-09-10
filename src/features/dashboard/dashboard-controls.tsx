"use client";

import { Check, ChevronDown, Filter, RotateCcw, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { TeamRef, Unit } from "@/features/dashboard/analytics";
import { BASIS_HINTS, BASIS_LABELS, REPORTING_BASES, type PeriodMode, type ReportingBasis, type ResolvedPeriod } from "@/features/dashboard/metrics";
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

/** Tasks or asset units. Switches charts; never hides either headline. */
export function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (unit: Unit) => void }) {
  return (
    <div role="radiogroup" aria-label="Measure" className="inline-flex items-center rounded-full border border-border/70 p-0.5" data-testid="dashboard-unit">
      {(["tasks", "assets"] as const).map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={unit === value}
          onClick={() => onChange(value)}
          className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", unit === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          {value === "tasks" ? "Tasks" : "Asset units"}
        </button>
      ))}
    </div>
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

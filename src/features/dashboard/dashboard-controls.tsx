"use client";

import { Check, ChevronDown, Eye, EyeOff, Settings2, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Segmented } from "@/features/boards/components/views/view-shell";
import { DATE_BASES, DATE_BASIS_HINTS, DATE_BASIS_LABELS, type DateBasis, type SpanMode, type TeamRef, type Unit, teamHex } from "@/features/dashboard/analytics";
import { PANEL_IDS, PANEL_META, useDashboardPrefs, type PanelId } from "@/features/dashboard/prefs";
import { cn } from "@/lib/utils";

/** Total / Year / Half / Quarter, with the year and the half or quarter beside it. */
export function SpanFilter({
  span,
  year,
  half,
  quarter,
  years,
  onSpan,
  onYear,
  onHalf,
  onQuarter,
}: {
  span: SpanMode;
  year: number;
  half: 1 | 2;
  quarter: 1 | 2 | 3 | 4;
  years: number[];
  onSpan: (span: SpanMode) => void;
  onYear: (year: number) => void;
  onHalf: (half: 1 | 2) => void;
  onQuarter: (quarter: 1 | 2 | 3 | 4) => void;
}) {
  const options = years.includes(year) ? years : [year, ...years];
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="dashboard-span">
      <Segmented
        value={span}
        onChange={onSpan}
        ariaLabel="Time span"
        testId="dashboard-span-mode"
        options={[
          { value: "total", label: "Total" },
          { value: "year", label: "Year" },
          { value: "half", label: "Half" },
          { value: "quarter", label: "Quarter" },
        ]}
      />
      {span !== "total" && (
        <select
          value={year}
          onChange={(e) => onYear(Number(e.target.value))}
          aria-label="Year"
          data-testid="dashboard-year"
          className="h-8 rounded-full border border-border/70 bg-card px-2.5 pr-7 text-xs font-medium text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {options.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}
      {span === "half" && (
        <Segmented
          value={String(half) as "1" | "2"}
          onChange={(v) => onHalf(Number(v) as 1 | 2)}
          ariaLabel="Half"
          options={[
            { value: "1", label: "H1" },
            { value: "2", label: "H2" },
          ]}
        />
      )}
      {span === "quarter" && (
        <Segmented
          value={String(quarter) as "1" | "2" | "3" | "4"}
          onChange={(v) => onQuarter(Number(v) as 1 | 2 | 3 | 4)}
          ariaLabel="Quarter"
          options={[
            { value: "1", label: "Q1" },
            { value: "2", label: "Q2" },
            { value: "3", label: "Q3" },
            { value: "4", label: "Q4" },
          ]}
        />
      )}
    </div>
  );
}

/** Tasks ↔ Assets: what the shared panels count. */
export function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (unit: Unit) => void }) {
  return (
    <Segmented
      value={unit}
      onChange={onChange}
      ariaLabel="Unit"
      testId="dashboard-unit"
      options={[
        { value: "assets", label: "Assets" },
        { value: "tasks", label: "Tasks" },
      ]}
    />
  );
}

/** Which teams the dashboard counts. Empty selection means all of them. */
export function TeamFilter({ teams, selected, onChange }: { teams: TeamRef[]; selected: string[] | null; onChange: (ids: string[] | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const label = selected === null ? "All teams" : selected.length === 1 ? (teams.find((t) => t.id === selected[0])?.name ?? "1 team") : `${selected.length} teams`;
  const toggle = (id: string) => {
    const current = new Set(selected ?? teams.map((t) => t.id));
    if (current.has(id)) current.delete(id);
    else current.add(id);
    if (current.size === 0 || current.size === teams.length) onChange(null);
    else onChange(teams.filter((t) => current.has(t.id)).map((t) => t.id));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 rounded-full text-xs", selected !== null && "state-on border-transparent")} data-testid="dashboard-teams">
          <Users className="size-3.5" />
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5" align="start">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn("flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent", selected === null && "font-semibold")}
        >
          <span className="flex size-4 items-center justify-center">{selected === null && <Check className="size-3.5" />}</span>
          All teams
        </button>
        <div className="my-1 border-t border-border/70" />
        <ul className="max-h-72 overflow-y-auto">
          {teams.map((team) => {
            const on = selected === null || selected.includes(team.id);
            return (
              <li key={team.id}>
                <button type="button" onClick={() => toggle(team.id)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent" aria-pressed={on}>
                  <span className="flex size-4 items-center justify-center">{on && <Check className="size-3.5" />}</span>
                  <span className="size-2.5 rounded-full" style={{ background: teamHex(team) }} />
                  <span className="flex-1 truncate text-left">{team.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Date basis and which panels are shown. */
export function DashboardSettings({ basis, onBasis }: { basis: DateBasis; onBasis: (basis: DateBasis) => void }) {
  const hidden = useDashboardPrefs((s) => s.hiddenPanels);
  const togglePanel = useDashboardPrefs((s) => s.togglePanel);
  const showAll = useDashboardPrefs((s) => s.showAllPanels);
  return (
    <Popover>
      <SimpleTooltip label="Dashboard settings" side="bottom">
        <PopoverTrigger asChild>
          <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Dashboard settings" data-testid="dashboard-settings">
            <Settings2 />
          </Button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="label-quiet mb-1.5">Count work by</p>
        <div role="radiogroup" aria-label="Date basis" className="space-y-0.5">
          {DATE_BASES.map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={basis === b}
              onClick={() => onBasis(b)}
              className={cn("flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent", basis === b && "bg-accent-soft/60")}
            >
              <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">{basis === b && <Check className="size-3.5" />}</span>
              <span>
                <span className="block text-[13px] font-medium">{DATE_BASIS_LABELS[b]}</span>
                <span className="block text-2xs text-muted-foreground">{DATE_BASIS_HINTS[b]}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="my-2.5 border-t border-border/70" />
        <div className="mb-1.5 flex items-center justify-between">
          <p className="label-quiet">Panels</p>
          {hidden.length > 0 && (
            <button type="button" onClick={showAll} className="text-2xs font-medium text-muted-foreground hover:text-foreground">
              Show all
            </button>
          )}
        </div>
        <ul className="space-y-0.5">
          {PANEL_IDS.map((id: PanelId) => {
            const on = !hidden.includes(id);
            return (
              <li key={id}>
                <button type="button" onClick={() => togglePanel(id)} aria-pressed={on} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent" title={PANEL_META[id].hint}>
                  {on ? <Eye className="size-3.5 text-foreground" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
                  <span className={cn("flex-1 truncate text-left", !on && "text-muted-foreground")}>{PANEL_META[id].title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** A pulsing dot and the time of the last refresh: the dashboard is live. */
export function LivePill({ ago, refreshing, className }: { ago: string; refreshing?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 text-2xs font-medium text-muted-foreground shadow-xs", className)} data-testid="dashboard-live">
      <span className="relative flex size-2">
        <span className={cn("absolute inset-0 rounded-full", refreshing ? "bg-amber-400" : "bg-green-500", "dashboard-live")} />
      </span>
      <span className="text-foreground">Live</span>
      {ago && <span>· {ago}</span>}
    </span>
  );
}

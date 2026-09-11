"use client";

import { Building2, Check, ChevronDown, Search } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { User } from "@/domain";
import { ChartTooltip, formatCount, useSize } from "@/features/dashboard/charts/chart-utils";
import { assignedWorkload, departmentHex, workloadDepartments, workloadForDepartment, type DepartmentLoadOption, type WorkloadRow } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

const WINDOWS = [2, 4, 8] as const;

/** What each band of a person's bar means, and the colour it wears. */
const BANDS = [
  { key: "inProgress", label: "In progress", className: "bg-amber-500" },
  { key: "scheduled", label: "Scheduled", className: "bg-sky-500" },
  { key: "overdue", label: "Overdue", className: "bg-destructive" },
  { key: "undated", label: "No date", className: "bg-slate-400 dark:bg-slate-500" },
] as const;

/**
 * Who is carrying what, as a bar each rather than a row of seven numbers.
 *
 * This was a tab of its own and a table of counts: readable, and nobody read
 * it. One bar per person, split into what is in progress, scheduled, overdue
 * and undated, answers the question the table made you compute — who is
 * carrying the most, and how much of it is already late. The counts are still
 * exact, one click away.
 *
 * It is assignment, not capacity, and the note below says so. Capacity needs
 * contracted hours, leave, non-project commitments and an effort estimate per
 * task; three of those four this workspace does not record, so a percentage
 * would be a number about nothing. The output rates now give the fourth, which
 * is why effort in hours leads the page — but hours of work is not hours
 * available, and the difference is the whole point.
 */
export function WorkloadSection({ facts, prefs, set, today }: DashboardViewProps) {
  const [query, setQuery] = React.useState("");
  // Which row the cursor is over, and where it is inside the list.
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [at, setAt] = React.useState<{ x: number; y: number } | null>(null);
  const [listRef, listBox] = useSize<HTMLDivElement>();
  const all = React.useMemo(() => assignedWorkload(facts, today, prefs.teamIds, prefs.weeks), [facts, today, prefs.teamIds, prefs.weeks]);
  const groups = React.useMemo(() => workloadDepartments(all), [all]);
  // A group that has dropped out of the window — the weeks changed, the work
  // was finished — reads as "every group" rather than as an empty panel.
  const group = groups.find((g) => g.key === prefs.stakeholderGroup) ?? null;
  const rows = React.useMemo(() => (group ? workloadForDepartment(all, group.key) : all), [all, group]);
  const filtered = query.trim() ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : rows;
  const totals = rows.reduce((acc, r) => ({ tasks: acc.tasks + r.tasks, units: acc.units + r.assetUnits }), { tasks: 0, units: 0 });
  const unowned = rows.find((r) => r.userId === null);

  // One group chosen already answers "per group", so the grid is only worth a
  // column — and a second table of one column beside it would be a waste.
  const showMatrix = !group && groups.length > 1;
  const users = facts.users;
  // Work nobody has picked up is not a person and gets no row of its own on
  // any of this: it is a line in the note under the bars, where it reads as
  // the exception it is rather than as somebody's workload.
  const people = filtered.filter((row) => row.userId !== null);
  // Every bar against the busiest person, so the lengths mean something.
  const tablePeak = Math.max(1, ...people.map((row) => row.tasks));
  const hoveredRow = hovered === null ? null : (people.find((row) => row.userId === hovered) ?? null);

  return (
    <>
    <Panel
      title="Who is carrying what"
      subtitle={
        group
          ? `Work for ${group.name} · due in the next ${prefs.weeks} weeks, plus everything overdue or undated`
          : `Open work due in the next ${prefs.weeks} weeks, plus everything overdue or undated`
      }
      className="p-4"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <StakeholderFilter groups={groups} selected={group?.key ?? null} onChange={(stakeholderGroup) => set({ stakeholderGroup })} />
          <div role="radiogroup" aria-label="How far ahead" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
            {WINDOWS.map((weeks) => (
              <button
                key={weeks}
                type="button"
                role="radio"
                aria-checked={prefs.weeks === weeks}
                onClick={() => set({ weeks })}
                className={cn(
                  "h-7 rounded-full px-2.5 text-2xs font-medium transition-colors",
                  prefs.weeks === weeks ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`dashboard-weeks-${weeks}`}
              >
                {weeks}w
              </button>
            ))}
          </div>
          <label className="relative flex items-center">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
            <span className="sr-only">Find a person</span>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a person" className="h-8 w-40 pl-7 text-xs" data-testid="dashboard-people-search" />
          </label>
        </div>
      }
      testId="dashboard-workload"
    >
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground" aria-hidden>
        {BANDS.map((band) => (
          <li key={band.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-sm", band.className)} />
            {band.label}
          </li>
        ))}
      </ul>

      <div
        ref={listRef}
        className="relative mt-2.5 flex flex-col gap-px"
        role="list"
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setAt({ x: event.clientX - box.left, y: event.clientY - box.top });
        }}
        onMouseLeave={() => {
          setHovered(null);
          setAt(null);
        }}
      >
        {people.map((row) => {
          const user = row.userId ? facts.users.get(row.userId) : undefined;
          const share = row.tasks / tablePeak;
          const late = row.tasks > 0 ? row.overdue / row.tasks : 0;
          return (
            <div
              key={row.userId ?? "unassigned"}
              role="listitem"
              className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-accent/50"
              onMouseEnter={() => setHovered(row.userId)}
              data-testid="dashboard-workload-row"
              data-active={hovered === row.userId || undefined}
            >
              {/* Room for a full name over the teams it comes from: at ten rem
                  every second person was "Nguyen Anh D…" over "Publication,
                  Events, Dig…", which is two truncations and no information. */}
              <span className="flex w-[15rem] shrink-0 items-center gap-2.5">
                {user ? <UserAvatar user={user as User} size="sm" /> : <span aria-hidden className="size-6 shrink-0 rounded-full border border-dashed border-border" />}
                <span className="min-w-0">
                  <span className="block truncate font-medium" title={row.name}>
                    {row.name}
                  </span>
                  {(row.teamNames.length > 0 || row.former) && (
                    <span className="block truncate text-2xs text-muted-foreground" title={row.teamNames.join(", ")}>
                      {row.former ? "No longer a member · " : ""}
                      {row.teamNames.join(", ")}
                    </span>
                  )}
                </span>
              </span>

              {/* A track the full width of the row, with the load inside it:
                  every bar then starts and ends on the same two lines, so the
                  column can be read down as a shape. The fill is this person's
                  share of the busiest load, split by the state the work is in. */}
              <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/40 ring-1 ring-border/40 ring-inset">
                <span className="absolute inset-y-0 left-0 flex overflow-hidden rounded-full transition-[width] duration-500" style={{ width: `${Math.max(row.tasks > 0 ? 2 : 0, share * 100)}%` }}>
                  {BANDS.map((band) => {
                    const value = row[band.key];
                    if (value <= 0) return null;
                    return (
                      <span
                        key={band.key}
                        className={cn("h-full", band.className)}
                        style={{ width: `${(value / Math.max(1, row.tasks)) * 100}%` }}
                        title={`${band.label}: ${formatCount(value)}`}
                      />
                    );
                  })}
                </span>
              </span>

              <span className="flex w-[8.5rem] shrink-0 items-center justify-end gap-2 whitespace-nowrap tabular">
                <span className="text-[13px] font-semibold">{formatCount(row.tasks)}</span>
                <span className="text-2xs text-muted-foreground">tasks</span>
                {/* The one figure on this panel that is bad news, so it is the
                    one thing wearing a colour of its own. */}
                {row.overdue > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-2xs font-semibold",
                      late >= 0.5 ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                    )}
                    title={`${formatCount(row.overdue)} of ${formatCount(row.tasks)} already past their due date`}
                  >
                    {formatCount(row.overdue)} late
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {people.length === 0 && (
          <p className="py-4 text-center text-muted-foreground">
            {query.trim() ? <>Nobody matches “{query}”.</> : <>Nobody is carrying work for {group?.name ?? "this group"} in this window.</>}
          </p>
        )}

        {/* What the bar is made of, at the cursor. A row shows a shape, a
            total and what is late; the four states behind the shape and the
            groups the work is for are what a reader asks next, and they do not
            fit on the row. Same readout as the treemap's, for the same reason. */}
        {at && hoveredRow && (
          <ChartTooltip x={at.x} y={at.y} width={listBox.width || 0} height={listBox.height || 0}>
            <p className="font-medium text-foreground">{hoveredRow.name}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5 tabular">
              <span className="text-sm font-semibold">{formatCount(hoveredRow.tasks)}</span>
              <span className="text-2xs text-muted-foreground">tasks · {formatCount(hoveredRow.assetUnits)} asset units</span>
            </p>
            <ul className="mt-1.5 space-y-0.5 border-t border-border/50 pt-1.5">
              {BANDS.filter((band) => hoveredRow[band.key] > 0).map((band) => (
                <li key={band.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn("size-1.5 shrink-0 rounded-sm", band.className)} />
                  <span className="flex-1 text-muted-foreground">{band.label}</span>
                  <span className="font-medium tabular">{formatCount(hoveredRow[band.key])}</span>
                </li>
              ))}
            </ul>
            {hoveredRow.byDepartment.length > 0 && (
              <p className="mt-1.5 border-t border-border/50 pt-1.5 text-2xs leading-relaxed text-muted-foreground">
                <span className="text-foreground/80">For </span>
                {hoveredRow.byDepartment
                  .slice(0, 3)
                  .map((cell) => `${cell.name} ${formatCount(cell.tasks)}`)
                  .join(" · ")}
                {hoveredRow.byDepartment.length > 3 ? ` · and ${hoveredRow.byDepartment.length - 3} more` : ""}
              </p>
            )}
            {hoveredRow.teamNames.length > 0 && <p className="mt-1 text-2xs text-muted-foreground/80">{hoveredRow.teamNames.join(", ")}</p>}
          </ChartTooltip>
        )}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5 text-2xs leading-relaxed text-muted-foreground">
        <p>
          These are <strong className="font-medium text-foreground/80">association counts</strong>: a task with two owners is counted under both, so the bars add up to{" "}
          {formatCount(totals.tasks)} against fewer real tasks. Splitting it would invent an allocation nobody recorded.
        </p>
        {unowned && unowned.tasks > 0 && (
          <p>
            <strong className="font-medium text-foreground/80">{formatCount(unowned.tasks)}</strong> tasks in this window have no owner at all.
          </p>
        )}
        {group && (
          <p>
            Showing {group.name} only.{" "}
            <button type="button" onClick={() => set({ stakeholderGroup: null })} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
              Show every stakeholder group
            </button>
          </p>
        )}
      </div>
    </Panel>

    {/* The exact figures, in cards of their own rather than two disclosures at
        the foot of the bars, and stacked rather than side by side: two dense
        tables on one line is a wall, and each of these is wide enough to want
        the whole width to itself. */}
    <div className="grid gap-3">
      <Panel title="Per-person figures" subtitle={group ? `${group.name} · exact counts` : "Exact counts behind the bars"} className="p-4" testId="dashboard-workload-figures">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-[10px] tracking-wide text-muted-foreground uppercase">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Person
                </th>
                {BANDS.map((band) => (
                  <th key={band.key} scope="col" className="py-2 pr-3 text-right font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className={cn("size-1.5 rounded-sm", band.className)} />
                      {band.label}
                    </span>
                  </th>
                ))}
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Tasks
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Asset units
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((row) => {
                const user = row.userId ? users.get(row.userId) : undefined;
                return (
                  <tr
                    key={row.userId ?? "unassigned"}
                    className={cn(
                      "border-b border-border/40 transition-colors last:border-0 hover:bg-accent/60",
                      row.userId === null ? "bg-surface/60" : "odd:bg-surface/25",
                    )}
                  >
                    <th scope="row" className="py-1.5 pr-3 font-normal">
                      <span className="flex items-center gap-2">
                        {user ? (
                          <UserAvatar user={user as User} size="xs" />
                        ) : (
                          <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-border" />
                        )}
                        <span className="max-w-[12rem] truncate" title={row.name}>
                          {row.name}
                        </span>
                      </span>
                    </th>
                    {BANDS.map((band) => (
                      <Cell key={band.key} value={row[band.key]} tone={band.key === "overdue" ? "urgent" : undefined} />
                    ))}
                    {/* The busiest person's row fills; everyone else's is a
                        share of it, so the column can be read down as well as
                        across without leaving the table for the bars above. */}
                    <Cell value={row.tasks} strong share={row.tasks / tablePeak} />
                    <Cell value={row.assetUnits} strong last />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {showMatrix && <DepartmentMatrix rows={people} groups={groups} users={facts.users} />}
    </div>
    </>
  );
}

/**
 * Which stakeholder group the per-person figures are about.
 *
 * One group at a time, not a multi-select: the question it answers is "how much
 * is this person doing for Communications", and a set of four groups answers a
 * different one that the matrix below already covers. Only groups with work in
 * the window are offered, so the filter can never empty the panel by itself.
 */
function StakeholderFilter({ groups, selected, onChange }: { groups: DepartmentLoadOption[]; selected: string | null; onChange: (key: string | null) => void }) {
  const current = groups.find((g) => g.key === selected);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={current ? "secondary" : "outline"} size="sm" className="h-8" disabled={groups.length === 0} data-testid="dashboard-stakeholder-filter">
          <Building2 /> {current ? current.name : "All stakeholder groups"} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>Stakeholder group</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(null)} data-testid="dashboard-stakeholder-all">
          <span className="flex-1">All stakeholder groups</span>
          {selected === null && <Check className="size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {groups.map((option) => (
          <DropdownMenuItem key={option.key} onSelect={() => onChange(option.key)} data-testid={`dashboard-stakeholder-${option.key}`}>
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
            <span className="shrink-0 text-2xs text-muted-foreground tabular">{formatCount(option.tasks)}</span>
            {selected === option.key && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What one group's column needs to hold a dotted heading and a figure. */
const MATRIX_COLUMN_PX = 92;
/** The name column, and the row total at the end. */
const MATRIX_PERSON_PX = 176;
const MATRIX_TOTAL_PX = 64;
/** Before the panel has been measured: enough to be useful, narrow enough to fit. */
const MATRIX_COLUMNS_FALLBACK = 8;

/**
 * Every person against every stakeholder group, in one grid.
 *
 * The filter above answers "how much is A doing for Communications" one group
 * at a time; this answers "and who else is" without clicking through the list.
 * It is the same projection the filter uses, read across instead of down, so
 * a row's total is that person's total and nothing here is counted twice.
 */
function DepartmentMatrix({ rows, groups, users }: { rows: WorkloadRow[]; groups: DepartmentLoadOption[]; users: Map<string, User> }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  // As many groups as the panel can hold rather than a fixed eight: on a wide
  // screen the rest were folded into "4 more" with room to spare beside them.
  // One slot is given back when there is a remainder to fold, so the "more"
  // column is not what pushes the grid over the edge.
  const room = width > 0 ? Math.floor((width - MATRIX_PERSON_PX - MATRIX_TOTAL_PX) / MATRIX_COLUMN_PX) : MATRIX_COLUMNS_FALLBACK;
  const fit = Math.max(3, room);
  const shown = fit >= groups.length ? groups.length : Math.max(1, fit - 1);
  const columns = groups.slice(0, shown);
  const rest = groups.slice(shown);
  const restKeys = new Set(rest.map((g) => g.key));
  const people = rows.filter((row) => row.tasks > 0);
  if (people.length === 0) return null;
  // The busiest cell in the grid, so the tints are comparable across it.
  const hottest = Math.max(1, ...people.flatMap((row) => row.byDepartment.map((cell) => cell.tasks)));

  return (
    <Panel title="Per person, per stakeholder group" subtitle={`Tasks each person holds for each of ${groups.length} groups`} className="p-4" testId="dashboard-workload-matrix">
      <div ref={ref} className="scrollbar-thin overflow-x-auto">
        {/* Fixed layout with the two ends sized: the group columns then divide
            what is left equally, instead of each one sizing itself to its own
            longest heading — which is what left "Marketing VN" three times the
            width of "Web". */}
        <table className="w-full min-w-[34rem] table-fixed text-left text-xs">
          <colgroup>
            <col style={{ width: MATRIX_PERSON_PX }} />
            {columns.map((group) => (
              <col key={group.key} />
            ))}
            {rest.length > 0 && <col />}
            <col style={{ width: MATRIX_TOTAL_PX }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border/60 text-[10px] tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="py-2 pr-3 font-medium">
                Person
              </th>
              {columns.map((group) => (
                <th key={group.key} scope="col" className="py-2 pr-3 font-medium" title={`${group.name} · ${formatCount(group.tasks)} tasks`}>
                  <span className="flex items-center justify-end gap-1.5">
                    <span aria-hidden className="size-1.5 shrink-0 rounded-sm" style={{ background: departmentHex(group.name) }} />
                    <span className="truncate">{group.name}</span>
                  </span>
                </th>
              ))}
              {rest.length > 0 && (
                <th scope="col" className="py-2 pr-3 text-right font-medium" title={rest.map((g) => g.name).join(", ")}>
                  {rest.length} more
                </th>
              )}
              <th scope="col" className="py-2 text-right font-medium">
                Tasks
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((row) => {
              const byKey = new Map(row.byDepartment.map((cell) => [cell.key, cell.tasks]));
              const other = row.byDepartment.filter((cell) => restKeys.has(cell.key)).reduce((sum, cell) => sum + cell.tasks, 0);
              const user = row.userId ? users.get(row.userId) : undefined;
              return (
                <tr
                  key={row.userId ?? "unassigned"}
                  className={cn("border-b border-border/40 transition-colors last:border-0 hover:bg-accent/60", row.userId === null ? "bg-surface/60" : "odd:bg-surface/25")}
                >
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    <span className="flex items-center gap-2">
                      {user ? <UserAvatar user={user as User} size="xs" /> : <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-border" />}
                      <span className="max-w-[12rem] truncate" title={row.name}>
                        {row.name}
                      </span>
                    </span>
                  </th>
                  {/* Tinted in the group's own colour, deeper where the figure
                      is bigger: a grid is read across a row and down a column,
                      and a wall of plain numerals is read neither way. */}
                  {columns.map((group) => {
                    const value = byKey.get(group.key) ?? 0;
                    return <Cell key={group.key} value={value} tint={value > 0 ? { color: departmentHex(group.name), share: value / hottest } : undefined} />;
                  })}
                  {rest.length > 0 && <Cell value={other} />}
                  <Cell value={row.tasks} strong last />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/**
 * One figure in a table that would otherwise be a field of numerals.
 *
 * `share` fills the cell from the right in proportion to the row's own total,
 * so the column can be read as a shape as well as a number. `tint` washes the
 * cell in a category's colour at a strength set by the figure, which is what
 * turns the grid into a heat map. Both sit behind the number and never replace
 * it: the exact figure is the reason this table exists.
 */
function Cell({
  value,
  strong,
  tone,
  last,
  share,
  tint,
}: {
  value: number;
  strong?: boolean;
  tone?: "urgent";
  last?: boolean;
  share?: number;
  tint?: { color: string; share: number };
}) {
  const background = tint
    ? `color-mix(in oklab, ${tint.color} ${Math.round(12 + Math.min(1, tint.share) * 45)}%, transparent)`
    : share !== undefined && share > 0
      ? `linear-gradient(to left, color-mix(in oklab, var(--color-primary) 22%, transparent) ${Math.max(4, Math.min(1, share) * 100)}%, transparent 0)`
      : undefined;
  return (
    <td className={cn("relative py-1.5 text-right tabular", !last && "pr-3", strong ? "font-medium" : "text-muted-foreground", tone === "urgent" && value > 0 && "text-destructive")}>
      {background && <span aria-hidden className="pointer-events-none absolute inset-y-px right-1 left-0 rounded-sm" style={{ background }} />}
      <span className="relative">{value === 0 ? <span className="text-muted-foreground/50">—</span> : formatCount(value)}</span>
    </td>
  );
}

"use client";

import { CalendarOff, Clock, Ruler, Search, Timer } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Input } from "@/components/ui/input";
import type { User } from "@/domain";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { assignedWorkload } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import { Numbers } from "./demand-section";
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
  const rows = React.useMemo(() => assignedWorkload(facts, today, prefs.teamIds, prefs.weeks), [facts, today, prefs.teamIds, prefs.weeks]);
  const filtered = query.trim() ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : rows;
  const totals = rows.reduce((acc, r) => ({ tasks: acc.tasks + r.tasks, units: acc.units + r.assetUnits }), { tasks: 0, units: 0 });
  const unowned = rows.find((r) => r.userId === null);
  // Every bar against the busiest person, so the lengths mean something.
  const peak = Math.max(1, ...rows.map((r) => r.tasks));

  return (
    <Panel
      title="Who is carrying what"
      subtitle={`Open work due in the next ${prefs.weeks} weeks, plus everything overdue or undated`}
      className="p-4"
      action={
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="mt-2.5 flex flex-col" role="list">
        {filtered.map((row) => {
          const user = row.userId ? facts.users.get(row.userId) : undefined;
          const share = row.tasks / peak;
          return (
            <div
              key={row.userId ?? "unassigned"}
              role="listitem"
              className={cn("flex items-center gap-2.5 rounded-md px-1 py-1 text-xs", row.userId === null && "bg-surface/60")}
              data-testid={row.userId === null ? "dashboard-unassigned-row" : "dashboard-workload-row"}
            >
              <span className="flex w-[10rem] shrink-0 items-center gap-2">
                {user ? <UserAvatar user={user as User} size="xs" /> : <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-border" />}
                <span className="min-w-0">
                  <span className={cn("block truncate", row.userId === null && "font-medium")} title={row.name}>
                    {row.name}
                  </span>
                  {(row.teamNames.length > 0 || row.former) && (
                    <span className="block truncate text-2xs text-muted-foreground">
                      {row.former ? "No longer a member · " : ""}
                      {row.teamNames.join(", ")}
                    </span>
                  )}
                </span>
              </span>

              {/* The bar is as long as this person's share of the busiest
                  person's load, and split by what state the work is in. */}
              <span className="flex h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-strong/70" style={{ maxWidth: `${Math.max(4, share * 100)}%` }}>
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

              <span className="ml-auto flex shrink-0 items-baseline gap-1 whitespace-nowrap tabular">
                <span className="font-medium">{formatCount(row.tasks)}</span>
                <span className="text-2xs text-muted-foreground">tasks</span>
                {row.overdue > 0 && <span className="text-2xs font-medium text-destructive">{formatCount(row.overdue)} late</span>}
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="py-4 text-center text-muted-foreground">Nobody matches “{query}”.</p>}
      </div>

      <Numbers label="Per-person figures">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-2xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Person
                </th>
                {BANDS.map((band) => (
                  <th key={band.key} scope="col" className="py-1.5 pr-3 text-right font-medium">
                    {band.label}
                  </th>
                ))}
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Tasks
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Asset units
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((row) => (
                <tr key={row.userId ?? "unassigned"} className={cn(row.userId === null && "bg-surface/60")}>
                  <th scope="row" className="max-w-[12rem] truncate py-1.5 pr-3 font-normal" title={row.name}>
                    {row.name}
                  </th>
                  {BANDS.map((band) => (
                    <Cell key={band.key} value={row[band.key]} tone={band.key === "overdue" ? "urgent" : undefined} />
                  ))}
                  <Cell value={row.tasks} strong />
                  <Cell value={row.assetUnits} strong last />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Numbers>

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
      </div>
    </Panel>
  );
}

/**
 * Why this is assignment and not capacity.
 *
 * Four cards rather than four bullet points, because it is a standing statement
 * about the model and it should not read like an apology buried at the foot of
 * the page. Output rates supply the first of the four now, which is why effort
 * in hours leads the page — the other three are still missing, and a load
 * percentage without them would be a number about nothing.
 */
export function CapacityNote() {
  const items = [
    { icon: Ruler, title: "Effort per task", detail: "Output rates give this now — hours per deliverable, set in Settings → Lists.", have: true },
    { icon: Clock, title: "Working time", detail: "Contracted hours per person, part-time patterns included.", have: false },
    { icon: CalendarOff, title: "Unavailable time", detail: "Leave, public holidays and standing commitments, so availability is net.", have: false },
    { icon: Timer, title: "Planned intervals", detail: "Where only a due date exists, work shows on its deadline — not when it is done.", have: false },
  ];

  return (
    <Panel title="Assignment, not capacity" subtitle="What a load percentage would still need" className="p-4" testId="dashboard-capacity-gap">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.title}
            className={cn(
              "flex min-w-0 flex-col gap-1 rounded-xl border p-3",
              item.have ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-border/50 bg-surface/50",
            )}
          >
            <span className="flex items-center gap-1.5">
              <item.icon className={cn("size-3.5 shrink-0", item.have ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} aria-hidden />
              <span className="truncate text-[13px] font-medium">{item.title}</span>
              {item.have && <span className="ml-auto shrink-0 text-2xs font-medium text-emerald-600 dark:text-emerald-400">have</span>}
            </span>
            <span className="text-2xs leading-relaxed text-muted-foreground">{item.detail}</span>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-2xs leading-relaxed text-muted-foreground">
        With all four: net availability = working time − unavailable time; load = assigned effort in the same interval; remaining = availability − load, kept negative when
        overloaded. Until then this page shows assignment, which is a real thing, rather than capacity, which would not be.
      </p>
    </Panel>
  );
}

function Cell({ value, strong, tone, last }: { value: number; strong?: boolean; tone?: "urgent"; last?: boolean }) {
  return (
    <td className={cn("py-1.5 text-right tabular", !last && "pr-3", strong ? "font-medium" : "text-muted-foreground", tone === "urgent" && value > 0 && "text-destructive")}>
      {value === 0 ? <span className="text-muted-foreground/50">—</span> : formatCount(value)}
    </td>
  );
}

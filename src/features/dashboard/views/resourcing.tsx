"use client";

import { Search } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { User } from "@/domain";
import { formatCount } from "@/features/dashboard/charts/chart-utils";
import { assignedWorkload } from "@/features/dashboard/metrics";
import { Panel } from "@/features/dashboard/panels";
import { cn } from "@/lib/utils";
import type { DashboardViewProps } from "./types";

const WINDOWS = [2, 4, 8] as const;

/**
 * The allocation meeting.
 *
 * What each person is carrying, what nobody has picked up, and who has nothing
 * on — all of it, not the busiest eight. The previous panel ranked people by
 * task count and cut the list at eight, which read as a productivity table and
 * hid exactly the people an allocation meeting is looking for.
 *
 * There is no capacity here, and the page says why rather than leaving a gap.
 * Capacity needs contracted hours, leave, non-project commitments and effort
 * estimates; this workspace records none of them, and a percentage computed
 * from task counts would be a number about nothing. What is here — assignment,
 * lateness, and what is unowned — is what the data can support.
 */
export function ResourcingView({ facts, prefs, set, today, onOpenTask }: DashboardViewProps) {
  const [query, setQuery] = React.useState("");
  const rows = React.useMemo(() => assignedWorkload(facts, today, prefs.teamIds, prefs.weeks), [facts, today, prefs.teamIds, prefs.weeks]);
  const filtered = query.trim() ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase())) : rows;
  const totals = rows.reduce((acc, r) => ({ tasks: acc.tasks + r.tasks, units: acc.units + r.assetUnits }), { tasks: 0, units: 0 });
  const unowned = rows.find((r) => r.userId === null);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <Panel
        title="Assigned workload"
        subtitle={`Open work due in the next ${prefs.weeks} weeks, plus everything overdue or undated`}
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
                  className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", prefs.weeks === weeks ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 text-2xs text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Person
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  In progress
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Scheduled
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Overdue
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  No date
                </th>
                <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                  Tasks
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  Asset units
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filtered.map((row) => {
                const user = row.userId ? facts.users.get(row.userId) : undefined;
                return (
                  <tr key={row.userId ?? "unassigned"} className={cn(row.userId === null && "bg-surface/60")} data-testid={row.userId === null ? "dashboard-unassigned-row" : undefined}>
                    <th scope="row" className="py-1.5 pr-3 font-normal">
                      <span className="flex min-w-0 items-center gap-2">
                        {user ? <UserAvatar user={user as User} size="xs" /> : <span aria-hidden className="size-5 shrink-0 rounded-full border border-dashed border-border" />}
                        <span className="min-w-0">
                          <span className={cn("block truncate", row.userId === null && "font-medium")}>{row.name}</span>
                          {(row.teamNames.length > 0 || row.former) && (
                            <span className="block truncate text-2xs text-muted-foreground">
                              {row.former ? "No longer a member · " : ""}
                              {row.teamNames.join(", ")}
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                    <Cell value={row.inProgress} />
                    <Cell value={row.scheduled} />
                    <Cell value={row.overdue} tone={row.overdue > 0 ? "urgent" : undefined} />
                    <Cell value={row.undated} />
                    <Cell value={row.tasks} strong />
                    <Cell value={row.assetUnits} strong last />
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    Nobody matches “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2.5 text-2xs leading-relaxed text-muted-foreground">
          <p>
            These are <strong className="font-medium text-foreground/80">association counts</strong>: a task with two owners is counted under both, so the column adds up to{" "}
            {formatCount(totals.tasks)} against fewer real tasks. Splitting it would invent an allocation nobody recorded.
          </p>
          <p>
            No capacity or load percentage is shown. That would need contracted hours, leave, non-project commitments and an effort estimate per task; none of the four is
            recorded here, and a percentage derived from task counts would say nothing about whether somebody has room.
          </p>
          {unowned && unowned.tasks > 0 && (
            <p>
              <strong className="font-medium text-foreground/80">{formatCount(unowned.tasks)}</strong> tasks in this window have no owner at all.
            </p>
          )}
        </div>
      </Panel>

      <Panel title="What would make capacity possible" subtitle="Deferred deliberately, not omitted" testId="dashboard-capacity-gap">
        <ul className="flex flex-col gap-2 text-[13px] text-muted-foreground">
          <li>
            <strong className="font-medium text-foreground/80">Effort per task or asset.</strong> A video and a social tile are each one asset and are not the same day&rsquo;s
            work. T-shirt sizes exist on some boards but no documented model turns XS–XL into hours.
          </li>
          <li>
            <strong className="font-medium text-foreground/80">Working time.</strong> Contracted hours per person, including part-time patterns.
          </li>
          <li>
            <strong className="font-medium text-foreground/80">Unavailable time.</strong> Leave, public holidays and standing commitments, so availability is net rather than
            nominal.
          </li>
          <li>
            <strong className="font-medium text-foreground/80">Planned intervals.</strong> Where only a due date exists the work appears on its deadline, which is not when it
            is done. Timeline columns already carry this where teams use them.
          </li>
        </ul>
        <p className="mt-3 text-2xs text-muted-foreground">
          With those four: net availability = working time − unavailable time; load = assigned effort in the same interval; remaining = availability − load, kept negative when
          overloaded. Until then this page shows assignment, which is a real thing, rather than capacity, which would not be.
        </p>
      </Panel>

      {onOpenTask && <p className="text-2xs text-muted-foreground">Open a person&rsquo;s work from the Attention list on Overview, or from their board.</p>}
    </div>
  );
}

function Cell({ value, strong, tone, last }: { value: number; strong?: boolean; tone?: "urgent"; last?: boolean }) {
  return (
    <td className={cn("py-1.5 text-right tabular", !last && "pr-3", strong ? "font-medium" : "text-muted-foreground", tone === "urgent" && value > 0 && "text-destructive")}>
      {value === 0 ? <span className="text-muted-foreground/50">—</span> : formatCount(value)}
    </td>
  );
}

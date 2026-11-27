"use client";

import { CopyPlus, Download, Palmtree, Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import type { WorkspaceHoliday } from "@/domain";
import { HOLIDAY_KIND_LABELS, VIETNAM_HOLIDAYS, daysBetween, isWeekend } from "@/domain";
import { HolidayDialog } from "@/features/calendar/dialogs";
import { useCalendarMutations, useHolidays } from "@/features/calendar/hooks";
import { spanLabel, todayInVietnam } from "@/features/calendar/model";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { isWorkspaceAdmin } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/** Settings → Holidays: the days the team is closed, year by year. Admins change them. */
export function HolidaysSection() {
  const ws = useWorkspace();
  const canEdit = isWorkspaceAdmin(ws.permissions);
  const holidays = useHolidays(ws.workspace.id);
  const m = useCalendarMutations(ws.workspace.id);
  const thisYear = Number(todayInVietnam().slice(0, 4));
  const years = React.useMemo(() => {
    const set = new Set((holidays.data ?? []).map((h) => Number(h.startsOn.slice(0, 4))));
    set.add(thisYear);
    set.add(thisYear + 1);
    return [...set].sort((a, b) => a - b);
  }, [holidays.data, thisYear]);
  const [year, setYear] = React.useState(thisYear);
  const [editing, setEditing] = React.useState<{ holiday: WorkspaceHoliday | null; day: string | null } | null>(null);

  const list = (holidays.data ?? []).filter((h) => h.startsOn.startsWith(`${year}-`));
  const workingDaysOff = list.reduce((n, h) => n + daysBetween(h.startsOn, h.endsOn).filter((d) => !isWeekend(d)).length * (h.halfDay ? 0.5 : 1), 0);
  const vietnamYears = new Set(VIETNAM_HOLIDAYS.map((h) => Number(h.startsOn.slice(0, 4))));

  return (
    <div className="grid gap-4" data-testid="holidays-section">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Year" className="flex rounded-lg border border-border/70 bg-surface p-0.5">
          {years.map((y) => (
            <button key={y} type="button" role="tab" aria-selected={y === year} onClick={() => setYear(y)} className={cn("rounded-md px-2.5 py-1 text-[12.5px] font-medium text-muted-foreground tabular-nums", y === year && "bg-card text-foreground shadow-xs")}>
              {y}
            </button>
          ))}
        </div>
        <span className="text-[12.5px] text-muted-foreground" data-testid="holidays-summary">
          {list.length} {list.length === 1 ? "holiday" : "holidays"} · {workingDaysOff} working {workingDaysOff === 1 ? "day" : "days"} off
        </span>
        {canEdit && (
          <div className="ml-auto flex flex-wrap gap-2">
            {vietnamYears.has(year) && (
              <Button variant="outline" size="sm" onClick={() => m.addVietnamYear.mutate(year)} disabled={m.addVietnamYear.isPending} data-testid="holidays-add-vietnam">
                <Download /> Vietnam {year}
              </Button>
            )}
            {list.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => m.copyYear.mutate(year)} disabled={m.copyYear.isPending} data-testid="holidays-copy-year">
                <CopyPlus /> Copy to {year + 1}
              </Button>
            )}
            <Button size="sm" onClick={() => setEditing({ holiday: null, day: `${year}-01-01` })} data-testid="holidays-add">
              <Plus /> Add
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70">
        {holidays.isLoading ? (
          <div className="grid gap-2 p-4">
            <SkeletonLine className="w-1/2" />
            <SkeletonLine className="w-1/3" />
          </div>
        ) : list.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">No holidays in {year}.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {list.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => setEditing({ holiday: h, day: null })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/50" data-testid="holiday-row">
                  <Palmtree className="size-4 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{h.name}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {HOLIDAY_KIND_LABELS[h.kind]}
                      {h.halfDay ? ` · ${h.halfDay === "AM" ? "morning" : "afternoon"} off` : ""}
                      {h.note ? ` · ${h.note}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">{spanLabel(h.startsOn, h.endsOn)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <HolidayDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} workspaceId={ws.workspace.id} holiday={editing?.holiday ?? null} day={editing?.day ?? null} canEdit={canEdit} />
    </div>
  );
}

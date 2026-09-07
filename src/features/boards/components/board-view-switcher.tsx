"use client";

import { CalendarDays, ChartBar, Check, ChevronDown, Kanban, Rows3, SquareChartGantt, Table2, Users } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BoardViewKind } from "@/domain";

export const VIEWS: Array<{ id: BoardViewKind; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "table", label: "Main Table", hint: "Every column, editable", icon: Table2 },
  { id: "kanban", label: "Kanban", hint: "Cards in lanes by status, priority, person or group", icon: Kanban },
  { id: "timeline", label: "Timeline", hint: "Bars on a calendar, by group", icon: Rows3 },
  { id: "calendar", label: "Calendar", hint: "Due dates by month or week", icon: CalendarDays },
  { id: "gantt", label: "Gantt", hint: "Schedule with subitems and dependencies", icon: SquareChartGantt },
  { id: "workload", label: "Workload", hint: "Who has what, week by week", icon: Users },
  { id: "chart", label: "Chart", hint: "Counts and totals, sliced any way", icon: ChartBar },
];

/** Shared by the board bar and the bar shown while a board loads, so the two line up. */
export const boardBarClasses = "flex h-14 shrink-0 items-center gap-2 overflow-x-auto border-b border-border/70 px-6";

/** One button naming the current view; opening it lists every view. */
export function BoardViewSwitcher({ view, onChange }: { view: BoardViewKind; onChange: (view: BoardViewKind) => void }) {
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!;
  const CurrentIcon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="default" className="shrink-0 rounded-full pl-3 pr-2.5 font-semibold" aria-label={`Board view: ${current.label}`} data-testid="view-switcher">
          <CurrentIcon /> {current.label} <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Views</DropdownMenuLabel>
        {VIEWS.map(({ id, label, hint, icon: Icon }) => (
          <DropdownMenuItem key={id} onSelect={() => onChange(id)} data-testid={`view-${id}`} className="items-start py-1.5">
            <Icon className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{label}</span>
              <span className="text-2xs text-muted-foreground">{hint}</span>
            </span>
            {id === view && <Check className="mt-0.5 size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { Archive, CalendarDays, ChartBar, Check, ChevronDown, Kanban, Rows3, SquareChartGantt, Table2, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/**
 * The board's archive, offered under the views.
 *
 * Not a view of this board: it reads a page at a time, has no groups and
 * nothing to edit, so it is a link to its own screen rather than another way of
 * drawing these items. It is passed in rather than built here because the
 * screens that show a board to someone outside - a public link, a department's
 * portal - use this same switcher and have no archive to offer.
 */
export interface ArchiveEntry {
  href: string;
  /** How many items are in there, when it is known. */
  count?: number | null;
}

/** One button naming the current view; opening it lists every view. */
export function BoardViewSwitcher({ view, onChange, archive }: { view: BoardViewKind; onChange: (view: BoardViewKind) => void; archive?: ArchiveEntry | null }) {
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
        {archive && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Archive</DropdownMenuLabel>
            <DropdownMenuItem asChild className="items-start py-1.5" data-testid="view-archive">
              <Link href={archive.href}>
                <Archive className="mt-0.5" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span>Archived items</span>
                  <span className="text-2xs text-muted-foreground">Everything taken off this board</span>
                </span>
                {typeof archive.count === "number" && <span className="mt-0.5 text-2xs tabular text-muted-foreground">{archive.count}</span>}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

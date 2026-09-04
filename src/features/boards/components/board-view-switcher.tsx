"use client";

import { CalendarDays, Check, ChevronDown, Files, GanttChart, Kanban, Table2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BoardViewKind } from "@/domain";

const VIEWS: Array<{ id: BoardViewKind; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "table", label: "Main Table", icon: Table2 },
  { id: "kanban", label: "Kanban", icon: Kanban },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "files", label: "Files", icon: Files },
];

/** Shared by the board bar and the bar shown while a board loads, so the two line up. */
export const boardBarClasses = "flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b px-6";

/** One button naming the current view; opening it lists every view. */
export function BoardViewSwitcher({ view, onChange }: { view: BoardViewKind; onChange: (view: BoardViewKind) => void }) {
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0]!;
  const CurrentIcon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="shrink-0 font-medium" aria-label={`Board view: ${current.label}`} data-testid="view-switcher">
          <CurrentIcon /> {current.label} <ChevronDown className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Views</DropdownMenuLabel>
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <DropdownMenuItem key={id} onSelect={() => onChange(id)} data-testid={`view-${id}`}>
            <Icon /> {label}
            {id === view && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center justify-between">
          More views <Badge variant="muted">Coming later</Badge>
        </DropdownMenuLabel>
        {["Gantt", "Workload", "Chart", "Form"].map((v) => (
          <DropdownMenuItem key={v} disabled>
            {v}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

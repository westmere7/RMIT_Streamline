"use client";

import { CalendarDays, Files, GanttChart, Kanban, Plus, Table2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BoardViewKind } from "@/domain";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ id: BoardViewKind; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "table", label: "Main Table", icon: Table2 },
  { id: "kanban", label: "Kanban", icon: Kanban },
  { id: "timeline", label: "Timeline", icon: GanttChart },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "files", label: "Files", icon: Files },
];

export function BoardViewTabs({ view, onChange }: { view: BoardViewKind; onChange: (view: BoardViewKind) => void }) {
  return (
    <div role="tablist" aria-label="Board views" className="flex items-end gap-1 border-b px-6">
      {VIEWS.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`view-${id}`}
            onClick={() => onChange(id)}
            className={cn(
              "relative -mb-px flex h-10 items-center gap-1.5 border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Add view" className="mb-1 ml-1 flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
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
    </div>
  );
}

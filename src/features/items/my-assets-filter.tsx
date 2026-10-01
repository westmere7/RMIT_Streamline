"use client";

import { ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Beside Block in the Assets tab, when any line on this task is on the person
 * looking: a toggle between every line and just theirs. The count is what they
 * still have to tick off.
 */
export function MyAssetsToggle({ on, todo, onChange }: { on: boolean; todo: number; onChange: (on: boolean) => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn("h-auto shrink-0 self-stretch rounded-xl px-3 shadow-xs", on && "state-on border-ring/40 hover:bg-accent-soft hover:text-accent-soft-foreground")}
      title={on ? "Show every item" : "Show only your items"}
      data-testid="asset-mine"
    >
      <ListChecks /> To-do
      {todo > 0 && (
        <span className={cn("rounded-full px-1.5 text-2xs font-semibold tabular", on ? "bg-ring text-white" : "bg-accent-soft text-accent-soft-foreground")} data-testid="asset-mine-count">
          {todo}
        </span>
      )}
    </Button>
  );
}

/** Beside the toggle while the list is filtered, so a short list is not read as the whole of it. */
export function MyAssetsStrip({ shown, total, onShowAll }: { shown: number; total: number; onShowAll: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-accent-soft/60 pl-3 pr-1 text-xs text-accent-soft-foreground" role="status" data-testid="asset-mine-strip">
      <ListChecks className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">Only yours</span>
        <span className="tabular"> · {shown} of {total} items</span>
      </span>
      <Button type="button" variant="ghost" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={onShowAll} data-testid="asset-mine-show-all">
        <X className="size-3" /> Show all
      </Button>
    </div>
  );
}

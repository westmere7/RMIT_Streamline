"use client";

import { EyeOff, ListChecks } from "lucide-react";
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

/**
 * Beside the toggle while the list is filtered, in warning colours: everyone
 * else's lines are hidden, and a short list must not be read as the whole of
 * it. Says how many are hidden, with the way back beside it.
 */
export function MyAssetsStrip({ shown, total, onShowAll }: { shown: number; total: number; onShowAll: () => void }) {
  const hidden = Math.max(0, total - shown);
  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-amber-400 bg-amber-100 pr-1 pl-3 text-xs text-amber-950 shadow-xs dark:border-amber-500/60 dark:bg-amber-500/15 dark:text-amber-100"
      role="status"
      data-testid="asset-mine-strip"
    >
      <EyeOff className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{hidden === 1 ? "1 item hidden" : `${hidden} items hidden`}</span>
        <span> · only yours shown</span>
      </span>
      <Button
        type="button"
        size="sm"
        className="h-7 shrink-0 bg-amber-500 px-2.5 text-xs font-semibold text-amber-950 hover:bg-amber-400 dark:bg-amber-500 dark:text-amber-950 dark:hover:bg-amber-400"
        onClick={onShowAll}
        data-testid="asset-mine-show-all"
      >
        Show all
      </Button>
    </div>
  );
}

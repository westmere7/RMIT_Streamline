"use client";

import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * A task waiting on something else: an amber dot, and the reason on hover.
 *
 * It was a warning triangle, which is the same mark the board uses for work
 * that is actually late — and being third in a queue is not a fault. A dot is
 * enough to find the row; the tooltip still says what is holding it up.
 */
export function BlockedDot({ label = "Blocked: depends on items that are not done", className }: { label?: string; className?: string }) {
  return (
    <SimpleTooltip label={label}>
      <span
        aria-label="Blocked"
        data-testid="blocked-dot"
        className={cn("size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-400", className)}
      />
    </SimpleTooltip>
  );
}

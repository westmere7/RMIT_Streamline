"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The activity feed while it is being read.
 *
 * One row per line to come: the actor's avatar, the sentence, and the time
 * underneath. The lines are of different lengths because the real ones are,
 * and a column of identical bars reads as a table rather than a feed.
 */
export function ActivitySkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  const widths = ["w-11/12", "w-4/5", "w-full", "w-3/4", "w-5/6"];
  return (
    <ol className={cn(className)} aria-busy aria-label="Loading recent activity" data-testid="activity-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex gap-2.5 py-2">
          <Skeleton className="size-6 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
            <Skeleton className={cn("h-3.5", widths[i % widths.length])} />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </li>
      ))}
    </ol>
  );
}

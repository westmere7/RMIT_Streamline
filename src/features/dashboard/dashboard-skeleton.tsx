"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The dashboard while its figures are still being read.
 *
 * The same frame in the same place — title, the band of controls, then the
 * rows of panels at the widths they are about to have — so the wait happens
 * inside the page that was asked for rather than in front of it, and nothing
 * moves when the numbers arrive. Blocks only: how many teams there are and
 * whether this workspace has rates to show an effort card is not known yet,
 * and a skeleton that guesses is a skeleton that lies.
 */
export function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)} aria-busy aria-label="Loading the dashboard" data-testid="dashboard-skeleton">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5 sm:px-6">
        <Skeleton className="h-8 w-52 rounded-full" />
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="ml-auto hidden h-3 w-64 lg:block" />
      </div>

      {/* Hidden overflow rather than the real panel's scroll: a scrollbar that
          appears for the wait and goes again is movement the page has not
          earned. */}
      <div className="min-h-0 flex-1 overflow-hidden bg-surface/40">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 p-3 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[10.5rem] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

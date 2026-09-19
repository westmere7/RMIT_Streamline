"use client";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * The inbox while it is being read: the same card, the same rows.
 *
 * Every row carries an avatar, a title, a line of detail and a read dot, and
 * they are the same height whatever the notification says — so this is the one
 * list in the app whose placeholder is the shape of the answer rather than a
 * guess at it.
 */
export function InboxSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul
      className="mt-2 divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs"
      aria-busy
      aria-label="Loading your inbox"
      data-testid="inbox-skeleton"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-start gap-3 px-3 py-2.5">
          <Skeleton className="mt-0.5 size-7 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <Skeleton className="mt-1.5 size-2 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

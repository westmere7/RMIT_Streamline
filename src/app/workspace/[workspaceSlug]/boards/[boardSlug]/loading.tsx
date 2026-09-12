import { Skeleton } from "@/components/ui/skeleton";

/**
 * What stands in while the board route is on its way.
 *
 * Without this, Next holds the old board on screen until the new one is ready
 * to render — a few hundred milliseconds where a click appears to have done
 * nothing. With it the navigation commits at once: the sidebar moves, the URL
 * changes, and this takes the board's place until it arrives.
 *
 * The red sweep is the same one the stakeholder portal uses while it swaps
 * boards, so waiting looks the same wherever it happens.
 */
export default function BoardLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="board-route-loading">
      <div className="relative h-0.5 shrink-0 overflow-hidden bg-primary/10" role="status" aria-label="Loading board">
        <span aria-hidden className="auth-sweep absolute inset-y-0 w-1/2" />
      </div>
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <Skeleton className="size-9 rounded-xl" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="flex gap-2 border-b px-6 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20" />
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-2 p-6">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

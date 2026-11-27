"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { ColorToken } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { loadBoardCount } from "@/features/boards/count-batch";
import { colorClasses } from "@/lib/colors";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/**
 * How many tasks a board holds now, as a small rounded badge beside its name
 * (the sidebar, a team's board list).
 *
 * A count only, and every badge on the page in one read (count-batch.ts). Every
 * badge for one board shares one query, which the board's own writes and its live channel
 * refresh (use-board-mutations, use-board-realtime).
 *
 * Settings → Appearance can switch the counts off for this browser
 * (showBoardCounts); then nothing is shown and nothing is read.
 */
export function BoardItemCount({ boardId, className }: { boardId: string; className?: string }) {
  const services = useServices();
  const show = useUiStore((s) => s.showBoardCounts);
  const count = useQuery({
    queryKey: queryKeys.boardItemCount(boardId),
    queryFn: () => loadBoardCount(services.items, boardId),
    staleTime: 60_000,
    enabled: show,
  });
  if (!show || count.data === undefined) return null;
  return (
    <span
      className={cn("shrink-0 rounded bg-muted px-1.5 py-px text-2xs leading-4 font-medium tabular text-muted-foreground", className)}
      aria-label={`${count.data} ${count.data === 1 ? "task" : "tasks"}`}
      data-testid="board-item-count"
    >
      {count.data}
    </span>
  );
}

/**
 * How many tasks a team's boards hold between them, in the team's colour: the
 * sum of the same per-board counts the board badges read, so it costs nothing
 * more. Shown once every board has answered, so it never counts up.
 */
export function TeamItemCount({ boardIds, color, className }: { boardIds: readonly string[]; color: ColorToken; className?: string }) {
  const services = useServices();
  const counts = useQueries({
    queries: boardIds.map((boardId) => ({
      queryKey: queryKeys.boardItemCount(boardId),
      queryFn: () => loadBoardCount(services.items, boardId),
      staleTime: 60_000,
    })),
  });
  if (counts.some((count) => count.data === undefined)) return null;
  const total = counts.reduce((sum, count) => sum + (count.data ?? 0), 0);
  return (
    <span
      className={cn("shrink-0 rounded px-1.5 py-px text-2xs leading-4 font-medium tabular", colorClasses(color).soft, className)}
      aria-label={`${total} ${total === 1 ? "task" : "tasks"} on the team's boards`}
      data-testid="team-item-count"
    >
      {total}
    </span>
  );
}

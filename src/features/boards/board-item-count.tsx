"use client";

import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/**
 * How many tasks a board holds now, as a small rounded badge beside its name
 * (the sidebar, a team's board list).
 *
 * A count only: the read is a head request and no rows travel. Every badge for
 * one board shares one query, which the board's own writes and its live channel
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
    queryFn: () => services.items.countLive(boardId),
    staleTime: 60_000,
    enabled: show,
  });
  if (!show || count.data === undefined) return null;
  return (
    <span
      className={cn("shrink-0 rounded-md bg-muted px-1.5 py-px text-2xs leading-4 font-medium tabular text-muted-foreground", className)}
      aria-label={`${count.data} ${count.data === 1 ? "task" : "tasks"}`}
      data-testid="board-item-count"
    >
      {count.data}
    </span>
  );
}

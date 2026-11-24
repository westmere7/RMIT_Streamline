"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import type { ColorToken } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspaceOptional } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
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
 * (showBoardCounts); then nothing is shown and nothing is read, except the
 * new-tasks dot, which stands on its own.
 *
 * A dot on its corner says tasks arrived (made, moved or allocated there, by
 * someone else) since this person last opened the board.
 */
export function BoardItemCount({ boardId, className }: { boardId: string; className?: string }) {
  const services = useServices();
  const show = useUiStore((s) => s.showBoardCounts);
  const fresh = useBoardHasNewItems(boardId);
  const count = useQuery({
    queryKey: queryKeys.boardItemCount(boardId),
    queryFn: () => services.items.countLive(boardId),
    staleTime: 60_000,
    enabled: show,
  });
  const dot = fresh && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" data-testid="board-new-items" />;
  if (!show || count.data === undefined) {
    return fresh ? (
      <span className="relative size-1.5 shrink-0" aria-label="New tasks since you last looked" title="New tasks since you last looked">
        {dot}
      </span>
    ) : null;
  }
  return (
    <span
      className={cn("relative shrink-0 rounded bg-muted px-1.5 py-px text-2xs leading-4 font-medium tabular text-muted-foreground", className)}
      aria-label={`${count.data} ${count.data === 1 ? "task" : "tasks"}${fresh ? ", new since you last looked" : ""}`}
      title={fresh ? "New tasks since you last looked" : undefined}
      data-testid="board-item-count"
    >
      {count.data}
      {dot}
    </span>
  );
}

/**
 * Whether tasks arrived on the board since this person last opened it. One
 * read for the whole workspace, shared by every badge; refreshed when a board
 * is opened or left (board-page) and when a task arrives anywhere
 * (use-workspace-realtime). The board on screen never shows it.
 */
function useBoardHasNewItems(boardId: string): boolean {
  const services = useServices();
  const ws = useWorkspaceOptional();
  const pathname = usePathname();
  const workspaceId = ws?.workspace.id ?? null;
  const userId = ws?.currentUser.id ?? null;
  const boards = useQuery({
    queryKey: queryKeys.boardsWithNewItems(workspaceId ?? ""),
    queryFn: async () => new Set(await services.repos.admin.listBoardsWithNewItems(userId!, workspaceId!)),
    enabled: !!workspaceId && !!userId,
    staleTime: 60_000,
  });
  if (!boards.data?.has(boardId)) return false;
  const slug = ws?.boardById(boardId)?.slug;
  return !(slug && pathname?.split("/boards/")[1]?.split("/")[0] === slug);
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
      queryFn: () => services.items.countLive(boardId),
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

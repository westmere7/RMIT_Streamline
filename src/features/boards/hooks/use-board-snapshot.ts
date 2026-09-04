"use client";

import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

/**
 * Loads a board with its groups, columns, items and values in one query.
 *
 * Realtime (future): a Supabase subscription on `items`, `item_column_values`,
 * `comments` and `activities` filtered by board_id would call
 * `queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(boardId) })`.
 * See src/features/boards/hooks/use-board-realtime.ts.
 */
export function useBoardSnapshot(boardId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.boardSnapshot(boardId ?? ""),
    queryFn: () => services.items.loadBoardSnapshot(boardId!),
    enabled: !!boardId,
    staleTime: 15_000,
  });
}

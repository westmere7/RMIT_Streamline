"use client";

import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

/**
 * Loads a board with its groups, columns, items and values in one query.
 *
 * Kept current by `useBoardRealtime`, which subscribes to the tables behind it
 * filtered by board and invalidates this key — so the 15 seconds below is how
 * long a *silent* board is trusted, not how far behind an active one runs.
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

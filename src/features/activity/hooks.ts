"use client";

import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

export function useWorkspaceActivity(workspaceId: string, limit = 20) {
  const services = useServices();
  return useQuery({
    queryKey: [...queryKeys.workspaceActivity(workspaceId), limit],
    queryFn: () => services.repos.activities.listByWorkspace(workspaceId, limit),
    staleTime: 10_000,
  });
}

export function useBoardActivity(boardId: string, limit = 50) {
  const services = useServices();
  return useQuery({
    queryKey: [...queryKeys.boardActivity(boardId), limit],
    queryFn: () => services.repos.activities.listByBoard(boardId, limit),
    staleTime: 10_000,
  });
}

export function useItemActivity(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.itemActivity(itemId ?? ""),
    queryFn: () => services.repos.activities.listByItem(itemId!),
    enabled: !!itemId,
    staleTime: 5_000,
  });
}

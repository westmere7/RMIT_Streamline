"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

/**
 * The workspace feed on the home page.
 *
 * Subscribed here rather than on the workspace channel: `activities` gains a
 * row for every edit anyone makes anywhere, and the feed is on one page. Held
 * open on every page it would be the noisiest thing in the app, refreshing
 * something nobody is looking at.
 */
export function useWorkspaceActivity(workspaceId: string, limit = 20) {
  const services = useServices();
  const bindings = useMemo<RealtimeBinding[]>(
    () => (workspaceId ? [{ table: "activities", filter: `workspace_id=eq.${workspaceId}`, keys: [queryKeys.workspaceActivity(workspaceId)] }] : []),
    [workspaceId],
  );
  useRealtime(workspaceId ? `workspace-activity:${workspaceId}` : null, bindings, { coalesceMs: 2_000, minIntervalMs: 10_000 });
  return useQuery({
    queryKey: [...queryKeys.workspaceActivity(workspaceId), limit],
    queryFn: () => services.repos.activities.listByWorkspace(workspaceId, limit),
    staleTime: 10_000,
  });
}

/** A board's feed. The board's own channel carries `activities` for it, so this only reads. */
export function useBoardActivity(boardId: string, limit = 50) {
  const services = useServices();
  return useQuery({
    queryKey: [...queryKeys.boardActivity(boardId), limit],
    queryFn: () => services.repos.activities.listByBoard(boardId, limit),
    staleTime: 10_000,
  });
}

/** One item's feed, in the panel. Also carried by the board's channel. */
export function useItemActivity(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.itemActivity(itemId ?? ""),
    queryFn: () => services.repos.activities.listByItem(itemId!),
    enabled: !!itemId,
    staleTime: 5_000,
  });
}

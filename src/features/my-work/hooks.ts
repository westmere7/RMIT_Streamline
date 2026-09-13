"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

/** A safety net under realtime: even a silent channel re-reads this often. */
const REFRESH_MS = 30_000;
/** One write often produces several row events; refetch once for the burst. */
const COALESCE_MS = 250;
/**
 * The least time between two reads, however long the burst runs.
 *
 * `item_column_values` arrives unfiltered here — an assignment is not keyed by
 * the person it names — so a colleague working steadily on any board in the
 * workspace is a stream of events this page has to sit through. Coalescing
 * bounds one burst; this bounds a run of them.
 */
const MIN_REFETCH_MS = 5_000;

/**
 * The work assigned to one person, across every board in the workspace.
 *
 * Nothing is trusted for any length of time. Somebody else putting your name on
 * a task is the common way this list changes, and it happens on a board this
 * page is not showing — so the page listens for the write rather than waiting to
 * be remounted, and re-reads on a slow cycle in case it never hears it.
 */
export function useMyWork(workspaceId: string, userId: string) {
  const services = useServices();
  useMyWorkRealtime(workspaceId, userId);
  return useQuery({
    queryKey: queryKeys.myWork(workspaceId, userId),
    queryFn: () => services.myWork.listAssigned(workspaceId, userId),
    staleTime: 0,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });
}

/**
 * Invalidates this person's work when the rows it is read from move.
 *
 * `item_column_values` is where an assignment is written, and it arrives
 * unfiltered because the value that names you is not keyed by you; the refetch
 * that follows is what narrows it. Items and boards matter too — a task renamed,
 * archived or moved is a line on this page that has changed or gone.
 *
 * In local mode the BroadcastChannel sync invalidates the same key, so this does
 * nothing there.
 */
function useMyWorkRealtime(workspaceId: string, userId: string): void {
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!workspaceId || !userId) return [];
    const keys = [queryKeys.myWork(workspaceId, userId)];
    return [
      { table: "item_column_values", keys },
      { table: "items", keys },
      { table: "board_columns", keys },
      { table: "boards", filter: `workspace_id=eq.${workspaceId}`, keys },
    ];
  }, [workspaceId, userId]);
  useRealtime(workspaceId && userId ? `my-work:${workspaceId}:${userId}` : null, bindings, { coalesceMs: COALESCE_MS, minIntervalMs: MIN_REFETCH_MS });
}

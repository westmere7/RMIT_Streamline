"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Item } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { useWorkspaceRowChecks } from "@/lib/realtime/in-workspace";

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
 * The asset lines this person is in charge of, across the workspace. Read
 * only while the Assets tab is open (`enabled`), and kept for going back to it.
 */
export function useMyAssets(workspaceId: string, userId: string, enabled: boolean) {
  const services = useServices();
  const checks = useWorkspaceRowChecks();
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!workspaceId || !userId) return [];
    const keys = [queryKeys.myAssets(workspaceId, userId)];
    return [
      { table: "item_assets", keys, accept: checks.onBoard },
      { table: "items", keys, accept: checks.onBoard },
    ];
  }, [workspaceId, userId, checks]);
  useRealtime(enabled && workspaceId && userId ? `my-assets:${workspaceId}:${userId}` : null, bindings, { coalesceMs: COALESCE_MS, minIntervalMs: MIN_REFETCH_MS });
  return useQuery({
    queryKey: queryKeys.myAssets(workspaceId, userId),
    queryFn: () => services.myWork.listAssignedAssets(workspaceId, userId),
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? REFRESH_MS : false,
    refetchOnWindowFocus: enabled,
  });
}

/**
 * The tasks this person starred, as My Work rows. Read while the Starred tab
 * is open, and followed like the rest of My Work.
 */
export function useMyStarred(workspaceId: string, userId: string, enabled: boolean) {
  const services = useServices();
  const checks = useWorkspaceRowChecks();
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!workspaceId || !userId) return [];
    const keys = [queryKeys.myStarred(workspaceId, userId)];
    return [
      { table: "item_column_values", keys, accept: checks.onBoard },
      { table: "items", keys, accept: checks.onBoard },
    ];
  }, [workspaceId, userId, checks]);
  useRealtime(enabled && workspaceId && userId ? `my-starred:${workspaceId}:${userId}` : null, bindings, { coalesceMs: COALESCE_MS, minIntervalMs: MIN_REFETCH_MS });
  return useQuery({
    queryKey: queryKeys.myStarred(workspaceId, userId),
    queryFn: () => services.myWork.listStarred(workspaceId, userId),
    enabled,
    staleTime: 0,
    refetchInterval: enabled ? REFRESH_MS : false,
    refetchOnWindowFocus: enabled,
  });
}

/** Which tasks this person starred, each with its board, for the stars on the panel and the rows. */
export function useStarredIds(userId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.itemFavourites(userId),
    queryFn: () => services.myWork.starredIds(userId),
    staleTime: 60_000,
  });
}

/** Stars or unstars tasks, the star turning at once. */
export function useStar(userId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.itemFavourites(userId);
  return useMutation({
    mutationFn: async ({ items, on }: { items: Array<Pick<Item, "id" | "boardId">>; on: boolean }) => {
      if (on) for (const item of items) await services.myWork.star(userId, item);
      else await services.myWork.unstar(userId, items.map((i) => i.id));
    },
    onMutate: async ({ items, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Map<string, string>>(key);
      const next = new Map(previous ?? []);
      for (const item of items) {
        if (on) next.set(item.id, item.boardId);
        else next.delete(item.id);
      }
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(error instanceof Error ? error.message : "Could not change the star");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["my-starred"] });
    },
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
  const checks = useWorkspaceRowChecks();
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!workspaceId || !userId) return [];
    const keys = [queryKeys.myWork(workspaceId, userId)];
    return [
      { table: "item_column_values", keys, accept: checks.onBoard },
      { table: "items", keys, accept: checks.onBoard },
      { table: "board_columns", keys, accept: checks.onBoard },
      { table: "boards", filter: `workspace_id=eq.${workspaceId}`, keys },
    ];
  }, [workspaceId, userId, checks]);
  useRealtime(workspaceId && userId ? `my-work:${workspaceId}:${userId}` : null, bindings, { coalesceMs: COALESCE_MS, minIntervalMs: MIN_REFETCH_MS });
}

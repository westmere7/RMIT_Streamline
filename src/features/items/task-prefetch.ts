"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

type Services = ReturnType<typeof useServices>;

/** The task panel's four gated reads, into the cache, under the panel's own keys and cache times. */
export function prefetchTaskPanel(queryClient: QueryClient, services: Services, itemId: string): void {
  void queryClient.prefetchQuery({ queryKey: queryKeys.comments(itemId), queryFn: () => services.comments.listByItem(itemId), staleTime: 5_000 });
  void queryClient.prefetchQuery({ queryKey: queryKeys.itemAssets(itemId), queryFn: () => services.assets.list(itemId), staleTime: 5_000 });
  void queryClient.prefetchQuery({ queryKey: queryKeys.itemLinks(itemId), queryFn: () => services.links.listForItem(itemId), staleTime: 30_000 });
  void queryClient.prefetchQuery({ queryKey: queryKeys.itemShare(itemId), queryFn: () => services.itemShares.get(itemId), staleTime: 60_000 });
}

/** How long the pointer rests on a task before its panel's reads go out. */
export const TASK_PREFETCH_DWELL_MS = 120;

/**
 * The task panel holds its blocks until four reads are in (updates,
 * deliverables, links, the share state): a round trip or two on every open.
 * Read them while the pointer rests on the task instead, so the click opens
 * on what is already here. Same keys, reads and cache times as the panel's own
 * hooks, so the panel takes them as they are. Only where the board page turns
 * it on (`prefetchTasks`): shared and portal pages read through other routes.
 */
export function useTaskPrefetch(itemId: string): { onPointerEnter?: () => void; onPointerLeave?: () => void; onPointerDown?: () => void } {
  const { prefetchTasks } = useBoardContext();
  const services = useServices();
  const queryClient = useQueryClient();
  const timer = React.useRef<number | null>(null);
  React.useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);
  if (!prefetchTasks) return {};
  const go = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    prefetchTaskPanel(queryClient, services, itemId);
  };
  return {
    onPointerEnter: () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(go, TASK_PREFETCH_DWELL_MS);
    },
    onPointerLeave: () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    },
    // A quick click lands before the dwell: start then.
    onPointerDown: go,
  };
}

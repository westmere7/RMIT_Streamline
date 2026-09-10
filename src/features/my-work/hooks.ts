"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { useDataContext, useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { getSupabaseClient } from "@/lib/supabase/client";

/** A safety net under realtime: even a silent channel re-reads this often. */
const REFRESH_MS = 30_000;
/** One write often produces several row events; refetch once for the burst. */
const COALESCE_MS = 250;

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
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!workspaceId || !userId || providerKind !== "supabase") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = getSupabaseClient();
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: queryKeys.myWork(workspaceId, userId) });
      }, COALESCE_MS);
    };
    const channel = supabase.channel(`my-work:${workspaceId}:${userId}`);
    for (const table of ["item_column_values", "items", "board_columns", "boards"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, userId, providerKind, queryClient]);
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Board } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext, useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { DashboardShareSettings } from "@/services";

/** How long a snapshot is trusted before a mount refetches it; realtime shortens this to nothing. */
const SNAPSHOT_STALE_MS = 15_000;
/** A safety net under realtime: even a silent channel refreshes the figures this often. */
const SNAPSHOT_REFRESH_MS = 60_000;
/** One write often produces several row events; refetch once for the burst. */
const COALESCE_MS = 500;

/** Everything the dashboard is drawn from, for the boards the reader can see. */
export function useDashboardSnapshot(workspaceId: string, boards: Board[]) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.dashboard(workspaceId),
    queryFn: () => services.dashboard.loadSnapshot(workspaceId, boards),
    staleTime: SNAPSHOT_STALE_MS,
    refetchInterval: SNAPSHOT_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
}

/**
 * Keeps the dashboard fresh while people work on the boards.
 *
 * With Supabase this listens to every table the snapshot is read from and
 * invalidates it once per burst of events. RLS applies to Realtime, so a reader
 * only hears about rows they could select, which is the same set the snapshot
 * holds. In local mode the BroadcastChannel sync (src/features/data/local-realtime-sync.tsx)
 * invalidates the same key.
 */
export function useDashboardRealtime(workspaceId: string | null): void {
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!workspaceId || providerKind !== "supabase") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = getSupabaseClient();
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
      }, COALESCE_MS);
    };
    const channel = supabase.channel(`dashboard:${workspaceId}`);
    // `workspaces` and `workspace_lists` are here because the dashboard is not
    // drawn from rows alone. The output rates that turn deliverables into hours
    // live on the workspace, and the asset types the effort figure is keyed by
    // live in the list — so renaming a type or correcting a rate changes what
    // the page says without touching a single item. Left out, those two edits
    // showed up only when the sixty-second safety refresh came round.
    for (const table of ["items", "item_column_values", "item_assets", "board_groups", "board_columns", "boards", "teams", "item_links", "workspaces", "workspace_lists"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, schedule);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, providerKind, queryClient]);
}

/** The workspace dashboard's link and the mutations that shape it. */
export function useDashboardShare(workspaceId: string) {
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.dashboardShare(workspaceId);

  const share = useQuery({ queryKey: key, queryFn: () => services.dashboard.getShare(workspaceId), staleTime: 60_000 });
  const settled = { onSettled: () => queryClient.invalidateQueries({ queryKey: key }) };
  const failed = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const save = useMutation({
    mutationFn: (settings: DashboardShareSettings) => services.dashboard.saveShare(workspaceId, user.id, settings),
    onSuccess: (next) => queryClient.setQueryData(key, next),
    onError: failed("Could not change the link"),
    ...settled,
  });
  const regenerate = useMutation({
    mutationFn: () => services.dashboard.regenerateShare(workspaceId, user.id),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      toast.success("New link ready. The old one no longer opens the dashboard.");
    },
    onError: failed("Could not create a new link"),
    ...settled,
  });
  const stop = useMutation({
    mutationFn: () => services.dashboard.removeShare(workspaceId),
    onSuccess: () => {
      queryClient.setQueryData(key, null);
      toast.success("Sharing stopped");
    },
    onError: failed("Could not stop sharing"),
    ...settled,
  });

  return { share, save, regenerate, stop };
}

/** The current date as yyyy-mm-dd, re-rendering when the day rolls over so a screen left running stays right. */
export function useToday(): string {
  const [today, setToday] = React.useState(() => localISODate(new Date()));
  React.useEffect(() => {
    const id = window.setInterval(() => {
      const next = localISODate(new Date());
      setToday((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

function localISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "just now", "12s ago", "3m ago" — re-rendered every few seconds. */
export function useAgo(timestamp: number | null): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);
  if (!timestamp) return "";
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 8) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

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

/**
 * A safety net under realtime: even a silent channel refreshes the figures this
 * often.
 *
 * A minute, not the fifteen seconds it was. The snapshot is the whole workspace
 * — every board's items, values and asset lines, four and a half megabytes of
 * it on this data — and realtime already invalidates within a second of any
 * change, so the timer is not what keeps the page current. It is only there for
 * the events realtime cannot deliver: a dropped channel, a row an RLS policy
 * filtered out, a change made straight against the database. Reading the whole
 * workspace four times a minute against that was costing tens of gigabytes of
 * egress a day per open tab.
 */
const SNAPSHOT_REFRESH_MS = 60_000;
/** How long a page that only borrows a panel off the snapshot keeps it. */
const BORROWED_STALE_MS = 60_000;
/**
 * One write often produces several row events; refetch once for the burst.
 *
 * Two seconds rather than two hundred milliseconds. Dragging a row, pasting a
 * column or running an import emits events for as long as it takes, and at the
 * shorter window each lull inside that produced its own full re-read of the
 * workspace. Two seconds turns a minute of editing into a handful of reads
 * instead of a few hundred, at the cost of the figures trailing the work by a
 * second or so — which nobody watching a total can see.
 */
const COALESCE_MS = 2_000;
/**
 * The least time between two reads of the snapshot, however much is happening.
 *
 * Coalescing bounds one burst; this bounds a long run of them. Without it a
 * board being worked on steadily — an event every few seconds, each one past
 * the coalesce window — puts the whole workspace on the wire again every time.
 */
const MIN_REFETCH_MS = 20_000;

/**
 * Everything the dashboard is drawn from, for the boards the reader can see.
 *
 * `live` is what the dashboard itself wants: nothing trusted for any length of
 * time, because the figures are a live read of the boards and every
 * invalidation realtime sends is meant to be acted on. A page that borrows one
 * panel off this snapshot — a profile's stakeholder split — passes `false`, so
 * one panel does not put a whole workspace read on a fifteen-second loop.
 */
export function useDashboardSnapshot(workspaceId: string, boards: Board[], { live = true }: { live?: boolean } = {}) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.dashboard(workspaceId),
    queryFn: () => services.dashboard.loadSnapshot(workspaceId, boards),
    staleTime: live ? 0 : BORROWED_STALE_MS,
    refetchInterval: live ? SNAPSHOT_REFRESH_MS : false,
    // Not in the background. A tab nobody is looking at has no figures to keep
    // current, and this read is far too big to make on the off chance. Focus
    // brings it back up to date, and realtime covers it while it is being read.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: live,
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
    let lastRead = 0;
    const supabase = getSupabaseClient();
    const read = () => {
      lastRead = Date.now();
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(workspaceId) });
    };
    const schedule = () => {
      // A read already on its way answers this event too, so it rides with it.
      // Deliberately not restarted per event: an import or a long drag emits
      // one every second or so, and a timer that began again each time would
      // never reach the end of the burst and never read at all.
      if (timer) return;
      // Whichever is further off: the end of this burst, or the earliest the
      // snapshot may be read again.
      const wait = Math.max(COALESCE_MS, lastRead + MIN_REFETCH_MS - Date.now());
      timer = setTimeout(() => {
        timer = null;
        read();
      }, wait);
    };
    const channel = supabase.channel(`dashboard:${workspaceId}`);
    // `workspaces` and `workspace_lists` are here because the dashboard is not
    // drawn from rows alone. The output rates that turn deliverables into hours
    // live on the workspace, and the asset types the effort figure is keyed by
    // live in the list — so renaming a type or correcting a rate changes what
    // the page says without touching a single item. Left out, those two edits
    // waited for the safety refresh to come round.
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


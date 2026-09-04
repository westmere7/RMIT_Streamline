"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { getSupabaseClient } from "@/lib/supabase/client";

/** One write often produces several row events; refetch once for the burst. */
const COALESCE_MS = 400;

/**
 * Keeps an open board fresh while other people work on it.
 *
 * With the Supabase provider this subscribes to the tables a board is built
 * from and invalidates the matching queries; RLS applies to Realtime, so a
 * subscriber only receives rows it could select. The tables must be in the
 * `supabase_realtime` publication (supabase/migrations/0004_realtime.sql).
 *
 * Events are coalesced: linking two items or pasting into a row writes to
 * several tables at once, and the echo of the client's own writes arrives here
 * too — refetching per event turns one action into a burst of board reloads.
 *
 * In local mode cross-tab freshness comes from the BroadcastChannel in
 * src/lib/realtime/local-realtime.ts, so this hook does nothing.
 */
export function useBoardRealtime(boardId: string | null): void {
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  useEffect(() => {
    if (!boardId || providerKind !== "supabase") return;

    // Scoped to this subscription, so the cleanup below always sees its own state.
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = getSupabaseClient();
    const flush = () => {
      timer = null;
      const keys = [...pending];
      pending.clear();
      for (const key of keys) {
        if (key === "board") void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(boardId) });
        else void queryClient.invalidateQueries({ queryKey: [key] });
      }
    };
    const schedule = (key: string) => {
      pending.add(key);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, COALESCE_MS);
    };

    const onBoard = () => schedule("board");
    const channel = supabase
      .channel(`board:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `board_id=eq.${boardId}` }, onBoard)
      // Values and comments are keyed by item, not board, so they arrive unfiltered
      // and are narrowed by the snapshot refetch that follows.
      .on("postgres_changes", { event: "*", schema: "public", table: "item_column_values" }, onBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_groups", filter: `board_id=eq.${boardId}` }, onBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns", filter: `board_id=eq.${boardId}` }, onBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => schedule("comments"))
      .on("postgres_changes", { event: "*", schema: "public", table: "item_links" }, () => {
        schedule("item-links");
        schedule("board");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: `board_id=eq.${boardId}` }, () => schedule("activity"))
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => schedule("notifications"))
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      pending.clear();
      void supabase.removeChannel(channel);
    };
  }, [boardId, providerKind, queryClient, user.id]);
}

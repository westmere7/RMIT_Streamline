"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Keeps an open board fresh while other people work on it.
 *
 * With the Supabase provider this subscribes to the tables a board is built
 * from and invalidates the matching queries; RLS applies to Realtime, so a
 * subscriber only receives rows it could select. The tables must be in the
 * `supabase_realtime` publication (supabase/migrations/0004_realtime.sql).
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

    const supabase = getSupabaseClient();
    // Values and comments are keyed by item, not board, so they arrive unfiltered
    // and are narrowed by the snapshot refetch that follows.
    const invalidateBoard = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(boardId) });
    };
    const invalidateActivity = () => {
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    };

    const channel = supabase
      .channel(`board:${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `board_id=eq.${boardId}` }, invalidateBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "item_column_values" }, invalidateBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_groups", filter: `board_id=eq.${boardId}` }, invalidateBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_columns", filter: `board_id=eq.${boardId}` }, invalidateBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["comments"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "item_links" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["item-links"] });
        invalidateBoard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: `board_id=eq.${boardId}` }, invalidateActivity)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [boardId, providerKind, queryClient, user.id]);
}

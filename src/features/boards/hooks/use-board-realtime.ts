"use client";

import { useEffect } from "react";

/**
 * Placeholder for future realtime subscriptions.
 *
 * When the Supabase provider is enabled this hook should:
 *   const channel = supabase.channel(`board:${boardId}`)
 *     .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `board_id=eq.${boardId}` }, invalidateSnapshot)
 *     .on("postgres_changes", { event: "*", schema: "public", table: "item_column_values" }, invalidateSnapshot)
 *     .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, invalidateComments)
 *     .on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: `board_id=eq.${boardId}` }, invalidateActivity)
 *     .subscribe();
 *   return () => supabase.removeChannel(channel);
 *
 * Notifications would use a user-scoped channel on `notifications` (user_id=eq.<uid>).
 * In local mode cross-tab freshness comes from the BroadcastChannel in
 * src/lib/realtime/local-realtime.ts (see LocalRealtimeSync), so this is a no-op.
 */
export function useBoardRealtime(boardId: string | null): void {
  useEffect(() => {
    if (!boardId) return;
    return undefined;
  }, [boardId]);
}

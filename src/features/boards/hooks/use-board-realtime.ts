"use client";

import { useMemo } from "react";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

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
 * Events are coalesced by useRealtime: linking two items or pasting into a row
 * writes to several tables at once, and the echo of the client's own writes
 * arrives here too — refetching per event turns one action into a burst of
 * board reloads.
 *
 * Notifications used to be here as well. They are the shell's business rather
 * than this board's, and hearing about them only while a board happened to be
 * open is why the bell stood still everywhere else; the workspace channel
 * (src/features/workspace/use-workspace-realtime.ts) carries them now.
 *
 * In local mode cross-tab freshness comes from the BroadcastChannel in
 * src/lib/realtime/local-realtime.ts, so this hook does nothing.
 */
export function useBoardRealtime(boardId: string | null): void {
  const bindings = useMemo<RealtimeBinding[]>(() => {
    if (!boardId) return [];
    const board = `board_id=eq.${boardId}`;
    const snapshot = queryKeys.boardSnapshot(boardId);
    // Archiving or deleting a row moves it between the board and its archive,
    // so both the count beside Archive and any open archive page follow it.
    const archive = [queryKeys.boardArchiveCount(boardId), ["board-archive"] as const];
    return [
      { table: "items", filter: board, keys: [snapshot, ...archive] },
      // A value is keyed by item and column, neither of which is a board, so the
      // row carries the board it belongs to purely so this filter can exist
      // (supabase/migrations/0036_value_board_id.sql). Without it every cell
      // edit anywhere in the workspace arrived here and cost this board a full
      // snapshot refetch — someone else's keystroke, on a board nobody here is
      // looking at, reloading this one.
      { table: "item_column_values", filter: board, keys: [snapshot, ["board-archive"]] },
      { table: "board_groups", filter: board, keys: [snapshot] },
      { table: "board_columns", filter: board, keys: [snapshot, ["board-archive"]] },
      // Comments are still unfiltered: they are keyed by item, the badge counts
      // are a small read, and a board's updates are not a stream anyone edits
      // at speed.
      { table: "comments", keys: [["comments"]] },
      { table: "comment_reactions", keys: [["comments"]] },
      { table: "item_assets", filter: board, keys: [["item-assets"], snapshot] },
      { table: "item_links", keys: [["item-links"], snapshot] },
      { table: "activities", filter: board, keys: [["activity"]] },
    ];
  }, [boardId]);

  useRealtime(boardId ? `board:${boardId}` : null, bindings, { coalesceMs: COALESCE_MS });
}

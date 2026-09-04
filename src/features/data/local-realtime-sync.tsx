"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { subscribeDataChanges, type DataChange } from "@/lib/realtime/local-realtime";

/**
 * Keeps this tab in step with writes made in other tabs (local mode's stand-in
 * for realtime). Mounted once inside the QueryClientProvider; it only marks
 * queries stale, so views that are on screen refetch and hidden ones refetch
 * when they next mount.
 */
export function LocalRealtimeSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    return subscribeDataChanges((change: DataChange) => {
      const kinds = new Set(change.kinds);
      const invalidate = (key: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey: key });
      if (kinds.has("board") || kinds.has("items") || kinds.has("links")) {
        // Linked items mirror across boards, so refresh every snapshot rather than just the named ones.
        invalidate(["board-snapshot"]);
        invalidate(["item-links"]);
        invalidate(["link-candidates"]);
        invalidate(["my-work"]);
        invalidate(["activity"]);
        invalidate(["notifications"]);
      }
      if (kinds.has("comments")) {
        invalidate(["comments"]);
        invalidate(["activity"]);
        invalidate(["notifications"]);
      }
      if (kinds.has("workspace")) {
        invalidate(["workspace-context"]);
        invalidate(["boards"]);
        invalidate(["board-members"]);
        invalidate(["favourites"]);
        invalidate(["teams"]);
      }
    });
  }, [queryClient]);
  return null;
}

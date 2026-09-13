"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { subscribeDataChanges, type DataChange } from "@/lib/realtime/local-realtime";

/**
 * Keeps this tab in step with writes made in other tabs (local mode's stand-in
 * for realtime). Mounted once inside the QueryClientProvider; it only marks
 * queries stale, so views that are on screen refetch and hidden ones refetch
 * when they next mount.
 *
 * The keys here are the local-mode half of the same map the Supabase channels
 * describe: whatever one of them refreshes, the matching kind here refreshes
 * too, so a surface is never live under one provider and stale under the other.
 */
export function LocalRealtimeSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    return subscribeDataChanges((change: DataChange) => {
      const kinds = new Set(change.kinds);
      const invalidate = (key: readonly unknown[]) => void queryClient.invalidateQueries({ queryKey: key });
      if (kinds.has("board") || kinds.has("items") || kinds.has("links") || kinds.has("assets") || kinds.has("workspace")) {
        // The dashboard sums up every board, so anything that moves a task, a line or a team refreshes it.
        invalidate(["dashboard"]);
      }
      if (kinds.has("board") || kinds.has("items") || kinds.has("links")) {
        // Linked items mirror across boards, so refresh every snapshot rather than just the named ones.
        invalidate(["board-snapshot"]);
        invalidate(["item-links"]);
        invalidate(["link-candidates"]);
        invalidate(["my-work"]);
        invalidate(["activity"]);
        invalidate(["notifications"]);
        // An item archived, restored or deleted in another tab is a row that has
        // moved between the board and its archive.
        invalidate(["board-archive"]);
        invalidate(["board-archive-count"]);
      }
      if (kinds.has("messages")) {
        invalidate(["message-thread"]);
        invalidate(["message-threads"]);
        invalidate(["unread-messages"]);
      }
      if (kinds.has("comments")) {
        invalidate(["comments"]);
        invalidate(["activity"]);
        invalidate(["notifications"]);
        // Which updates the reader has caught up on, for the unread dot.
        invalidate(["item-reads"]);
      }
      if (kinds.has("assets")) {
        invalidate(["item-assets"]);
      }
      if (kinds.has("trackers")) {
        invalidate(["trackers"]);
        invalidate(["tracker"]);
        invalidate(["tracker-sheets"]);
      }
      if (kinds.has("workspace")) {
        invalidate(["workspace"]);
        invalidate(["workspace-context"]);
        invalidate(["workspace-members"]);
        invalidate(["workspace-invitations"]);
        invalidate(["workspace-lists"]);
        invalidate(["boards"]);
        invalidate(["board-members"]);
        invalidate(["favourites"]);
        invalidate(["teams"]);
        // A name or an avatar, which the shell and every profile page show.
        invalidate(["current-user"]);
        invalidate(["profile"]);
        invalidate(["notification-preferences"]);
      }
      if (kinds.has("settings")) {
        // The portal card and the booking editor: the link, its settings, the
        // templates and blocks the workspace keeps by name.
        invalidate(["portals"]);
        invalidate(["booking-form"]);
        invalidate(["booking-templates"]);
        invalidate(["booking-saved-blocks"]);
      }
    });
  }, [queryClient]);
  return null;
}

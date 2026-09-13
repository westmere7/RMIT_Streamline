"use client";

import { useMemo } from "react";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";

/**
 * The workspace's own live wiring: everything the shell shows, on every page.
 *
 * The board, the dashboard and My Work each subscribe to the rows they are
 * drawn from, and did so already. What had no subscription at all was the
 * frame around them — who is in the workspace, which boards exist, what a
 * colleague is called, the two badges in the corner. Those only moved when the
 * page was reloaded, which is exactly the refresh this is meant to remove.
 *
 * Only low-traffic tables belong here, because this channel is open on every
 * page. A membership, a team, a board, a name: things that change a few times a
 * day. Items and their values are deliberately absent — the board and the
 * dashboard subscribe to those, with a filter, while they are on screen.
 *
 * Mounted once, by WorkspaceProvider.
 */
export function useWorkspaceRealtime(workspaceId: string, userId: string): void {
  const bindings = useMemo<RealtimeBinding[]>(() => {
    const ws = `workspace_id=eq.${workspaceId}`;
    const me = `user_id=eq.${userId}`;
    const context = queryKeys.workspaceContext(workspaceId);
    return [
      // Name, rates and the booking key all live on the workspace row, and the
      // dashboard turns the rates into hours.
      { table: "workspaces", filter: `id=eq.${workspaceId}`, keys: [context, ["workspace"]] },
      // Someone invited, onboarded, promoted or deactivated: the people picker,
      // the members page and this reader's own permissions all change.
      { table: "workspace_members", filter: ws, keys: [context, ["workspace-members"]] },
      { table: "workspace_invitations", filter: ws, keys: [queryKeys.workspaceInvitations(workspaceId)] },
      // A profile is a name and an avatar on every board, every comment and
      // every assignment. Unfiltered because a profile row is keyed by the
      // person, not the workspace; RLS narrows it to colleagues.
      { table: "profiles", keys: [context, ["current-user"], ["profile"]] },
      { table: "teams", filter: ws, keys: [context, ["teams"]] },
      // No workspace column on either — both hang off a team or a board — so
      // RLS is what scopes them.
      { table: "team_members", keys: [context] },
      { table: "board_members", keys: [queryKeys.boardMembersAll(workspaceId), ["board-members"]] },
      { table: "boards", filter: ws, keys: [queryKeys.boards(workspaceId), context] },
      { table: "board_favourites", filter: me, keys: [queryKeys.favourites(userId)] },
      // The workspace's vocabulary: asset types, stakeholder groups. Renaming
      // one rewrites what every board and the dashboard say.
      { table: "workspace_lists", filter: ws, keys: [queryKeys.workspaceLists(workspaceId), ["board-snapshot"], ["item-assets"]] },
      // The bell, anywhere in the app rather than only on a board.
      { table: "notifications", filter: me, keys: [queryKeys.notifications(userId)] },
      { table: "notification_preferences", filter: me, keys: [queryKeys.notificationPreferences(userId)] },
      // The message badge in the user menu, which is on screen everywhere; the
      // thread itself is open on one page and rides along with it.
      { table: "direct_messages", filter: `recipient_id=eq.${userId}`, keys: [["message-thread"], ["message-threads"], ["unread-messages"]] },
      // A second filter rather than a second condition: `postgres_changes`
      // takes one comparison, and a message sent from another tab of this
      // account has to reach this one too.
      { table: "direct_messages", filter: `sender_id=eq.${userId}`, keys: [["message-thread"], ["message-threads"], ["unread-messages"]] },
      // The sidebar lists the workspace's trackers; a sheet's contents are the
      // tracker page's business, not the shell's.
      { table: "trackers", filter: ws, keys: [queryKeys.trackers(workspaceId)] },
      // Which updates this person has caught up on, so the unread dot on a row
      // clears in the tab they did not read it in.
      { table: "item_reads", filter: me, keys: [queryKeys.itemReads(userId)] },
    ];
  }, [workspaceId, userId]);

  useRealtime(workspaceId && userId ? `workspace:${workspaceId}:${userId}` : null, bindings);
}

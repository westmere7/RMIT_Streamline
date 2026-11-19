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
/** The activity that changes how many tasks a board holds. */
const COUNT_EVENTS = ["ITEM_CREATED", "ITEM_MOVED", "ITEM_ARCHIVED", "ITEM_RESTORED", "ITEM_DELETED"] as const;

export function useWorkspaceRealtime(workspaceId: string, userId: string): void {
  const bindings = useMemo<RealtimeBinding[]>(() => {
    const ws = `workspace_id=eq.${workspaceId}`;
    const me = `user_id=eq.${userId}`;
    const context = queryKeys.workspaceContext(workspaceId);
    return [
      // Name, rates and the booking key all live on the workspace row, and the
      // dashboard turns the rates into hours.
      // Also touched when a team is kept to itself (policies/0029): the team's
      // own row is no longer this reader's to hear about, so this is how its
      // boards, trackers and docs leave their screen at once.
      { table: "workspaces", filter: `id=eq.${workspaceId}`, keys: [context, ["workspace"], queryKeys.boards(workspaceId), queryKeys.trackers(workspaceId), queryKeys.docs(workspaceId)] },
      // Someone invited, onboarded, promoted or deactivated: the people picker,
      // the members page and this reader's own permissions all change.
      { table: "workspace_members", filter: ws, keys: [context, ["workspace-members"]] },
      { table: "workspace_invitations", filter: ws, keys: [queryKeys.workspaceInvitations(workspaceId)] },
      // This person's seats in every workspace, and the workspaces themselves:
      // a workspace made by an Owner (every Owner is seated in it), access given
      // elsewhere, or a rename, reach the workspace menu without a reload.
      // RLS limits the workspaces to the ones they can open.
      { table: "workspace_members", filter: me, keys: [["user-workspaces"]] },
      { table: "workspaces", keys: [["user-workspaces"], ["all-workspaces"]] },
      // A profile is a name and an avatar on every board, every comment and
      // every assignment. Unfiltered because a profile row is keyed by the
      // person, not the workspace; RLS narrows it to colleagues.
      { table: "profiles", keys: [context, ["current-user"], ["profile"]] },
      { table: "teams", filter: ws, keys: [context, ["teams"]] },
      // No workspace column on either — both hang off a team or a board — so
      // RLS is what scopes them.
      // Joining or leaving a team, or a board, changes which boards (and, for
      // a team kept to itself, which trackers and docs) this person may read:
      // rows they could not read before are not in hand until read again.
      { table: "team_members", keys: [context, queryKeys.boards(workspaceId), queryKeys.trackers(workspaceId), queryKeys.docs(workspaceId)] },
      { table: "board_members", keys: [queryKeys.boardMembersAll(workspaceId), ["board-members"], queryKeys.boards(workspaceId)] },
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
      // The same for docs: the list, not what is on any one page.
      { table: "docs", filter: ws, keys: [queryKeys.docs(workspaceId)] },
      // Which updates this person has caught up on, so the unread dot on a row
      // clears in the tab they did not read it in.
      { table: "item_reads", filter: me, keys: [queryKeys.itemReads(userId)] },
    ];
  }, [workspaceId, userId]);

  useRealtime(workspaceId && userId ? `workspace:${workspaceId}:${userId}` : null, bindings);

  // The task counts beside each board in the sidebar. A board's own channel
  // refreshes its count only while it is open, so a task allocated to a board
  // nobody here has open never moved the number. Items are far too busy to
  // follow workspace-wide; the activity log is not, once narrowed to the five
  // things that change how many tasks a board holds. RLS sends each person only
  // the rows on boards they can see. Its own channel, so a burst of moves (an
  // allocation run, an import) is one recount, at most every two seconds.
  const countBindings = useMemo<RealtimeBinding[]>(
    () => [
      {
        table: "activities",
        filter: `event_type=in.(${COUNT_EVENTS.join(",")})`,
        insertsOnly: true,
        accept: (row) => row.workspace_id === workspaceId,
        keys: [["board-item-count"]],
      },
    ],
    [workspaceId],
  );
  useRealtime(workspaceId ? `board-counts:${workspaceId}` : null, countBindings, { coalesceMs: 800, minIntervalMs: 2_000 });
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Board, Notification, NotificationPreferences, NotificationPreferencesInput, StoredDelivery, UnreadCounts } from "@/domain";
import { countUnread, defaultNotificationPreferences } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspaceOptional, type WorkspaceContextValue } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";

/** Whether a notification belongs in this workspace's inbox. One that names no workspace shows in every one. */
export function inWorkspace(notification: Pick<Notification, "workspaceId">, workspaceId: string | null | undefined): boolean {
  return !workspaceId || !notification.workspaceId || notification.workspaceId === workspaceId;
}

/**
 * This person's notifications, in the workspace on screen: each workspace keeps
 * its own inbox. One read for all of them, narrowed here, so switching
 * workspace does not refetch.
 */
export function useNotifications(userId: string) {
  const services = useServices();
  const workspaceId = useWorkspaceOptional()?.workspace.id ?? null;
  return useQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: () => services.repos.notifications.listByUser(userId),
    select: (list: Notification[]) => (workspaceId ? list.filter((n) => inWorkspace(n, workspaceId)) : list),
    staleTime: 10_000,
    // A safety net under realtime rather than the thing that delivers.
    // `notifications` is on the workspace channel, filtered to this person
    // (src/features/workspace/use-workspace-realtime.ts), so a mention lands
    // within a second of being written wherever in the app the reader is. This
    // interval is only there for what a websocket cannot cover: a channel that
    // dropped while nobody was looking, or a row written straight against the
    // database. Two minutes rather than thirty seconds for that reason.
    refetchInterval: 120_000,
    // Still polling while the tab is in the background: that is exactly when an
    // operating-system notification is worth raising, and by default TanStack
    // Query stops the interval for a hidden page. The read is a page of one
    // person's notifications, not a workspace, so the background cost is small.
    refetchIntervalInBackground: true,
  });
}

/** A notification that still leads somewhere, and the board it opens on. */
export type InboxNotification = Notification & { target: Board };

/**
 * The notifications that still lead somewhere, with the board each one opens.
 *
 * A notification outlives what it is about on purpose (no foreign key on
 * `entity_id`), so a deleted task, or a board that has gone, would leave a row
 * that opens nothing. Those are left out here, of the inbox and of its badges
 * alike. A task moved to another board opens there, not on the one it left.
 * `data` stays undefined until the tasks have been looked up, so rows do not
 * appear and then vanish.
 */
export function useInboxNotifications(userId: string) {
  const services = useServices();
  const ws = useWorkspaceOptional();
  const notifications = useNotifications(userId);
  const itemIds = React.useMemo(
    () => [...new Set((notifications.data ?? []).filter((n) => n.entityType === "ITEM").map((n) => n.entityId))].sort(),
    [notifications.data],
  );
  const items = useQuery({
    queryKey: ["notification-items", userId, itemIds],
    queryFn: async () => new Map((await services.repos.items.listByIds(itemIds)).map((item) => [item.id, item.boardId])),
    enabled: itemIds.length > 0,
    staleTime: 60_000,
  });
  const data = React.useMemo(() => {
    // Outside a workspace there are no boards to open, so nothing to show.
    if (!notifications.data || !ws) return undefined;
    if (itemIds.length > 0 && items.isPending) return undefined;
    // A failed look-up hides nothing it cannot vouch for: the boards still decide.
    const boardOfItem = items.isSuccess ? items.data : null;
    const reachable: InboxNotification[] = [];
    for (const n of notifications.data) {
      const target = targetBoard(n, ws, boardOfItem);
      if (target) reachable.push({ ...n, target });
    }
    return reachable;
  }, [notifications.data, ws, itemIds.length, items.isPending, items.isSuccess, items.data]);
  return { ...notifications, data, isLoading: notifications.isLoading || (itemIds.length > 0 && items.isPending) };
}

/** The board a notification opens on, or nothing when what it points at is gone. */
function targetBoard(n: Notification, ws: WorkspaceContextValue, boardOfItem: Map<string, string> | null): Board | undefined {
  if (n.entityType === "BOARD") return ws.boardById(n.entityId);
  if (n.entityType === "ITEM" && boardOfItem) {
    const boardId = boardOfItem.get(n.entityId);
    return boardId ? ws.boardById(boardId) : undefined;
  }
  return ws.boardById(n.boardId);
}

/** Unread split the way the two badges show it: loud ones and quiet ones. */
export function useUnreadCounts(userId: string): UnreadCounts {
  const { data } = useInboxNotifications(userId);
  return countUnread(data ?? []);
}

export function useNotificationPreferences(userId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.notificationPreferences(userId),
    queryFn: () => services.notifications.getPreferences(userId),
    staleTime: 60_000,
  });
}

/**
 * Saving preferences also refreshes the inbox: nothing already delivered
 * changes, but the settings screen and the badges read from the same place.
 */
export function useNotificationPreferenceMutations(userId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.notificationPreferences(userId);

  const save = useMutation({
    mutationFn: (patch: NotificationPreferencesInput) => services.notifications.savePreferences(userId, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      const base = previous ?? defaultNotificationPreferences(userId);
      queryClient.setQueryData<NotificationPreferences>(key, {
        ...base,
        ...patch,
        types: { ...base.types, ...(patch.types ?? {}) },
      });
      return { previous };
    },
    onError: (error, _patch, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      toast.error("Could not save your notification settings", { description: error instanceof Error ? error.message : undefined });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const setBoardSubscribed = useMutation({
    mutationFn: ({ boardId, subscribed }: { boardId: string; subscribed: boolean }) =>
      services.notifications.setBoardSubscribed(userId, boardId, subscribed),
    onMutate: async ({ boardId, subscribed }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationPreferences>(key);
      const base = previous ?? defaultNotificationPreferences(userId);
      const muted = new Set(base.mutedBoardIds);
      if (subscribed) muted.delete(boardId);
      else muted.add(boardId);
      queryClient.setQueryData<NotificationPreferences>(key, { ...base, mutedBoardIds: [...muted] });
      return { previous };
    },
    onError: (error, _vars, ctx) => {
      queryClient.setQueryData(key, ctx?.previous);
      toast.error("Could not change your subscription", { description: error instanceof Error ? error.message : undefined });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { save, setBoardSubscribed };
}

export function useNotificationMutations(userId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.notifications(userId);
  const workspaceId = useWorkspaceOptional()?.workspace.id ?? undefined;

  const markRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => services.repos.notifications.markRead(id, read),
    onMutate: async ({ id, read }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notification[]>(key);
      queryClient.setQueryData<Notification[]>(key, (old) =>
        old?.map((n) => (n.id === id ? { ...n, readAt: read ? new Date().toISOString() : null } : n)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  /** Without a delivery this clears both badges; with one it clears just that badge. */
  const markAllRead = useMutation({
    mutationFn: (delivery?: StoredDelivery) => services.repos.notifications.markAllRead(userId, delivery, workspaceId),
    onMutate: async (delivery) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notification[]>(key);
      const now = new Date().toISOString();
      queryClient.setQueryData<Notification[]>(key, (old) =>
        old?.map((n) => (n.readAt || (delivery && n.delivery !== delivery) || !inWorkspace(n, workspaceId) ? n : { ...n, readAt: now })),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  /**
   * Throws them away rather than marking them read.
   *
   * A notification is a record that somebody was told, not the thing they were
   * told about: the task, comment or mention it points at is untouched, which
   * is why clearing is a delete and not an archive. Narrowed to one tab, so
   * clearing the loud list leaves the quiet updates alone.
   */
  const clearAll = useMutation({
    mutationFn: (delivery?: StoredDelivery) => services.repos.notifications.deleteAll(userId, delivery, workspaceId),
    onMutate: async (delivery) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notification[]>(key);
      queryClient.setQueryData<Notification[]>(key, (old) => old?.filter((n) => !inWorkspace(n, workspaceId) || (delivery ? n.delivery !== delivery : false)) ?? []);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { markRead, markAllRead, clearAll };
}

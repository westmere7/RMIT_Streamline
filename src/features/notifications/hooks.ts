"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification, NotificationPreferences, NotificationPreferencesInput, StoredDelivery, UnreadCounts } from "@/domain";
import { countUnread, defaultNotificationPreferences } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

export function useNotifications(userId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: () => services.repos.notifications.listByUser(userId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    // Keep polling while the tab is in the background: that is exactly when an
    // operating-system notification is worth raising, and by default TanStack
    // Query stops the interval for a hidden page.
    refetchIntervalInBackground: true,
  });
}

/** Unread split the way the two badges show it: loud ones and quiet ones. */
export function useUnreadCounts(userId: string): UnreadCounts {
  const { data } = useNotifications(userId);
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
    onError: (_error, _patch, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
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
    onError: (_error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { save, setBoardSubscribed };
}

export function useNotificationMutations(userId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.notifications(userId);

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
    mutationFn: (delivery?: StoredDelivery) => services.repos.notifications.markAllRead(userId, delivery),
    onMutate: async (delivery) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notification[]>(key);
      const now = new Date().toISOString();
      queryClient.setQueryData<Notification[]>(key, (old) =>
        old?.map((n) => (n.readAt || (delivery && n.delivery !== delivery) ? n : { ...n, readAt: now })),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { markRead, markAllRead };
}

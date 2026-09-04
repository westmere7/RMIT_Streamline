"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Notification } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

export function useNotifications(userId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.notifications(userId),
    queryFn: () => services.repos.notifications.listByUser(userId),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useUnreadCount(userId: string): number {
  const { data } = useNotifications(userId);
  return data?.filter((n) => n.readAt === null).length ?? 0;
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

  const markAllRead = useMutation({
    mutationFn: () => services.repos.notifications.markAllRead(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Notification[]>(key);
      const now = new Date().toISOString();
      queryClient.setQueryData<Notification[]>(key, (old) => old?.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { markRead, markAllRead };
}

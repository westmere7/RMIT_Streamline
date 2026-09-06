"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import type { Comment, Notification } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useNotifications } from "@/features/notifications/hooks";
import { queryKeys } from "@/lib/query/keys";

/**
 * How many updates an item has, and whether any are new to this person.
 *
 * "New" means: written by someone else, and newer than both the moment the
 * person last opened the item's updates and any notification about the item
 * they have already read (in the Inbox, say). So catching up anywhere counts.
 */
export interface ItemUpdatesSummary {
  count: number;
  unread: number;
}

export function summarizeUpdates(
  comments: readonly Comment[],
  userId: string,
  seenAt: Readonly<Record<string, string>>,
  notifications: readonly Pick<Notification, "entityType" | "entityId" | "readAt">[],
): Map<string, ItemUpdatesSummary> {
  // The latest read notification per item pushes the "caught up" moment forward.
  const readAt = new Map<string, string>();
  for (const n of notifications) {
    if (n.entityType !== "ITEM" || !n.readAt) continue;
    const previous = readAt.get(n.entityId);
    if (!previous || n.readAt > previous) readAt.set(n.entityId, n.readAt);
  }
  const caughtUp = (itemId: string): string => {
    const seen = seenAt[itemId] ?? "";
    const read = readAt.get(itemId) ?? "";
    return seen > read ? seen : read;
  };

  const result = new Map<string, ItemUpdatesSummary>();
  for (const comment of comments) {
    const entry = result.get(comment.itemId) ?? { count: 0, unread: 0 };
    entry.count++;
    if (comment.authorId !== userId && comment.createdAt > caughtUp(comment.itemId)) entry.unread++;
    result.set(comment.itemId, entry);
  }
  return result;
}

export function useItemReads() {
  const services = useServices();
  const user = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.itemReads(user.id),
    queryFn: () => services.repos.itemReads.listByUser(user.id),
    staleTime: 30_000,
    // A database that has not had the item_reads migration yet must not break
    // the board: no markers simply means nothing has been seen.
    retry: false,
  });
}

/** Per-item update counts for every item on a board, ready for the badges. */
export function useBoardUpdates(boardId: string, itemIds: readonly string[]): Map<string, ItemUpdatesSummary> {
  const services = useServices();
  const user = useCurrentUser();
  const key = itemIds.join(",");
  const comments = useQuery({
    queryKey: [...queryKeys.boardComments(boardId), key],
    queryFn: () => services.repos.comments.listByItems([...itemIds]),
    enabled: itemIds.length > 0,
    staleTime: 15_000,
  });
  const reads = useItemReads();
  const notifications = useNotifications(user.id);
  return React.useMemo(
    () => summarizeUpdates(comments.data ?? [], user.id, reads.data ?? {}, notifications.data ?? []),
    [comments.data, user.id, reads.data, notifications.data],
  );
}

/** Records that the person has now seen an item's updates. */
export function useMarkItemSeen() {
  const services = useServices();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => {
      const seenAt = new Date().toISOString();
      return services.repos.itemReads.markSeen(user.id, itemId, seenAt).then(() => ({ itemId, seenAt }));
    },
    onSuccess: ({ itemId, seenAt }) => {
      queryClient.setQueryData<Record<string, string>>(queryKeys.itemReads(user.id), (old = {}) => ({ ...old, [itemId]: seenAt }));
    },
    // Bookkeeping only: if the marker cannot be saved (say the table is not
    // there yet), the badge stays red a little longer. Not worth interrupting anyone.
    onError: (error) => console.warn("[updates] could not record item as seen", error),
  });
}

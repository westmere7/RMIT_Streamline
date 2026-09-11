"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { ArchiveRequest } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";

/**
 * The request as a cache key.
 *
 * Every field of it changes which rows come back, so every field is in the key:
 * a page is a read of its own, and going back to page one has to be the same
 * read it was the first time.
 */
export function archiveRequestKey(request: ArchiveRequest, focusItemId: string | null): string {
  const { search, filters, sort, page, pageSize } = request;
  return JSON.stringify([
    search.trim().toLowerCase(),
    filters.groupIds,
    filters.personIds,
    filters.statusIds,
    filters.priorityIds,
    filters.tags,
    sort.field,
    sort.direction,
    page,
    pageSize,
    focusItemId,
  ]);
}

/**
 * One page of a board's archive.
 *
 * `placeholderData` keeps the page that is on screen while the next one is
 * fetched, so paging through an archive does not blank the table between
 * clicks — only the pager and the row area dim.
 */
export function useArchivePage(boardId: string, request: ArchiveRequest, focusItemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.boardArchive(boardId, archiveRequestKey(request, focusItemId)),
    queryFn: () => services.items.loadArchivePage(boardId, request, { focusItemId }),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

/** How many items a board has in its archive; a count, not the rows. */
export function useArchiveCount(boardId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.boardArchiveCount(boardId ?? ""),
    queryFn: () => services.items.countArchived(boardId!),
    enabled: !!boardId,
    staleTime: 60_000,
  });
}

/**
 * Restoring and deleting, the only two things the archive can do to a row.
 *
 * Both change what the board holds as well as what the archive holds, so both
 * invalidate the board behind them; neither is optimistic, because a row
 * leaving the page it is on changes the count and the pages after it, and
 * guessing at that is worse than a moment's wait.
 */
export function useArchiveMutations(boardId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const ws = useWorkspace();

  const invalidate = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["board-archive"] });
    void queryClient.invalidateQueries({ queryKey: ["board-archive-count"] });
    void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(ws.workspace.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.myWork(ws.workspace.id, user.id) });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    publishDataChange({ boardIds: [boardId], kinds: ["board", "items"] });
  }, [queryClient, ws.workspace.id, user.id, boardId]);

  const restore = useMutation({
    mutationFn: (itemIds: string[]) => services.items.restoreItems(itemIds, user.id),
    onSuccess: async (_result, itemIds) => {
      await invalidate();
      toast.success(itemIds.length === 1 ? "Item restored to the board" : `${itemIds.length} items restored to the board`);
    },
    onError: (error) => toast.error("Could not restore", { description: error instanceof Error ? error.message : undefined }),
  });

  const remove = useMutation({
    mutationFn: (itemIds: string[]) => services.items.deleteItems(boardId, itemIds, user.id),
    onSuccess: async (_result, itemIds) => {
      await invalidate();
      toast.success(itemIds.length === 1 ? "Item deleted" : `${itemIds.length} items deleted`);
    },
    onError: (error) => toast.error("Could not delete", { description: error instanceof Error ? error.message : undefined }),
  });

  return { restore, remove };
}

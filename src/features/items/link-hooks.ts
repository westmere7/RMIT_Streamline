"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { ColumnPair } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import type { LinkOptions } from "@/services";

/** One write often produces several row events; refetch once for the burst. */
const COALESCE_MS = 200;

/**
 * The items this one is linked to, as the panel previews them: name, status,
 * date, who is on it, and how many fields the two boards keep in step.
 *
 * Every one of those lives on the *other* board, which is the board this reader
 * is not looking at — so nothing about it arrives through the board's own
 * realtime, and the preview would sit at whatever it said when the panel opened.
 * It listens for itself instead.
 */
export function useItemLinks(itemId: string | null) {
  const services = useServices();
  useItemLinksRealtime(itemId);
  return useQuery({
    queryKey: queryKeys.itemLinks(itemId ?? ""),
    queryFn: () => services.links.listForItem(itemId!),
    enabled: !!itemId,
    // A preview of somebody else's row is worth nothing stale: it is on screen
    // precisely to say what that row says now.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Re-reads the previews when the rows behind them move.
 *
 * Unfiltered, because the item on the other end is on a board this subscription
 * has no id for — the refetch that follows is what narrows it. RLS applies to
 * Realtime, so a reader only hears about rows they could select anyway. Column
 * changes go to the mapping too: "syncs 8 fields · 2 not on that board" is
 * counted from the two boards' columns, so adding one on either side changes it.
 */
function useItemLinksRealtime(itemId: string | null): void {
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!itemId) return [];
    const links = [queryKeys.itemLinks(itemId)];
    // A column added and a value written in the same burst must still re-count
    // the mapping, so the column binding names both keys rather than a flag
    // remembered across the burst.
    return [
      { table: "item_column_values", keys: links },
      { table: "items", keys: links },
      { table: "item_links", keys: links },
      { table: "item_assets", keys: links },
      { table: "board_columns", keys: [...links, ["link-mapping"]] },
    ];
  }, [itemId]);
  useRealtime(itemId ? `item-links:${itemId}` : null, bindings, { coalesceMs: COALESCE_MS });
}

/** Items on other boards matching `query`; an empty query lists recent items so the dialog is never blank. */
export function useLinkCandidates(itemId: string, query: string, boardId: string | null, enabled: boolean) {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.linkCandidates(ws.workspace.id, itemId, query, boardId),
    queryFn: () => services.links.searchCandidates(ws.workspace.id, itemId, query, { boardId }),
    enabled,
    staleTime: 5_000,
    placeholderData: (previous) => previous,
  });
}

export function useLinkMapping(boardId: string, otherBoardId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.linkMapping(boardId, otherBoardId ?? ""),
    queryFn: () => services.links.previewMapping(boardId, otherBoardId!),
    enabled: !!otherBoardId,
    staleTime: 30_000,
  });
}

export function useLinkMutations(itemId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();

  /**
   * Both boards changed, so every snapshot and link list may be stale. None of it
   * is awaited: the dialog closes as soon as the write lands and the panel fills
   * in behind it, rather than holding a spinner open for a round-trip it does not
   * need.
   */
  const settle = async () => {
    void queryClient.invalidateQueries({ queryKey: ["item-links"] });
    void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
    // Mark the search cache stale without re-running it: the dialog is closing.
    void queryClient.invalidateQueries({ queryKey: ["link-candidates"], refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    publishDataChange({ itemIds: [itemId], kinds: ["links", "items"] });
  };

  const link = useMutation({
    mutationFn: ({ targetId, options }: { targetId: string; options: LinkOptions }) => services.links.link(itemId, targetId, user.id, options),
    onSuccess: () =>
      toast.success("Items linked", {
        description: "Changes to either item now stay in sync.",
      }),
    onError: (error) =>
      toast.error("Could not link the items", {
        description: error instanceof Error ? error.message : undefined,
      }),
    onSettled: settle,
  });

  const updateSync = useMutation({
    mutationFn: ({ linkId, excluded }: { linkId: string; excluded: string[] }) => services.links.setExcluded(linkId, excluded, itemId, user.id),
    onError: (error) => toast.error("Could not update the link", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  const updatePairs = useMutation({
    mutationFn: ({ linkId, pairs }: { linkId: string; pairs: ColumnPair[] }) => services.links.setPairs(linkId, pairs, itemId, user.id),
    onError: (error) => toast.error("Could not pair the columns", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  const unlink = useMutation({
    mutationFn: (linkId: string) => services.links.unlink(linkId, user.id),
    onSuccess: () => toast.success("Items unlinked"),
    onError: (error) =>
      toast.error("Could not unlink the items", {
        description: error instanceof Error ? error.message : undefined,
      }),
    onSettled: settle,
  });

  return { link, unlink, updateSync, updatePairs };
}

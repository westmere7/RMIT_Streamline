"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import type { LinkOptions } from "@/services";

export function useItemLinks(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.itemLinks(itemId ?? ""),
    queryFn: () => services.links.listForItem(itemId!),
    enabled: !!itemId,
    staleTime: 5_000,
  });
}

/** Items on other boards matching `query`; an empty query lists recent items so the dialog is never blank. */
export function useLinkCandidates(itemId: string, query: string, enabled: boolean) {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.linkCandidates(ws.workspace.id, itemId, query),
    queryFn: () => services.links.searchCandidates(ws.workspace.id, itemId, query),
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

  // Both boards changed, so every snapshot and link list may be stale.
  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: ["item-links"] });
    void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["link-candidates"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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

  const unlink = useMutation({
    mutationFn: (linkId: string) => services.links.unlink(linkId, user.id),
    onSuccess: () => toast.success("Items unlinked"),
    onError: (error) =>
      toast.error("Could not unlink the items", {
        description: error instanceof Error ? error.message : undefined,
      }),
    onSettled: settle,
  });

  return { link, unlink };
}

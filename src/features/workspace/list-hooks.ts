"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TagOption, WorkspaceListKey, WorkspaceLists } from "@/domain";
import { WORKSPACE_LIST_KEYS, WORKSPACE_LIST_META } from "@/domain";
import { useServices } from "@/features/data/data-context";
import type { RemoveListOption } from "@/services";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";

/** The built-in lists, for the moment before the stored ones arrive. */
const FALLBACK: WorkspaceLists = Object.fromEntries(WORKSPACE_LIST_KEYS.map((key) => [key, WORKSPACE_LIST_META[key].defaults.map((o) => ({ ...o }))])) as WorkspaceLists;

/** Every list the workspace defines. Shared by the settings page and every picker that offers one. */
export function useWorkspaceLists(workspaceId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.workspaceLists(workspaceId),
    queryFn: () => services.lists.lists(workspaceId),
    staleTime: 60_000,
  });
}

/** One list, with the built-in defaults standing in until the stored ones load. */
export function useWorkspaceList(workspaceId: string, key: WorkspaceListKey): TagOption[] {
  return useWorkspaceLists(workspaceId).data?.[key] ?? FALLBACK[key];
}

export function useWorkspaceListMutations(workspaceId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.workspaceLists(workspaceId);

  const settle = (lists: WorkspaceLists) => {
    queryClient.setQueryData(key, lists);
    // A list is the workspace's vocabulary: the boards read it too.
    void queryClient.invalidateQueries({ queryKey: ["item-assets"] });
    void queryClient.invalidateQueries({ queryKey: ["board-snapshot"] });
    publishDataChange({ kinds: ["board"] });
  };
  const failed = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const save = useMutation({
    mutationFn: ({ listKey, options, renames }: { listKey: WorkspaceListKey; options: TagOption[]; renames?: Record<string, string> }) =>
      services.lists.save(workspaceId, listKey, options, renames),
    onSuccess: settle,
    onError: failed("Could not save the list"),
  });

  const remove = useMutation({
    mutationFn: ({ listKey, name, options }: { listKey: WorkspaceListKey; name: string; options?: RemoveListOption }) => services.lists.remove(workspaceId, listKey, name, options),
    onSuccess: settle,
    onError: failed("Could not remove it from the list"),
  });

  return { save, remove };
}

/** How many things still carry an option, asked as its delete dialog opens. */
export function useListOptionUsage(workspaceId: string, listKey: WorkspaceListKey, name: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: [...queryKeys.workspaceLists(workspaceId), "usage", listKey, name ?? ""],
    queryFn: () => services.lists.usage(workspaceId, listKey, name!),
    enabled: !!name,
    staleTime: 0,
  });
}

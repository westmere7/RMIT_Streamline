"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Comment } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId, nowIso } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";

export function useComments(itemId: string | null) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.comments(itemId ?? ""),
    queryFn: () => services.comments.listByItem(itemId!),
    enabled: !!itemId,
    staleTime: 5_000,
  });
}

export function useCommentMutations(itemId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const ws = useWorkspace();
  const key = queryKeys.comments(itemId);

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
  };

  const add = useMutation({
    mutationFn: (body: string) => services.comments.addComment(itemId, body, user.id, ws.users),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Comment[]>(key);
      const temp: Comment = { id: newId(), itemId, authorId: user.id, body, mentionUserIds: [], createdAt: nowIso(), updatedAt: nowIso() };
      queryClient.setQueryData<Comment[]>(key, (old = []) => [...old, temp]);
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not post the update");
    },
    onSettled: settle,
  });

  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => services.comments.editComment(id, body, ws.users),
    onMutate: async ({ id, body }) => {
      const previous = queryClient.getQueryData<Comment[]>(key);
      queryClient.setQueryData<Comment[]>(key, (old) => old?.map((c) => (c.id === id ? { ...c, body, updatedAt: nowIso() } : c)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (id: string) => services.comments.deleteComment(id),
    onMutate: async (id) => {
      const previous = queryClient.getQueryData<Comment[]>(key);
      queryClient.setQueryData<Comment[]>(key, (old) => old?.filter((c) => c.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: settle,
  });

  return { add, edit, remove };
}

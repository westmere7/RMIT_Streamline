"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { withReaction, type Comment } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useAutomationNudge } from "@/features/automations/hooks";
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
  const nudgeAutomations = useAutomationNudge();

  const settle = async () => {
    // A comment is a trigger too ("when an update is posted"), so the runner
    // is asked to look now rather than at its next tick — and before the
    // refetch below is awaited, because nothing about the nudge depends on it.
    nudgeAutomations();
    await queryClient.invalidateQueries({ queryKey: key });
    // A comment sent to linked items changes their threads as well.
    void queryClient.invalidateQueries({ queryKey: ["comments"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
  };

  const add = useMutation({
    mutationFn: ({ body, alsoLinked }: { body: string; alsoLinked?: boolean }) =>
      services.comments.addComment(itemId, body, user.id, ws.users, { alsoLinked }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Comment[]>(key);
      const temp: Comment = { id: newId(), itemId, authorId: user.id, body, mentionUserIds: [], sharedId: null, createdAt: nowIso(), updatedAt: nowIso() };
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

  // One level deep: the service files a reply to a reply under the same update.
  const reply = useMutation({
    mutationFn: ({ parentId, body }: { parentId: string; body: string }) => services.comments.replyToComment(itemId, parentId, body, user.id, ws.users),
    onMutate: async ({ parentId, body }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Comment[]>(key);
      const parent = previous?.find((c) => c.id === parentId);
      const temp: Comment = { id: newId(), itemId, authorId: user.id, body, mentionUserIds: [], sharedId: null, parentId: parent?.parentId ?? parentId, createdAt: nowIso(), updatedAt: nowIso() };
      queryClient.setQueryData<Comment[]>(key, (old = []) => [...old, temp]);
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not post the reply");
    },
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (comment: Pick<Comment, "id" | "sharedId" | "itemId">) => services.comments.deleteComment(comment),
    onMutate: async (comment) => {
      const previous = queryClient.getQueryData<Comment[]>(key);
      // Its replies go with it.
      queryClient.setQueryData<Comment[]>(key, (old) => old?.filter((c) => c.id !== comment.id && c.parentId !== comment.id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: settle,
  });

  // Shown at once and settled quietly: a reaction is not a trigger, and it is nobody's news.
  const react = useMutation({
    mutationFn: ({ comment, emoji, on }: { comment: Pick<Comment, "id" | "itemId">; emoji: string; on: boolean }) => services.comments.setReaction(comment, emoji, user.id, on),
    onMutate: async ({ comment, emoji, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Comment[]>(key);
      queryClient.setQueryData<Comment[]>(key, (old) => old?.map((c) => (c.id === comment.id ? { ...c, reactions: withReaction(c.reactions, user.id, emoji, on, nowIso()) } : c)));
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not save the reaction");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
      publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
    },
  });

  return { add, edit, reply, remove, react };
}

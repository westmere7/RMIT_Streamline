"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { withCheck, withReaction, type Comment, type CommentPinState } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useAutomationNudge } from "@/features/automations/hooks";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId, nowIso } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { lastSave, quickSave, savesPending } from "@/lib/query/quick-saves";
import { useBatchedWrites } from "@/lib/query/use-batched-writes";
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

/** How long a checklist tick waits for more ticks before they are saved. */
export const CHECK_SAVE_DELAY_MS = 600;

type CheckWrite = { comment: Pick<Comment, "id" | "itemId" | "sharedId" | "authorId">; box: string; on: boolean; was: boolean };

export function useCommentMutations(itemId: string) {
  const services = useServices();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const ws = useWorkspace();
  const key = queryKeys.comments(itemId);
  const nudgeAutomations = useAutomationNudge();

  // The thread is read back after an action, unless ticks are still being
  // saved: their batch reads it back once they have landed, and a read now
  // would show the boxes as they were before.
  const readThread = () => (checks.busy() ? Promise.resolve() : queryClient.invalidateQueries({ queryKey: key }));

  const settle = async () => {
    // Only the last save on this thread reads it back (see quickSave).
    if (!lastSave(queryClient, key)) return;
    // A comment is a trigger too ("when an update is posted"), so the runner
    // is asked to look now rather than at its next tick — and before the
    // refetch below is awaited, because nothing about the nudge depends on it.
    nudgeAutomations();
    await readThread();
    // A comment sent to linked items changes their threads as well.
    if (!checks.busy()) void queryClient.invalidateQueries({ queryKey: ["comments"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["last-updated"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
  };

  const add = useMutation({
    ...quickSave(key),
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
      if (ctx?.previous && lastSave(queryClient, key)) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not post the update");
    },
    onSettled: settle,
  });

  const edit = useMutation({
    ...quickSave(key),
    mutationFn: ({ id, body }: { id: string; body: string }) => services.comments.editComment(id, body, ws.users, { itemId, actorId: user.id }),
    onMutate: async ({ id, body }) => {
      const previous = queryClient.getQueryData<Comment[]>(key);
      queryClient.setQueryData<Comment[]>(key, (old) => old?.map((c) => (c.id === id ? { ...c, body, updatedAt: nowIso() } : c)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous && lastSave(queryClient, key)) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: settle,
  });

  // One level deep: the service files a reply to a reply under the same update.
  const reply = useMutation({
    ...quickSave(key),
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
      if (ctx?.previous && lastSave(queryClient, key)) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not post the reply");
    },
    onSettled: settle,
  });

  const remove = useMutation({
    ...quickSave(key),
    mutationFn: (comment: Pick<Comment, "id" | "sharedId" | "itemId">) => services.comments.deleteComment(comment),
    onMutate: async (comment) => {
      const previous = queryClient.getQueryData<Comment[]>(key);
      // Its replies go with it.
      queryClient.setQueryData<Comment[]>(key, (old) => old?.filter((c) => c.id !== comment.id && c.parentId !== comment.id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous && lastSave(queryClient, key)) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: settle,
  });

  // Shown at once and settled quietly: a reaction is not a trigger, and it is nobody's news.
  const react = useMutation({
    ...quickSave(key),
    mutationFn: ({ comment, emoji, on }: { comment: Pick<Comment, "id" | "itemId">; emoji: string; on: boolean }) => services.comments.setReaction(comment, emoji, user.id, on),
    onMutate: async ({ comment, emoji, on }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Comment[]>(key);
      queryClient.setQueryData<Comment[]>(key, (old) => old?.map((c) => (c.id === comment.id ? { ...c, reactions: withReaction(c.reactions, user.id, emoji, on, nowIso()) } : c)));
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous && lastSave(queryClient, key)) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not save the reaction");
    },
    onSettled: async () => {
      if (!lastSave(queryClient, key)) return;
      await readThread();
      publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
    },
  });

  // Ticks are shown at once and saved in batches: ticking down a list sends
  // one save per box that changed (none for a box ticked and unticked again)
  // and reads the thread back once, after the last has landed.
  const checks = useBatchedWrites<CheckWrite>({
    queryKey: key,
    delayMs: CHECK_SAVE_DELAY_MS,
    merge: (earlier, later) => ({ ...later, was: earlier.was }),
    send: (_id, write) => (write.on === write.was ? Promise.resolve() : services.comments.setCheck(write.comment, write.box, user.id, write.on)),
    onDrained: (failed) => {
      if (failed) toast.error(failed === 1 ? "Could not save a tick" : `Could not save ${failed} ticks`);
      // A post or reaction still saving reads the thread back when it lands.
      if (savesPending(queryClient, key)) return;
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ["comments"] });
      publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
    },
  });
  const check = {
    mutate: ({ comment, key: box, on }: { comment: Pick<Comment, "id" | "itemId" | "sharedId" | "authorId">; key: string; on: boolean }) => {
      void queryClient.cancelQueries({ queryKey: key });
      const was = !!queryClient.getQueryData<Comment[]>(key)?.find((c) => c.id === comment.id)?.checks?.some((c) => c.key === box);
      queryClient.setQueryData<Comment[]>(key, (old) => old?.map((c) => (c.id === comment.id ? { ...c, checks: withCheck(c.checks, box, user.id, on, nowIso()) } : c)));
      checks.enqueue(`${comment.id}:${box}`, { comment, box, on, was });
    },
  };

  // Shown at once; the overview pin moves off whichever update had it.
  const pin = useMutation({
    ...quickSave(key),
    mutationFn: ({ comment, state }: { comment: Pick<Comment, "id" | "itemId" | "parentId">; state: CommentPinState }) => services.comments.setPin(comment, user.id, state),
    onMutate: async ({ comment, state }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Comment[]>(key);
      const at = nowIso();
      queryClient.setQueryData<Comment[]>(key, (old) =>
        old?.map((c) => {
          if (c.id === comment.id) return { ...c, pin: state === "none" ? null : { overview: state === "overview", pinnedBy: user.id, pinnedAt: c.pin?.pinnedAt ?? at } };
          return state === "overview" && c.pin?.overview ? { ...c, pin: { ...c.pin, overview: false } } : c;
        }),
      );
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous && lastSave(queryClient, key)) queryClient.setQueryData(key, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not pin the update");
    },
    onSuccess: (_d, { state }) => {
      toast.success(state === "none" ? "Unpinned" : state === "overview" ? "Pinned to overview" : "Pinned");
    },
    onSettled: async () => {
      if (!lastSave(queryClient, key)) return;
      await readThread();
      publishDataChange({ itemIds: [itemId], kinds: ["comments"] });
    },
  });

  return { add, edit, reply, remove, react, check, pin };
}

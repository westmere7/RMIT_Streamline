"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import type { DirectMessage } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useDataContext, useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId, nowIso } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { getSupabaseClient } from "@/lib/supabase/client";

export function useMessageThreads() {
  const services = useServices();
  const ws = useWorkspace();
  const user = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.messageThreads(ws.workspace.id, user.id),
    queryFn: () => services.messages.listThreads(ws.workspace.id, user.id),
    staleTime: 5_000,
  });
}

export function useMessageThread(otherUserId: string | null) {
  const services = useServices();
  const ws = useWorkspace();
  const user = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.messageThread(ws.workspace.id, user.id, otherUserId ?? ""),
    queryFn: () => services.messages.listThread(ws.workspace.id, user.id, otherUserId!),
    enabled: !!otherUserId,
    staleTime: 5_000,
  });
}

/** Unread total for the sidebar badge. */
export function useUnreadMessages() {
  const services = useServices();
  const ws = useWorkspace();
  const user = useCurrentUser();
  return useQuery({
    queryKey: queryKeys.unreadMessages(ws.workspace.id, user.id),
    queryFn: () => services.messages.unreadCount(ws.workspace.id, user.id),
    staleTime: 10_000,
  });
}

export function useMessageMutations(otherUserId: string | null) {
  const services = useServices();
  const queryClient = useQueryClient();
  const ws = useWorkspace();
  const user = useCurrentUser();
  const threadKey = queryKeys.messageThread(ws.workspace.id, user.id, otherUserId ?? "");

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: threadKey });
    void queryClient.invalidateQueries({ queryKey: queryKeys.messageThreads(ws.workspace.id, user.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages(ws.workspace.id, user.id) });
    publishDataChange({ kinds: ["messages"] });
  };

  const send = useMutation({
    mutationFn: (body: string) => services.messages.send(ws.workspace.id, user.id, otherUserId!, body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const previous = queryClient.getQueryData<DirectMessage[]>(threadKey);
      const optimistic: DirectMessage = {
        id: newId(),
        workspaceId: ws.workspace.id,
        senderId: user.id,
        recipientId: otherUserId!,
        body,
        readAt: null,
        createdAt: nowIso(),
      };
      queryClient.setQueryData<DirectMessage[]>(threadKey, (old = []) => [...old, optimistic]);
      return { previous };
    },
    onError: (error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(threadKey, context.previous);
      toast.error("Could not send the message", { description: error instanceof Error ? error.message : undefined });
    },
    onSettled: settle,
  });

  const markRead = useMutation({
    mutationFn: () => services.messages.markRead(ws.workspace.id, user.id, otherUserId!),
    onSettled: settle,
  });

  const remove = useMutation({
    mutationFn: (id: string) => services.messages.deleteMessage(id),
    onError: (error) => toast.error("Could not delete the message", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  return { send, markRead, remove };
}

/**
 * Live delivery for messages addressed to this user. Supabase filters the stream
 * by RLS, so only rows the recipient may read arrive; local mode already syncs
 * across tabs through the BroadcastChannel.
 */
export function useMessageRealtime(): void {
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  const ws = useWorkspace();
  const user = useCurrentUser();

  useEffect(() => {
    if (providerKind !== "supabase") return;
    const supabase = getSupabaseClient();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["message-thread"] });
      void queryClient.invalidateQueries({ queryKey: ["message-threads"] });
      void queryClient.invalidateQueries({ queryKey: ["unread-messages"] });
    };
    const channel = supabase
      .channel(`messages:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [providerKind, queryClient, user.id, ws.workspace.id]);
}

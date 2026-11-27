"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import type { Item } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";

const NONE: ReadonlySet<string> = new Set();

/**
 * Which of a board's tasks wait on their requester. Only tasks booked through
 * the form can, so only they are asked about. Asked again whenever the board's
 * own data moves (`version`): sending back, answering and taking back all
 * change the task's status and post an update, so the board refreshes then.
 */
export function useSentBackItems(boardId: string, items: readonly Item[] | undefined, version: number): ReadonlySet<string> {
  const services = useServices();
  const booked = React.useMemo(() => (items ?? []).filter((item) => item.bookedVia && !item.archivedAt).map((item) => item.id).sort(), [items]);
  const query = useQuery({
    queryKey: ["send-backs", boardId, booked.join(","), version],
    queryFn: () => services.bookingSendBacks.openAmong(booked),
    enabled: booked.length > 0,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
  // The same set while its contents are the same: it is in the board's context,
  // and a new one on every refresh would re-render every row on the board.
  const ids = booked.length === 0 ? NONE : (query.data ?? NONE);
  const key = [...ids].sort().join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the contents, not the set's identity
  return React.useMemo(() => ids, [key]);
}

/** The send-back waiting on this task's requester, for its panel. */
export function useOpenSendBack(itemId: string | null, enabled = true) {
  const services = useServices();
  return useQuery({
    queryKey: ["send-back", itemId],
    queryFn: () => services.bookingSendBacks.openFor(itemId!),
    enabled: !!itemId && enabled,
    staleTime: 15_000,
  });
}

/** Sending back and taking back, with everything that shows either refreshed. */
export function useSendBackMutations(itemId: string) {
  const services = useServices();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  // The send-back posts an update and logs a step of the journey as well: both
  // read again, here, since the local data has no realtime to say so.
  const settled = () => {
    void queryClient.invalidateQueries({ queryKey: ["send-back", itemId] });
    void queryClient.invalidateQueries({ queryKey: ["send-backs"] });
    void queryClient.invalidateQueries({ queryKey: ["comments"] });
    void queryClient.invalidateQueries({ queryKey: ["activity"] });
    void queryClient.invalidateQueries({ queryKey: ["internal-portal"] });
  };
  const send = useMutation({
    mutationFn: (note: string) => services.bookingSendBacks.send(itemId, note, ws.currentUser.id),
    onSettled: settled,
  });
  const cancel = useMutation({
    mutationFn: () => services.bookingSendBacks.cancel(itemId, ws.currentUser.id),
    onSettled: settled,
  });
  return { send, cancel };
}

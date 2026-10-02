"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";

const NONE = new Map<string, string>();

/**
 * When each task on the board last changed status, by task id: how long it has
 * sat where it is. A task whose status has never changed is missing, and has
 * been in its status since it was made.
 *
 * Asked again only when some task's status changes, not on every edit to the
 * board: one small row a task comes back (board_status_since, migration 0104).
 */
export function useStatusSince(enabled: boolean): Map<string, string> {
  const { board, model } = useBoardContext();
  const services = useServices();
  const status = model.statusColumn;
  const signature = React.useMemo(() => {
    if (!status) return "";
    let hash = 5381;
    for (const items of model.itemsByGroup.values()) {
      for (const item of items) {
        const value = model.getValue(item.id, status.id);
        const text = `${item.id}:${value?.type === "STATUS" ? value.labelId : ""};`;
        for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
      }
    }
    return String(hash);
  }, [model, status]);
  const query = useQuery({
    queryKey: ["status-since", board.id, signature],
    queryFn: async () => new Map((await services.repos.activities.listStatusSinceByBoard(board.id)).map((row) => [row.itemId, row.at])),
    enabled: enabled && !!status,
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  return query.data ?? NONE;
}

/** Whole days between an instant and now, never below nought. */
export function daysSince(at: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(at)) / 86_400_000));
}

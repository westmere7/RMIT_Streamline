"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import type { Board, Item } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canViewBoard } from "@/lib/permissions/permissions";

const recentTasksKey = (userId: string) => ["recent-tasks", userId] as const;

/**
 * Notes that this person opened the task, for the recently visited tasks on
 * Home (migration 0124). Once per opening, after the panel has the task.
 * Bookkeeping only: a visit that cannot be saved is not worth interrupting
 * anyone over.
 */
export function useRecordItemVisit(itemId: string, ready: boolean) {
  const services = useServices();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  React.useEffect(() => {
    if (!ready) return;
    services.repos.itemVisits
      .record(user.id, itemId)
      .then(() => queryClient.invalidateQueries({ queryKey: recentTasksKey(user.id) }))
      .catch((error: unknown) => console.warn("[visits] could not record the task visit", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per task opened, not on every service or client identity
  }, [ready, itemId, user.id]);
}

export interface RecentTask {
  item: Item;
  board: Board;
  visitedAt: string;
}

/**
 * The tasks this person opened most recently in this workspace, newest first:
 * still there, not archived, on a board they can still see.
 */
export function useRecentTasks(limit = 6) {
  const services = useServices();
  const ws = useWorkspace();
  const user = useCurrentUser();
  const visits = useQuery({
    queryKey: recentTasksKey(user.id),
    queryFn: async () => {
      // Visits span every workspace, so enough of them to still find `limit` of this one's.
      const recent = await services.repos.itemVisits.listRecent(user.id, 40);
      const items = recent.length ? await services.repos.items.listByIds(recent.map((visit) => visit.itemId)) : [];
      const byId = new Map(items.map((item) => [item.id, item]));
      return recent.flatMap((visit) => {
        const item = byId.get(visit.itemId);
        return item ? [{ item, visitedAt: visit.visitedAt }] : [];
      });
    },
    staleTime: 30_000,
  });
  const data = React.useMemo<RecentTask[] | undefined>(() => {
    if (!visits.data) return undefined;
    const out: RecentTask[] = [];
    for (const { item, visitedAt } of visits.data) {
      if (item.archivedAt) continue;
      const board = ws.boardById(item.boardId);
      if (!board || board.archivedAt || !canViewBoard(ws.permissions, board)) continue;
      out.push({ item, board, visitedAt });
      if (out.length >= limit) break;
    }
    return out;
  }, [visits.data, ws, limit]);
  return { ...visits, data };
}

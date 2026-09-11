"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { Board } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import type { ColorToken } from "@/domain";

/** A board a request can be sent to, under the team that owns it. */
export interface AllocationTarget {
  team: { id: string; name: string; color: ColorToken; icon: string } | null;
  boards: Board[];
}

/**
 * Placing requests with a team, from wherever a manager is looking at them.
 *
 * The detail panel has had this since bookings existed, and it is the right
 * place for one request being read carefully. It is the wrong place for a
 * morning's queue: twenty requests meant twenty panels opened and closed to
 * make twenty one-word decisions. The same move belongs on the row and on the
 * selection, which is where a manager actually is.
 *
 * Allocating *moves* the request onto the chosen board — nothing is copied and
 * nothing is linked, so the task the team works on is the one the stakeholder
 * booked, and it carries its own progress back to the portal.
 */
export function useAllocation() {
  const { board, canEdit, openItem } = useBoardContext();
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();

  const allocate = useMutation({
    mutationFn: async ({ itemIds, boardId }: { itemIds: string[]; boardId: string }) => {
      // One request at a time: the service moves an item and rewrites its
      // group, and a failure halfway through should leave the ones that
      // worked where they were sent rather than rolling the lot back.
      const results = await Promise.all(itemIds.map((id) => services.booking.allocate(id, boardId, user.id)));
      return { target: results[0]!.board, count: results.length };
    },
    onSuccess: async ({ target, count }) => {
      // Whatever was allocated has left this board, so a panel showing one of
      // them has nothing left to show.
      openItem(null);
      publishDataChange({ kinds: ["items", "links", "board"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(board.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(target.id) }),
      ]);
      toast.success(`${count === 1 ? "Moved" : `${count} requests moved`} to ${target.name}`, { description: "Out of the allocation queue." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not allocate the request"),
  });

  /** Every board a request can be sent to, grouped by the team that owns it. */
  const targets = React.useMemo<AllocationTarget[]>(() => {
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
    const teams = ws.teams
      .filter((team) => team.archivedAt === null && !team.system)
      .sort(byName)
      .map((team) => ({
        team: { id: team.id, name: team.name, color: team.color, icon: team.icon },
        boards: ws.boardsForTeam(team.id).filter((b) => !b.system && canViewBoard(ws.permissions, b)).sort(byName),
      }))
      .filter((group) => group.boards.length > 0);
    const loose = ws.boards.filter((b) => b.archivedAt === null && !b.system && !b.teamId && canViewBoard(ws.permissions, b)).sort(byName);
    return loose.length > 0 ? [...teams, { team: null, boards: loose }] : teams;
  }, [ws]);

  /**
   * Only the allocation queue allocates, and only somebody who may edit it.
   *
   * Deliberately not "…and the boards have loaded". The menu has to open the
   * instant it is asked for, so the entry is there from the first frame and
   * says it is fetching; hiding it until the workspace has answered means the
   * one thing this board is for appears a beat after the menu, under the
   * cursor, which is how a manager clicks Archive by accident.
   */
  const available = board.system === "TASK_ALLOCATION" && canEdit;
  const loading = targets.length === 0;

  return { available, loading, targets, allocate, pending: allocate.isPending };
}

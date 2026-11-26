"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, LoaderCircle, SquareKanban } from "lucide-react";
import * as React from "react";
import { BOARD_ROW, TEAM_ROW } from "@/components/shared/team-board-rows";
import { toast } from "sonner";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Item } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { cn } from "@/lib/utils";
import { ALLOCATE_KEY } from "./use-allocation";

/**
 * On the Task Allocation board only: the manager's control for placing a
 * request with a team.
 *
 * Allocating moves the request onto the chosen board. Nothing is copied and
 * nothing is linked, so there is one task from here on — the one the team
 * works on is the one the stakeholder booked, and it carries its own progress
 * to the portal without anything being kept in step. The request leaves this
 * queue, so the panel closes behind it.
 */
export function AllocationSection({ item }: { item: Item }) {
  const { board, canEdit, openItem } = useBoardContext();
  const ws = useWorkspace();
  const user = useCurrentUser();
  const services = useServices();
  const queryClient = useQueryClient();
  const [targetId, setTargetId] = React.useState<string>("");
  const allocate = useMutation({
    mutationKey: ALLOCATE_KEY,
    // The request lands in the board's landing group: the manager picks the board, not the group.
    mutationFn: ({ itemIds, boardId }: { itemIds: string[]; boardId: string }) => services.booking.allocate(itemIds[0]!, boardId, user.id),
    onSuccess: async ({ board: target }) => {
      // The item is no longer on this board, so the panel showing it has
      // nothing left to show.
      openItem(null);
      publishDataChange({ kinds: ["items", "links", "board"] });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(board.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(target.id) }),
      ]);
      toast.success(`Moved to ${target.name}`, { description: "It has left the allocation queue." });
      setTargetId("");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not allocate the request"),
  });

  if (board.system !== "TASK_ALLOCATION" || item.parentItemId !== null) return null;

  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  const teams = ws.teams.filter((t) => t.archivedAt === null && !t.system).sort(byName);
  const groups = teams
    .map((team) => ({ team, boards: ws.boardsForTeam(team.id).filter((b) => !b.system && canViewBoard(ws.permissions, b)).sort(byName) }))
    .filter((g) => g.boards.length > 0);
  const loose = ws.boards.filter((b) => b.archivedAt === null && !b.system && !b.teamId && canViewBoard(ws.permissions, b)).sort(byName);
  // Nowhere to send it: say so rather than offer an empty list.
  const nowhere = groups.length === 0 && loose.length === 0;

  return (
    <section data-testid="allocation-section">
      <h3 className="mb-1.5 label-quiet">Allocation</h3>
      <div className="rounded-xl border border-border/70 bg-card p-2 shadow-xs">
        {nowhere && (
          <p className="px-1 py-0.5 text-[13px] text-muted-foreground" data-testid="allocation-status">
            No team boards yet. Add a board to a team to allocate requests to it.
          </p>
        )}
        {canEdit && !nowhere && (
          <div className="flex flex-col gap-2 sm:flex-row" title="The request moves to the board you pick">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger aria-label="Team board" className="h-9 flex-1" data-testid="allocation-target">
                <SelectValue placeholder="Choose a team board…" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(({ team, boards }) => (
                  <SelectGroup key={team.id}>
                    <SelectLabel className={TEAM_ROW}>
                      <DynamicIcon name={team.icon} className={cn("size-3.5 shrink-0", colorClasses(team.color).text)} /> {team.name}
                    </SelectLabel>
                    {boards.map((b) => (
                      <SelectItem key={b.id} value={b.id} className={BOARD_ROW} data-testid={`allocation-board-${b.slug}`}>
                        <span className="flex items-center gap-2">
                          <SquareKanban className="size-3.5 shrink-0 text-muted-foreground" />
                          {b.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {loose.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className={TEAM_ROW}>No team</SelectLabel>
                    {loose.map((b) => (
                      <SelectItem key={b.id} value={b.id} className={BOARD_ROW} data-testid={`allocation-board-${b.slug}`}>
                        <span className="flex items-center gap-2">
                          <SquareKanban className="size-3.5 shrink-0 text-muted-foreground" />
                          {b.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="h-9" disabled={!targetId || allocate.isPending} onClick={() => allocate.mutate({ itemIds: [item.id], boardId: targetId })} data-testid="allocation-submit">
              {allocate.isPending ? <LoaderCircle className="animate-spin" /> : <ArrowRightLeft />} Allocate
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

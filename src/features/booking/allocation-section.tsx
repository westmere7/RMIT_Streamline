"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, LoaderCircle } from "lucide-react";
import * as React from "react";
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
    mutationFn: () => services.booking.allocate(item.id, targetId, user.id),
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

  return (
    <section data-testid="allocation-section">
      <h3 className="mb-1.5 label-quiet">Allocation</h3>
      <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3 shadow-xs">
        <p className="text-[13px] text-muted-foreground" data-testid="allocation-status">
          Pick the board that should do the work. The request moves there.
        </p>
        {canEdit && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={targetId} onValueChange={setTargetId}>
              <SelectTrigger aria-label="Team board" className="h-9 flex-1" data-testid="allocation-target">
                <SelectValue placeholder="Choose a team board…" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(({ team, boards }) => (
                  <SelectGroup key={team.id}>
                    <SelectLabel className="flex items-center gap-1.5">
                      <DynamicIcon name={team.icon} className={cn("size-3.5", colorClasses(team.color).text)} /> {team.name}
                    </SelectLabel>
                    {boards.map((b) => (
                      <SelectItem key={b.id} value={b.id} data-testid={`allocation-board-${b.slug}`}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {loose.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>No team</SelectLabel>
                    {loose.map((b) => (
                      <SelectItem key={b.id} value={b.id} data-testid={`allocation-board-${b.slug}`}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" className="h-9" disabled={!targetId || allocate.isPending} onClick={() => allocate.mutate()} data-testid="allocation-submit">
              {allocate.isPending ? <LoaderCircle className="animate-spin" /> : <ArrowRightLeft />} Allocate
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

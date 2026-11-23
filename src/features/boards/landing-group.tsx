"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Board } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";

const TOP_GROUP = "__top";

/**
 * A board's landing group, in its settings: where tasks from other boards land
 * (allocated, moved, booked straight here). One group, or the top one. The
 * built-in boards have none.
 */
export function LandingGroupField({ board, manage }: { board: Board; manage: boolean }) {
  const services = useServices();
  const actions = useBoardActions(board);
  const groups = useQuery({
    queryKey: ["landing-groups", board.id],
    queryFn: async () => (await services.repos.boards.listGroups(board.id)).filter((g) => g.role !== "INTAKE").sort((a, b) => a.position - b.position),
    staleTime: 30_000,
  });
  if (board.system) return null;
  const chosen = board.landingGroupId && groups.data?.some((g) => g.id === board.landingGroupId) ? board.landingGroupId : TOP_GROUP;
  return (
    <div className="grid gap-1.5">
      <Label>Landing group</Label>
      <Select value={chosen} onValueChange={(v) => actions.updateBoard.mutate({ landingGroupId: v === TOP_GROUP ? null : v })} disabled={!manage || !groups.data}>
        <SelectTrigger aria-label="Landing group" data-testid="board-landing-group">
          <SelectValue placeholder="Top group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOP_GROUP}>Top group{groups.data?.[0] ? ` (${groups.data[0].name})` : ""}</SelectItem>
          {(groups.data ?? []).map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-2xs text-muted-foreground">Where tasks from other boards land.</p>
    </div>
  );
}

/** Whether this group is the board's landing group: the chosen one, not the top group by default. */
export function isLandingGroup(board: Pick<Board, "landingGroupId" | "system">, groupId: string): boolean {
  return !board.system && board.landingGroupId === groupId;
}

/** The small mark beside the landing group's name. */
export function LandingGroupMark() {
  return (
    <SimpleTooltip label="Tasks from other boards land here">
      <span className="ml-1 flex size-5 items-center justify-center text-muted-foreground" aria-label="Landing group" data-testid="group-landing-mark">
        <ArrowDownToLine className="size-3.5" />
      </span>
    </SimpleTooltip>
  );
}


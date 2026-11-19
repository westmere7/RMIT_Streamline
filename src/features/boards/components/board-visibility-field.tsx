"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Board, Team, User } from "@/domain";
import type { WorkspaceContextValue } from "@/features/workspace/workspace-context";

/**
 * A board's visibility as its settings offer it. A team's board follows the
 * team (Edit team → who sees its boards, whether its members edit) and keeps
 * one setting of its own, Private. A board with no team is the workspace's or
 * private.
 */
export function BoardVisibilityField({
  team,
  value,
  onChange,
  disabled,
  id,
}: {
  team: Pick<Team, "name" | "boardVisibility" | "membersCanEdit"> | null | undefined;
  value: Board["visibility"];
  onChange: (visibility: Board["visibility"]) => void;
  disabled?: boolean;
  id?: string;
}) {
  const isPrivate = value === "PRIVATE";
  return (
    <div className="grid gap-1">
      <Select value={isPrivate ? "PRIVATE" : "OPEN"} onValueChange={(next) => onChange(next === "PRIVATE" ? "PRIVATE" : "WORKSPACE")} disabled={disabled}>
        <SelectTrigger id={id} aria-label="Visibility" data-testid="board-visibility">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="OPEN">{team ? `As ${team.name}` : "Workspace"}</SelectItem>
          <SelectItem value="PRIVATE">Private</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-2xs text-muted-foreground" data-testid="board-visibility-hint">
        {isPrivate ? "Only people added to it." : team ? teamAccessSummary(team) : "Everyone in the workspace can view it."}
      </p>
    </div>
  );
}

/** "Only Brand sees it; its members edit." — what a team's settings mean for one of its boards. */
export function teamAccessSummary(team: Pick<Team, "name" | "boardVisibility" | "membersCanEdit">): string {
  const sees = team.boardVisibility === "TEAM" ? `Only ${team.name} sees it` : "Everyone in the workspace sees it";
  return `${sees}; ${team.membersCanEdit ? `${team.name}'s members edit it.` : "added people edit it."}`;
}

/**
 * The team's members who edit this board through the team (Edit team →
 * Members can edit), and are not on it already as its owner or added: shown
 * on the board as members, "Via team". None on a private or built-in board.
 */
export function teamEditorsOf(ws: Pick<WorkspaceContextValue, "teamById" | "teamMembers" | "boardMembers" | "activeUsers">, board: Board): User[] {
  if (!board.teamId || board.system || board.visibility === "PRIVATE") return [];
  const team = ws.teamById(board.teamId);
  if (!team?.membersCanEdit) return [];
  const seated = new Set(ws.boardMembers.filter((m) => m.boardId === board.id).map((m) => m.userId));
  const onTeam = new Set(ws.teamMembers.filter((m) => m.teamId === team.id).map((m) => m.userId));
  return ws.activeUsers.filter((user) => onTeam.has(user.id) && !seated.has(user.id) && user.id !== board.ownerId);
}


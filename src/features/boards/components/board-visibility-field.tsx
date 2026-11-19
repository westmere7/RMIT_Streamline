"use client";

import { Check, Minus } from "lucide-react";
import * as React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Board, BoardEditScope, Team, User } from "@/domain";
import type { WorkspaceContextValue } from "@/features/workspace/workspace-context";
import { boardAccessOf, teamAccessFor } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

type See = Board["visibility"];

/**
 * "Who can see" and "who can edit", as two pickers. Editing is never wider
 * than seeing: with only the added people seeing, only they edit.
 * `teamName` offers the team's own choices; `allowPrivate` the "only people
 * added" one (a team's own default has none: a single board is made private).
 */
export function AccessPickers({
  see,
  edit,
  onChange,
  teamName,
  allowPrivate = true,
  disabled,
  idPrefix = "access",
}: {
  see: See;
  edit: BoardEditScope;
  onChange: (next: { see: See; edit: BoardEditScope }) => void;
  teamName: string | null;
  allowPrivate?: boolean;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const shut = see === "PRIVATE";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-see`}>Who can see</Label>
        <Select value={see} onValueChange={(next) => onChange({ see: next as See, edit: next === "PRIVATE" ? "ADDED" : edit })} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-see`} aria-label="Who can see" data-testid={`${idPrefix}-see`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WORKSPACE">Everyone in the workspace</SelectItem>
            {teamName && <SelectItem value="TEAM">Only {teamName}</SelectItem>}
            {allowPrivate && <SelectItem value="PRIVATE">Only people added</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-edit`}>Who can edit</Label>
        <Select value={edit} onValueChange={(next) => onChange({ see, edit: next as BoardEditScope })} disabled={disabled || shut}>
          <SelectTrigger id={`${idPrefix}-edit`} aria-label="Who can edit" data-testid={`${idPrefix}-edit`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADDED">Only people added</SelectItem>
            {teamName && <SelectItem value="TEAM">{teamName}&apos;s members</SelectItem>}
            <SelectItem value="VIEWERS">Everyone who can see it</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

type Cell = boolean | string;

/**
 * Who can see and who can edit, row by row, for the settings as they stand.
 * Workspace admins always can; people added to a board by the role they were
 * given; guests only where added.
 */
export function AccessGrid({ see, edit, teamName, className }: { see: See; edit: BoardEditScope; teamName: string | null; className?: string }) {
  const teamSees = see === "WORKSPACE" || see === "TEAM";
  const othersSee = see === "WORKSPACE";
  const rows: Array<{ who: string; see: Cell; edit: Cell; testId: string }> = [
    { who: "Workspace admins", see: true, edit: true, testId: "admins" },
    { who: "People added to the board", see: true, edit: "by their role", testId: "added" },
    ...(teamName ? [{ who: `${teamName} members`, see: teamSees, edit: teamSees && (edit === "TEAM" || edit === "VIEWERS"), testId: "team" }] : []),
    { who: teamName ? "Everyone else in the workspace" : "Everyone in the workspace", see: othersSee, edit: othersSee && edit === "VIEWERS", testId: "others" },
    { who: "Guests", see: "if added", edit: "if added", testId: "guests" },
  ];
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border/70", className)} data-testid="access-grid">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-surface/60 text-2xs text-muted-foreground uppercase">
            <th className="px-3 py-1.5 text-left font-medium tracking-wide">Who</th>
            <th className="w-24 px-3 py-1.5 text-center font-medium tracking-wide">Can see</th>
            <th className="w-24 px-3 py-1.5 text-center font-medium tracking-wide">Can edit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.testId} className="border-t border-border/60" data-testid={`access-row-${row.testId}`}>
              <td className="px-3 py-1.5">{row.who}</td>
              <td className="px-3 py-1.5 text-center" data-testid={`access-${row.testId}-see`}>
                <GridCell value={row.see} />
              </td>
              <td className="px-3 py-1.5 text-center" data-testid={`access-${row.testId}-edit`}>
                <GridCell value={row.edit} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GridCell({ value }: { value: Cell }) {
  if (typeof value === "string") return <span className="text-2xs text-muted-foreground">{value}</span>;
  return value ? (
    <Check className="mx-auto size-4 text-emerald-600 dark:text-emerald-400" aria-label="Yes" />
  ) : (
    <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="No" />
  );
}

/**
 * A board's access in its settings. A team's board follows its team, or,
 * switched off, has its own "who can see" (everyone, the team, only people
 * added) and "who can edit". A board with no team has its own.
 */
export function BoardAccessField({
  board,
  team,
  manage,
  onChange,
}: {
  board: Board;
  team: Pick<Team, "name" | "boardVisibility" | "boardEdit" | "membersCanEdit"> | null | undefined;
  manage: boolean;
  onChange: (patch: Partial<Pick<Board, "followsTeam" | "visibility" | "editScope">>) => void;
}) {
  const access = boardAccessOf(board, team ? teamAccessFor(team) : null);
  const teamName = team?.name ?? null;
  return (
    <div className="grid gap-3" data-testid="board-access">
      {team && (
        <label className="flex items-center justify-between gap-3 text-[13px]">
          <span>
            Follow {team.name}&apos;s settings
            <span className="block text-2xs text-muted-foreground">Set in Edit team, for all its boards.</span>
          </span>
          <Switch
            checked={access.fromTeam}
            disabled={!manage}
            // Leaving the team's settings starts from them, so nothing changes until a choice is made.
            onCheckedChange={(follow) => onChange(follow ? { followsTeam: true } : { followsTeam: false, visibility: access.see, editScope: access.edit })}
            aria-label={`Follow ${team.name}'s settings`}
            data-testid="board-follows-team"
          />
        </label>
      )}
      {!access.fromTeam && (
        <AccessPickers
          see={access.see}
          edit={access.edit}
          teamName={teamName}
          disabled={!manage}
          idPrefix="board-access"
          onChange={(next) => onChange({ visibility: next.see, editScope: next.edit })}
        />
      )}
      <AccessGrid see={access.see} edit={access.edit} teamName={teamName} />
    </div>
  );
}

/**
 * A new board's visibility, kept short: a team's board follows the team or is
 * made private; a board with no team is the workspace's or private. The rest
 * is in the board's settings.
 */
export function BoardVisibilityField({
  team,
  value,
  onChange,
  disabled,
  id,
}: {
  team: Pick<Team, "name" | "boardVisibility" | "boardEdit" | "membersCanEdit"> | null | undefined;
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
        {isPrivate ? "Only people added to it." : team ? accessSummary(teamAccessFor(team).boardVisibility ?? "WORKSPACE", teamAccessFor(team).boardEdit ?? "ADDED", team.name) : "Everyone in the workspace can view it."}
      </p>
    </div>
  );
}

/** "Only Brand sees it; its members edit." — a board's two settings in words. */
export function accessSummary(see: See, edit: BoardEditScope, teamName: string | null): string {
  if (see === "PRIVATE") return "Only people added to it see and edit it.";
  const sees = see === "TEAM" && teamName ? `Only ${teamName} sees it` : "Everyone in the workspace sees it";
  const edits = edit === "VIEWERS" ? "all of them can edit" : edit === "TEAM" && teamName ? `${teamName}'s members edit` : "added people edit";
  return `${sees}; ${edits}.`;
}

/**
 * The team's members who edit this board through the team, and are not on it
 * already as its owner or added: shown on the board as members, "via team".
 * None when nobody but added people edits, and none when the whole workspace
 * edits (the grid says so instead of listing everyone).
 */
export function teamEditorsOf(ws: Pick<WorkspaceContextValue, "teamById" | "teamMembers" | "boardMembers" | "activeUsers">, board: Board): User[] {
  if (!board.teamId || board.system) return [];
  const team = ws.teamById(board.teamId);
  const { see, edit } = boardAccessOf(board, team ? teamAccessFor(team) : null);
  const teamEdits = see !== "PRIVATE" && (edit === "TEAM" || (edit === "VIEWERS" && see === "TEAM"));
  if (!teamEdits) return [];
  const seated = new Set(ws.boardMembers.filter((m) => m.boardId === board.id).map((m) => m.userId));
  const onTeam = new Set(ws.teamMembers.filter((m) => m.teamId === board.teamId).map((m) => m.userId));
  return ws.activeUsers.filter((user) => onTeam.has(user.id) && !seated.has(user.id) && user.id !== board.ownerId);
}

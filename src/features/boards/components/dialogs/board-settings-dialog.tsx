"use client";

import { LookPicker } from "@/components/shared/look-picker";
import { SettingsDialogFrame } from "@/components/shared/settings-dialog-frame";
import { BoardAccessField, accessSummary, teamEditorsOf } from "@/features/boards/components/board-visibility-field";
import { boardAccessOf, teamAccessFor } from "@/lib/permissions/permissions";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Archive, ArchiveRestore, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BOARD_ROLES, COLUMN_TYPE_LABELS, isSystemColumnType, picFromAssets, resolveColumnRoles, shownColumns, type Board, type BoardRole } from "@/domain";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { BoardSharePanel } from "@/features/boards/components/dialogs/share-board-dialog";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { boardRoleFor, canDeleteBoard, canEditBoardSeat, canManageBoard } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

export type BoardSettingsSection = "general" | "access" | "members" | "share" | "columns" | "assets" | "permissions" | "archive" | "danger";

/** In the same order as team settings where they share a tab: General, Access, Members. */
const SECTIONS: Array<{ id: BoardSettingsSection; label: string; danger?: boolean }> = [
  { id: "general", label: "General" },
  { id: "access", label: "Access" },
  { id: "members", label: "Members" },
  { id: "share", label: "Share" },
  { id: "columns", label: "Columns" },
  { id: "assets", label: "Assets" },
  { id: "permissions", label: "Permissions" },
  { id: "archive", label: "Archive" },
  { id: "danger", label: "Danger Zone", danger: true },
];

export function BoardSettingsDialog({
  board: given,
  section,
  onSectionChange,
  onRequestDelete,
}: {
  board: Board;
  section: BoardSettingsSection | null;
  onSectionChange: (section: BoardSettingsSection | null) => void;
  onRequestDelete: () => void;
}) {
  const ws = useWorkspace();
  // The board as it is now, not as it was when the dialog was opened: a
  // caller may hold on to the copy it opened with, and every change made here
  // would then seem not to stick.
  const board = ws.boardById(given.id) ?? given;
  const manage = canManageBoard(ws.permissions, board);
  return (
    <SettingsDialogFrame title="Board settings" description={board.name} sections={SECTIONS} section={section} onSectionChange={onSectionChange} testId="board-settings">
      {section === "general" && <GeneralSection key={`${board.name}|${board.description ?? ""}`} board={board} manage={manage} />}
      {section === "access" && <AccessSection board={board} manage={manage} />}
      {section === "members" && <MembersSection board={board} manage={manage} />}
      {section === "share" && <ShareSection board={board} manage={manage} />}
      {section === "columns" && <ColumnsSection board={board} manage={manage} />}
      {section === "assets" && <AssetsSection board={board} manage={manage} />}
      {section === "permissions" && <PermissionsSection board={board} />}
      {section === "archive" && <ArchiveSection board={board} manage={manage} />}
      {section === "danger" && <DangerSection board={board} onRequestDelete={onRequestDelete} />}
    </SettingsDialogFrame>
  );
}

const NO_TEAM = "__none__";

function GeneralSection({ board, manage }: { board: Board; manage: boolean }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  const [name, setName] = React.useState(board.name);
  const [description, setDescription] = React.useState(board.description ?? "");
  const dirty = name.trim() !== board.name || description.trim() !== (board.description ?? "");
  return (
    <div className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="bs-name">Board name</Label>
        <div className="flex items-center gap-2">
          <LookPicker color={board.color} icon={board.icon} onColor={(color) => actions.updateBoard.mutate({ color })} onIcon={(icon) => actions.updateBoard.mutate({ icon })} disabled={!manage} testId="board-look" />
          <Input id="bs-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="bs-description">Description</Label>
        <Textarea id="bs-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!manage} />
      </div>
      {manage && (
        <Button size="sm" disabled={!dirty || !name.trim()} onClick={() => actions.updateBoard.mutate({ name: name.trim(), description: description.trim() || null })}>
          Save changes
        </Button>
      )}
      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Team</Label>
          <Select value={board.teamId ?? NO_TEAM} onValueChange={(v) => actions.updateBoard.mutate({ teamId: v === NO_TEAM ? null : v })} disabled={!manage}>
            <SelectTrigger aria-label="Team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>No team</SelectItem>
              {ws.teams
                .filter((t) => t.archivedAt === null)
                .map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/** Who can see the board and who can edit it: its team's settings, or its own. */
function AccessSection({ board, manage }: { board: Board; manage: boolean }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  if (board.system) return <p className="text-[13px] text-muted-foreground">A built-in board: who can see and edit it is fixed.</p>;
  return <BoardAccessField board={board} team={ws.teamById(board.teamId)} manage={manage} onChange={(patch) => actions.updateBoard.mutate(patch)} />;
}

function MembersSection({ board, manage }: { board: Board; manage: boolean }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  const [addOpen, setAddOpen] = React.useState(false);
  const members = ws.boardMembers.filter((m) => m.boardId === board.id);
  // The team's members, when the team lets them edit its boards: on the board
  // through the team, not added to it, so not removable here.
  const viaTeam = teamEditorsOf(ws, board);
  const team = ws.teamById(board.teamId);
  const candidates = ws.activeUsers.filter((u) => !members.some((m) => m.userId === u.id) && !viaTeam.some((t) => t.id === u.id));
  const total = members.length + viaTeam.length;
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
          {total} {total === 1 ? "member" : "members"}.{" "}
          {(() => {
            const access = boardAccessOf(board, team ? teamAccessFor(team) : null);
            return access.see === "PRIVATE" ? "Only they can see it." : board.system ? "" : accessSummary(access.see, access.edit, team?.name ?? null);
          })()}
        </p>
        {manage && (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" className="shrink-0">
                <Plus /> Add member
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-0">
              <Command>
                <CommandInput placeholder="Search people…" />
                <CommandList>
                  <CommandEmpty>Everyone is already a member.</CommandEmpty>
                  <CommandGroup>
                    {candidates.map((user) => (
                      <CommandItem
                        key={user.id}
                        value={`${user.displayName} ${user.email}`}
                        onSelect={() => {
                          actions.setMember.mutate({ userId: user.id, role: "EDITOR" });
                          setAddOpen(false);
                        }}
                      >
                        <UserAvatar user={user} size="xs" tooltip={false} />
                        <span className="truncate">{user.displayName}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
        {members.map((member) => {
          const user = ws.userById(member.userId);
          const isOwner = board.ownerId === member.userId;
          // Your own seat is somebody else's to change.
          const editable = canEditBoardSeat(ws.permissions, board, member.userId);
          return (
            <li key={member.id} className="flex h-11 items-center gap-2.5 px-3 text-[13px]">
              <UserAvatar user={user} size="md" tooltip={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user?.displayName ?? "Unknown"}</span>
                <span className="block truncate text-2xs text-muted-foreground">{user?.email}</span>
              </span>
              {isOwner ? (
                <Badge variant="primary">Owner</Badge>
              ) : editable ? (
                <Select value={member.role} onValueChange={(role) => actions.setMember.mutate({ userId: member.userId, role: role as BoardRole })}>
                  <SelectTrigger className="h-7 w-28" aria-label={`Role for ${user?.displayName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARD_ROLES.filter((r) => r !== "OWNER").map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.charAt(0) + role.slice(1).toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="muted">{member.role.toLowerCase()}</Badge>
              )}
              {editable && (
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${user?.displayName}`} onClick={() => actions.removeMember.mutate(member.userId)}>
                  <X />
                </Button>
              )}
            </li>
          );
        })}
        {viaTeam.map((user) => (
          <li key={`team-${user.id}`} className="flex h-11 items-center gap-2.5 px-3 text-[13px]" data-testid="board-member-via-team">
            <UserAvatar user={user} size="md" tooltip={false} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{user.displayName}</span>
              <span className="block truncate text-2xs text-muted-foreground">{user.email}</span>
            </span>
            <SimpleTooltip label={`Edits as a member of ${team?.name ?? "the team"}. Change it in the team's settings.`}>
              <Badge variant="muted" className="cursor-default">via {team?.name ?? "team"}</Badge>
            </SimpleTooltip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The board's public link, in the same place as everything else about the board. */
function ShareSection({ board, manage }: { board: Board; manage: boolean }) {
  if (!manage) {
    return <p className="text-[13px] text-muted-foreground">Only the board&rsquo;s owner or a workspace admin can share it by link.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">Anyone with the link can read this board. Nothing else, and nothing they can change.</p>
      <BoardSharePanel board={board} />
    </div>
  );
}

function ColumnsSection({ board, manage }: { board: Board; manage: boolean }) {
  // The dialog is mounted from the header, outside the board context, so load columns directly.
  const snapshot = useBoardSnapshot(board.id);
  const mutations = useBoardMutations(board.id);
  const columns = shownColumns(snapshot.data?.columns ?? []).sort((a, b) => a.position - b.position);
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-muted-foreground">The Item name column is always shown. Hide, show or delete the others.</p>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
        <li className="flex h-10 items-center gap-2 px-3 text-[13px]">
          <span className="flex-1 font-medium">Item</span>
          <Badge variant="muted">Required</Badge>
        </li>
        {columns.map((column) => (
          <li key={column.id} className={cn("flex h-10 items-center gap-2 px-3 text-[13px]", column.hidden && "text-muted-foreground")}>
            <span className="flex-1 truncate font-medium">{column.name}</span>
            <span className={cn("text-2xs", isSystemColumnType(column.type) ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>{COLUMN_TYPE_LABELS[column.type]}</span>
            {manage && (
              <>
                <Button variant="ghost" size="icon-sm" aria-label={column.hidden ? `Show ${column.name}` : `Hide ${column.name}`} onClick={() => void mutations.updateColumn(column.id, { hidden: !column.hidden })}>
                  {column.hidden ? <EyeOff /> : <Eye />}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${column.name}`} className="text-destructive" onClick={() => void mutations.deleteColumn(column.id)}>
                  <Trash2 />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How a task's asset lines keep its PIC up to date. The work is done where the
 * lines are saved (ItemAssetService.syncPic); this only says which way.
 */
function AssetsSection({ board, manage }: { board: Board; manage: boolean }) {
  const snapshot = useBoardSnapshot(board.id);
  const actions = useBoardActions(board);
  const pic = resolveColumnRoles(snapshot.data?.columns ?? []).pic;
  const { fill, clear } = picFromAssets(board);
  const off = !manage || (snapshot.isSuccess && !pic);
  const rows = [
    { id: "fill", label: "Add to PIC", hint: "When someone is put in charge of an asset.", checked: fill, patch: (on: boolean) => ({ assetsFillPic: on }) },
    { id: "clear", label: "Remove from PIC", hint: "When someone added this way has no assets left. People added by hand stay.", checked: clear, patch: (on: boolean) => ({ assetsClearPic: on }) },
  ];
  return (
    <div className="space-y-3">
      {snapshot.isSuccess && !pic && <p className="text-[13px] text-muted-foreground">This board has no PIC column.</p>}
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs" data-testid="board-assets-settings">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{row.label}</p>
              <p className="text-2xs text-muted-foreground">{row.hint}</p>
            </div>
            <Switch checked={row.checked} disabled={off} onCheckedChange={(on) => actions.updateBoard.mutate(row.patch(on))} aria-label={row.label} data-testid={`board-assets-${row.id}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PermissionsSection({ board }: { board: Board }) {
  const ws = useWorkspace();
  const role = boardRoleFor(ws.permissions, board);
  return (
    <div className="space-y-3 text-[13px]">
      <p>
        Your effective role on this board is <Badge variant="primary">{role?.toLowerCase() ?? "none"}</Badge>
      </p>
      <ul className="space-y-1.5 text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Owner</span> – full control including settings, members, archive and delete.
        </li>
        <li>
          <span className="font-medium text-foreground">Editor</span> – add and edit groups, items, columns and updates.
        </li>
        <li>
          <span className="font-medium text-foreground">Viewer</span> – read only.
        </li>
      </ul>
      <p className="text-muted-foreground">
        Workspace owners and admins can always manage boards. Visibility controls who can see the board without an explicit membership: workspace (all members), team (team members) or private (board members only).
      </p>
    </div>
  );
}

function ArchiveSection({ board, manage }: { board: Board; manage: boolean }) {
  const actions = useBoardActions(board);
  if (board.system) return <BuiltInNote board={board} />;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">Archived boards are hidden from the sidebar and search but keep all of their data. You can restore them at any time.</p>
      {board.archivedAt ? (
        <Button variant="outline" size="sm" disabled={!manage} onClick={() => actions.restoreBoard.mutate()}>
          <ArchiveRestore /> Restore board
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={!manage} onClick={() => actions.archiveBoard.mutate()}>
          <Archive /> Archive board
        </Button>
      )}
    </div>
  );
}

/** Task Allocation and other built-in boards: renamable, never archived or deleted. */
function BuiltInNote({ board }: { board: Board }) {
  return (
    <p className="rounded-xl border border-border/60 bg-surface/60 p-4 text-[13px] text-muted-foreground" data-testid="board-built-in">
      <span className="font-medium text-foreground">{board.name}</span> is built into the workspace:{" "}
      {board.system === "APP_DEVELOPMENT" ? "every bug reported from the app lands here, and only its members can see it." : "every task booked through the form lands here, and only workspace admins can see it."} It can be renamed and recoloured, but not archived, moved or deleted.
    </p>
  );
}

function DangerSection({ board, onRequestDelete }: { board: Board; onRequestDelete: () => void }) {
  const ws = useWorkspace();
  const allowed = canDeleteBoard(ws.permissions, board);
  if (board.system) return <BuiltInNote board={board} />;
  return (
    <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
      <p className="text-[13px] font-medium">Delete this board</p>
      <p className="text-[13px] text-muted-foreground">Deletes every group, item, update and file on the board. There is no undo.</p>
      <Button variant="destructive" size="sm" disabled={!allowed} onClick={onRequestDelete}>
        <Trash2 /> Delete board
      </Button>
      {!allowed && <p className="text-2xs text-muted-foreground">Only the board owner or a workspace admin can delete this board.</p>}
    </div>
  );
}

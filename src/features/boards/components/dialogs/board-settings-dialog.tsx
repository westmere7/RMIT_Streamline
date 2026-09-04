"use client";

import { Archive, ArchiveRestore, Eye, EyeOff, Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { IconPicker } from "@/components/shared/icon-picker";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BOARD_ROLES, COLUMN_TYPE_LABELS, type Board, type BoardRole } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { boardRoleFor, canDeleteBoard, canManageBoard } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

export type BoardSettingsSection = "general" | "members" | "columns" | "permissions" | "archive" | "danger";

const SECTIONS: Array<{ id: BoardSettingsSection; label: string }> = [
  { id: "general", label: "General" },
  { id: "members", label: "Members" },
  { id: "columns", label: "Columns" },
  { id: "permissions", label: "Permissions" },
  { id: "archive", label: "Archive" },
  { id: "danger", label: "Danger Zone" },
];

export function BoardSettingsDialog({
  board,
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
  const manage = canManageBoard(ws.permissions, board);
  const open = section !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onSectionChange(null)}>
      <DialogContent size="lg" className="max-h-[85vh] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Board settings</DialogTitle>
          <DialogDescription>{board.name}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[420px]">
          <nav className="w-40 shrink-0 border-r p-2" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSectionChange(s.id)}
                aria-current={section === s.id ? "page" : undefined}
                className={cn(
                  "flex h-8 w-full items-center rounded-md px-2 text-[13px] font-medium",
                  section === s.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  s.id === "danger" && "text-destructive",
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="scrollbar-thin max-h-[calc(85vh-80px)] flex-1 overflow-y-auto p-5">
            {section === "general" && <GeneralSection key={`${board.name}|${board.description ?? ""}`} board={board} manage={manage} />}
            {section === "members" && <MembersSection board={board} manage={manage} />}
            {section === "columns" && <ColumnsSection manage={manage} />}
            {section === "permissions" && <PermissionsSection board={board} />}
            {section === "archive" && <ArchiveSection board={board} manage={manage} />}
            {section === "danger" && <DangerSection board={board} onRequestDelete={onRequestDelete} />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
        <Input id="bs-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} />
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
        <div className="grid gap-1.5">
          <Label>Visibility</Label>
          <Select value={board.visibility} onValueChange={(v) => actions.updateBoard.mutate({ visibility: v as Board["visibility"] })} disabled={!manage}>
            <SelectTrigger aria-label="Visibility">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WORKSPACE">Workspace</SelectItem>
              <SelectItem value="TEAM" disabled={!board.teamId}>
                Team
              </SelectItem>
              <SelectItem value="PRIVATE">Private</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {manage && (
        <div className="grid gap-4 border-t pt-4">
          <div className="grid gap-1.5">
            <Label>Colour</Label>
            <ColorPicker value={board.color} onChange={(color) => actions.updateBoard.mutate({ color })} />
          </div>
          <div className="grid gap-1.5">
            <Label>Icon</Label>
            <IconPicker value={board.icon} onChange={(icon) => actions.updateBoard.mutate({ icon })} className="grid-cols-11" />
          </div>
        </div>
      )}
    </div>
  );
}

function MembersSection({ board, manage }: { board: Board; manage: boolean }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  const [addOpen, setAddOpen] = React.useState(false);
  const members = ws.boardMembers.filter((m) => m.boardId === board.id);
  const candidates = ws.users.filter((u) => u.deactivatedAt === null && !members.some((m) => m.userId === u.id));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          {members.length} {members.length === 1 ? "member" : "members"}. Members of a {board.visibility.toLowerCase()} board
          {board.visibility === "WORKSPACE" ? " – everyone in the workspace can also view it." : board.visibility === "TEAM" ? " – team members can also view it." : " are the only people who can see it."}
        </p>
        {manage && (
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
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
      <ul className="divide-y rounded-md border">
        {members.map((member) => {
          const user = ws.userById(member.userId);
          const isOwner = board.ownerId === member.userId;
          return (
            <li key={member.id} className="flex h-11 items-center gap-2.5 px-3 text-[13px]">
              <UserAvatar user={user} size="md" tooltip={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user?.displayName ?? "Unknown"}</span>
                <span className="block truncate text-2xs text-muted-foreground">{user?.email}</span>
              </span>
              {isOwner ? (
                <Badge variant="primary">Owner</Badge>
              ) : manage ? (
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
              {manage && !isOwner && (
                <Button variant="ghost" size="icon-xs" aria-label={`Remove ${user?.displayName}`} onClick={() => actions.removeMember.mutate(member.userId)}>
                  <X />
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ColumnsSection({ manage }: { manage: boolean }) {
  const { model, mutations } = useBoardContext();
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-muted-foreground">The Item name column is always shown. Hide, show or delete the others.</p>
      <ul className="divide-y rounded-md border">
        <li className="flex h-10 items-center gap-2 px-3 text-[13px]">
          <span className="flex-1 font-medium">Item</span>
          <Badge variant="muted">Required</Badge>
        </li>
        {model.columns.map((column) => (
          <li key={column.id} className={cn("flex h-10 items-center gap-2 px-3 text-[13px]", column.hidden && "text-muted-foreground")}>
            <span className="flex-1 truncate font-medium">{column.name}</span>
            <span className="text-2xs text-muted-foreground">{COLUMN_TYPE_LABELS[column.type]}</span>
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

function DangerSection({ board, onRequestDelete }: { board: Board; onRequestDelete: () => void }) {
  const ws = useWorkspace();
  const allowed = canDeleteBoard(ws.permissions, board);
  return (
    <div className="space-y-3 rounded-md border border-destructive/30 p-4">
      <p className="text-[13px] font-medium">Delete this board</p>
      <p className="text-[13px] text-muted-foreground">Deletes every group, item, update and file on the board. There is no undo.</p>
      <Button variant="destructive" size="sm" disabled={!allowed} onClick={onRequestDelete}>
        <Trash2 /> Delete board
      </Button>
      {!allowed && <p className="text-2xs text-muted-foreground">Only the board owner or a workspace admin can delete this board.</p>}
    </div>
  );
}

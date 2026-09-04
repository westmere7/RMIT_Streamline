"use client";

import { Archive, ArrowLeft, Copy, History, MoreHorizontal, Palette, Plug, Settings2, Star, Trash2, UserPlus, Users, Zap } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { InlineEdit } from "@/components/shared/inline-edit";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Board } from "@/domain";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { AutomationsDialog, IntegrationsDialog } from "@/features/boards/components/dialogs/placeholder-dialogs";
import { BoardActivityDialog } from "@/features/boards/components/dialogs/board-activity-dialog";
import { BoardSettingsDialog, type BoardSettingsSection } from "@/features/boards/components/dialogs/board-settings-dialog";
import { DeleteBoardDialog } from "@/features/boards/components/dialogs/delete-board-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canDeleteBoard, canManageBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function BoardHeader({ board }: { board: Board }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  const manage = canManageBoard(ws.permissions, board);
  const [renaming, setRenaming] = React.useState(false);
  const [editingDescription, setEditingDescription] = React.useState(false);
  const [settings, setSettings] = React.useState<BoardSettingsSection | null>(null);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [automationsOpen, setAutomationsOpen] = React.useState(false);
  const [integrationsOpen, setIntegrationsOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const favourite = ws.isFavourite(board.id);
  const members = ws.boardMembers.filter((m) => m.boardId === board.id).map((m) => ws.userById(m.userId)).filter((u): u is NonNullable<typeof u> => !!u);
  const team = ws.teamById(board.teamId);

  return (
    <header className="border-b px-5 pt-3 pb-0">
      <div className="flex items-start gap-3">
        <SimpleTooltip label="Back to home">
          <Button variant="ghost" size="icon-sm" asChild className="mt-0.5 text-muted-foreground">
            <Link href={routes.workspace(ws.slug)} aria-label="Back to home">
              <ArrowLeft />
            </Link>
          </Button>
        </SimpleTooltip>
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md", colorClasses(board.color).solid)}>
          <DynamicIcon name={board.icon} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 text-lg font-semibold tracking-tight">
              <InlineEdit
                value={board.name}
                editing={renaming}
                onEditingChange={setRenaming}
                onSubmit={(name) => actions.updateBoard.mutate({ name })}
                disabled={!manage}
                ariaLabel="Board name"
                className={cn("rounded px-1 -mx-1", manage && "hover:bg-accent")}
                inputClassName="h-8 w-96 text-lg font-semibold"
              />
            </h1>
            {board.archivedAt && <Badge variant="muted">Archived</Badge>}
            {board.visibility !== "WORKSPACE" && (
              <Badge variant="outline" className="capitalize">
                {board.visibility.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
            {team && (
              <>
                <Link href={routes.team(ws.slug, team.id)} className="hover:text-foreground hover:underline">
                  {team.name}
                </Link>
                <span aria-hidden>·</span>
              </>
            )}
            <InlineEdit
              value={board.description ?? ""}
              editing={editingDescription}
              onEditingChange={setEditingDescription}
              onSubmit={(description) => actions.updateBoard.mutate({ description })}
              disabled={!manage}
              placeholder="Add a description"
              ariaLabel="Board description"
              className={cn("min-w-0 rounded px-1 -mx-1", manage && "hover:bg-accent", !board.description && "italic text-muted-foreground/70")}
              inputClassName="h-7 w-[480px] max-w-full"
            >
              {board.description || (manage ? "Add a description" : "")}
            </InlineEdit>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <SimpleTooltip label={favourite ? "Remove from favourites" : "Add to favourites"}>
            <Button variant="ghost" size="icon-sm" aria-pressed={favourite} aria-label={favourite ? "Remove from favourites" : "Add to favourites"} onClick={() => actions.toggleFavourite.mutate(!favourite)} data-testid="favourite-toggle">
              <Star className={cn("size-4", favourite && "fill-amber-400 text-amber-400")} />
            </Button>
          </SimpleTooltip>
          <button type="button" onClick={() => setSettings("members")} aria-label={`${members.length} board members`} className="flex h-8 items-center rounded-md px-1.5 hover:bg-accent">
            <AvatarStack users={members} size="sm" max={4} />
          </button>
          {manage && (
            <Button variant="outline" size="sm" onClick={() => setSettings("members")}>
              <UserPlus /> Invite
            </Button>
          )}
          <SimpleTooltip label="Board activity">
            <Button variant="ghost" size="icon-sm" aria-label="Board activity" onClick={() => setActivityOpen(true)}>
              <History />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label="Automations (coming later)">
            <Button variant="ghost" size="icon-sm" aria-label="Automations" onClick={() => setAutomationsOpen(true)}>
              <Zap />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip label="Integrations (coming later)">
            <Button variant="ghost" size="icon-sm" aria-label="Integrations" onClick={() => setIntegrationsOpen(true)}>
              <Plug />
            </Button>
          </SimpleTooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Board options" data-testid="board-menu">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setSettings("general")}>
                <Settings2 /> Board settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettings("members")}>
                <Users /> Manage members
              </DropdownMenuItem>
              {manage && (
                <>
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename board</DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Palette /> Colour &amp; icon
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-72 space-y-3 p-3">
                      <ColorPicker value={board.color} onChange={(color) => actions.updateBoard.mutate({ color })} />
                      <IconPicker value={board.icon} onChange={(icon) => actions.updateBoard.mutate({ icon })} />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Users /> Move to team
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem disabled={board.teamId === null} onSelect={() => actions.updateBoard.mutate({ teamId: null })}>
                        No team
                      </DropdownMenuItem>
                      {ws.teams
                        .filter((t) => t.archivedAt === null)
                        .map((t) => (
                          <DropdownMenuItem key={t.id} disabled={t.id === board.teamId} onSelect={() => actions.updateBoard.mutate({ teamId: t.id })}>
                            <DynamicIcon name={t.icon} className={colorClasses(t.color).text} /> {t.name}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </>
              )}
              <DropdownMenuItem onSelect={() => actions.duplicateBoard.mutate()}>
                <Copy /> Duplicate board
              </DropdownMenuItem>
              {manage && (
                <>
                  <DropdownMenuSeparator />
                  {board.archivedAt ? (
                    <DropdownMenuItem onSelect={() => actions.restoreBoard.mutate()}>
                      <Archive /> Restore board
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => actions.archiveBoard.mutate()}>
                      <Archive /> Archive board
                    </DropdownMenuItem>
                  )}
                </>
              )}
              {canDeleteBoard(ws.permissions, board) && (
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 /> Delete board
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <BoardSettingsDialog board={board} section={settings} onSectionChange={setSettings} onRequestDelete={() => setDeleteOpen(true)} />
      <BoardActivityDialog board={board} open={activityOpen} onOpenChange={setActivityOpen} />
      <AutomationsDialog open={automationsOpen} onOpenChange={setAutomationsOpen} />
      <IntegrationsDialog open={integrationsOpen} onOpenChange={setIntegrationsOpen} />
      <DeleteBoardDialog board={board} open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={() => actions.deleteBoard.mutateAsync().then(() => undefined)} />
    </header>
  );
}

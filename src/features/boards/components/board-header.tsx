"use client";

import { boardAccessOf, teamAccessFor } from "@/lib/permissions/permissions";
import { teamEditorsOf } from "@/features/boards/components/board-visibility-field";
import { ArrowLeft, Crown, Eye, Globe, History, MoreHorizontal, Pencil, Share2, ShieldCheck, Star, UserPlus, Zap } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { InlineEdit } from "@/components/shared/inline-edit";
import { AvatarStack } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Board } from "@/domain";
import { renderDropdown } from "@/components/layout/row-menu";
import { useBoardMenuActions } from "@/features/boards/board-menu";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { AutomationsDialog } from "@/features/automations/automations-dialog";
import { AutomationRing } from "@/features/automations/activity-indicator";
import { useAutomationActivity, useAutomationsInUse } from "@/features/automations/hooks";
import { BoardActivityDialog } from "@/features/boards/components/dialogs/board-activity-dialog";
import { BoardSettingsDialog, type BoardSettingsSection } from "@/features/boards/components/dialogs/board-settings-dialog";
import { DeleteBoardDialog } from "@/features/boards/components/dialogs/delete-board-dialog";
import { ShareBoardDialog, useBoardShareStatus } from "@/features/boards/components/dialogs/share-board-dialog";
import { copyToClipboard } from "@/features/members/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { boardRoleFor, canManageBoard, type PermissionContext } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { FollowControl } from "@/features/notifications/follow-control";

export function BoardHeader({ board }: { board: Board }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  const manage = canManageBoard(ws.permissions, board);
  const [renaming, setRenaming] = React.useState(false);
  const [editingDescription, setEditingDescription] = React.useState(false);
  const [settings, setSettings] = React.useState<BoardSettingsSection | null>(null);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [automationsOpen, setAutomationsOpen] = React.useState(false);
  // A rule is being carried out on this board right now, on a server the
  // person cannot see. The icon turning is the only way they would know.
  const automationsRunning = useAutomationActivity().has(board.id);
  const automationsOn = useAutomationsInUse(board.id);

  const favourite = ws.isFavourite(board.id);
  // Those added to the board, then the team's members when the team lets them edit it.
  const members = [
    ...ws.boardMembers.filter((m) => m.boardId === board.id).map((m) => ws.userById(m.userId)).filter((u): u is NonNullable<typeof u> => !!u),
    ...teamEditorsOf(ws, board),
  ];
  const team = ws.teamById(board.teamId);
  // Who can see it as things stand: its team's setting while it follows the team, else its own.
  const seeing = boardAccessOf(board, team ? teamAccessFor(team) : null).see;
  // Everyone on the board can see that it is out in the open; only its managers
  // can change that, so the badge is a button for them and a label for the rest.
  const share = useBoardShareStatus(board.id).data ?? null;
  const shared = !!share && share.enabled;
  // The same list the sidebar's board row shows; only the dialogs are ours.
  const menuActions = useBoardMenuActions(board, {
    openSettings: setSettings,
    rename: () => setRenaming(true),
    share: () => setShareOpen(true),
    requestDelete: () => setDeleteOpen(true),
    automations: () => setAutomationsOpen(true),
  });
  const shareUrl = share ? `${typeof window === "undefined" ? "" : window.location.origin}${routes.share(share.token)}` : "";

  return (
    <header className="relative px-7 pt-5 pb-4">
      {/* A whisper of the board's colour, so each board feels like its own place. */}
      <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-28 opacity-[0.12]", colorClasses(board.color).dot)} style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }} />
      <div className="relative flex items-start gap-3.5">
        <SimpleTooltip label="Back to home">
          <Button variant="ghost" size="icon-sm" asChild className="mt-0.5 text-muted-foreground">
            <Link href={routes.workspace(ws.slug)} aria-label="Back to home">
              <ArrowLeft />
            </Link>
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label={manage ? "Change icon and colour" : board.name}>
          {manage ? (
            <button type="button" onClick={() => setSettings("general")} aria-label="Change icon and colour" className={cn("mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-xl shadow-xs transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-ring sm:flex", colorClasses(board.color).solid)}>
              <DynamicIcon name={board.icon} className="size-5" />
            </button>
          ) : (
            <span className={cn("mt-0.5 hidden size-10 shrink-0 items-center justify-center rounded-xl shadow-xs sm:flex", colorClasses(board.color).solid)}>
              <DynamicIcon name={board.icon} className="size-5" />
            </span>
          )}
        </SimpleTooltip>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <h1 className="min-w-0 text-lg font-semibold tracking-tight sm:text-[22px]">
              <InlineEdit
                value={board.name}
                editing={renaming}
                onEditingChange={setRenaming}
                onSubmit={(name) => actions.updateBoard.mutate({ name })}
                disabled={!manage}
                ariaLabel="Board name"
                className={cn("-mx-1.5 rounded-lg px-1.5", manage && "hover:bg-accent/70")}
                inputClassName="h-9 w-96 text-[22px] font-semibold"
              />
            </h1>
            {board.archivedAt && (
              <SimpleTooltip label="Archived. Restore it from the board menu.">
                <Badge variant="muted" className="cursor-default">Archived</Badge>
              </SimpleTooltip>
            )}
            {shared && (
              <SimpleTooltip label="Shared by link. Click to copy it; anyone with it can read the board.">
                <button
                  type="button"
                  onClick={() => void copyToClipboard(shareUrl)}
                  aria-label="Copy share link"
                  className="rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                  data-testid="board-shared-badge"
                >
                  <Badge variant="outline" className="gap-1 text-emerald-700 hover:bg-accent dark:text-emerald-300">
                    <Globe className="size-3" /> Shared
                  </Badge>
                </button>
              </SimpleTooltip>
            )}
            <BoardAccessBadge permissions={ws.permissions} board={board} />
            {seeing !== "WORKSPACE" && board.system !== "APP_DEVELOPMENT" && (
              <SimpleTooltip label={seeing === "PRIVATE" ? "Only people added to the board can see it." : `Only ${team?.name ?? "its team"} and people added to the board can see it.`}>
                <Badge variant="outline" className="cursor-default" data-testid="board-visibility-badge">
                  {seeing === "PRIVATE" ? "Private" : "Team only"}
                </Badge>
              </SimpleTooltip>
            )}
          </div>
          <p className="mt-1.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground max-sm:hidden">
            {team && (
              <>
                <SimpleTooltip label={`Open ${team.name}`}>
                  <Link href={routes.team(ws.slug, team.id)} className="shrink-0 whitespace-nowrap hover:text-foreground hover:underline">
                    {team.name}
                  </Link>
                </SimpleTooltip>
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
              className={cn("-mx-1.5 min-w-0 rounded-lg px-1.5", manage && "hover:bg-accent/70", !board.description && "italic text-muted-foreground/70")}
              inputClassName="h-7 w-[480px] max-w-full"
            >
              {board.description || (manage ? "Add a description" : "")}
            </InlineEdit>
          </p>
        </div>

        {/* Things the board is set to (starred, followed, shared, with rules
            on) first, each tinted alike while on; then who is on it; then its
            history and its menu. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <SimpleTooltip label={favourite ? "Remove from favourites" : "Add to favourites"}>
            <Button variant="ghost" size="icon-sm" className={cn(favourite && TOGGLED)} aria-pressed={favourite} aria-label={favourite ? "Remove from favourites" : "Add to favourites"} onClick={() => actions.toggleFavourite.mutate(!favourite)} data-testid="favourite-toggle">
              <Star className={cn("size-4", favourite && "fill-current")} />
            </Button>
          </SimpleTooltip>
          <FollowControl target={{ boardId: board.id, itemId: null }} kind="board" onClassName={TOGGLED} />
          {manage && (
            <SimpleTooltip label={shared ? "Shared by link" : "Share this board by link"}>
              <Button variant="ghost" size="icon-sm" className={cn(shared && TOGGLED)} aria-label="Share this board" data-on={shared || undefined} onClick={() => setShareOpen(true)} data-testid="board-share">
                <Share2 />
              </Button>
            </SimpleTooltip>
          )}
          {/* After Share, because both are about what the board does beyond the
              people looking at it. Everyone who can see the board can read its
              rules; the dialog is what decides who may change them. */}
          <SimpleTooltip label={automationsRunning ? "Automations running" : "Automations"}>
            <Button
              variant="ghost"
              size="icon-sm"
              className={cn("relative", automationsOn && TOGGLED)}
              data-on={automationsOn || undefined}
              aria-label={automationsRunning ? "Automations running" : "Automations"}
              aria-busy={automationsRunning || undefined}
              onClick={() => setAutomationsOpen(true)}
              data-testid="board-automations"
              data-running={automationsRunning || undefined}
            >
              <Zap className={cn(automationsOn && "fill-current")} />
              {/* A ring turning round the button: a spinner, but around the
                  thing that is working rather than in place of it. */}
              {automationsRunning && <AutomationRing testId="board-automations-running" />}
            </Button>
          </SimpleTooltip>
          {/* Who is on the board, and adding someone, as one soft group. */}
          <div className="hidden items-center rounded-lg bg-surface-strong/60 p-0.5 sm:flex" data-testid="board-members-group">
            <button type="button" onClick={() => setSettings("members")} aria-label={`${members.length} board members`} className="flex h-8 items-center rounded-md px-1.5 transition-colors hover:bg-accent/70">
              <AvatarStack users={members} size="sm" max={4} apart />
            </button>
            {manage && (
              <SimpleTooltip label="Invite people to this board">
                <Button variant="ghost" size="icon-sm" className="rounded-md" aria-label="Invite people to this board" onClick={() => setSettings("members")} data-testid="board-invite">
                  <UserPlus />
                </Button>
              </SimpleTooltip>
            )}
          </div>
          <SimpleTooltip label="Board activity">
            <Button variant="ghost" size="icon-sm" aria-label="Board activity" onClick={() => setActivityOpen(true)}>
              <History />
            </Button>
          </SimpleTooltip>
          <DropdownMenu>
            <SimpleTooltip label="Board options">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Board options" data-testid="board-menu">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </SimpleTooltip>
            <DropdownMenuContent align="end" className="w-56">
              {renderDropdown(menuActions)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <BoardSettingsDialog board={board} section={settings} onSectionChange={setSettings} onRequestDelete={() => setDeleteOpen(true)} />
      <BoardActivityDialog board={board} open={activityOpen} onOpenChange={setActivityOpen} />
      <AutomationsDialog board={board} canManage={manage} open={automationsOpen} onOpenChange={setAutomationsOpen} />
      <ShareBoardDialog board={board} open={shareOpen} onOpenChange={setShareOpen} />
      <DeleteBoardDialog board={board} open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={() => actions.deleteBoard.mutateAsync().then(() => undefined)} />
    </header>
  );
}

/** The one "on" look for the header's toggles: starred, followed, shared, rules on. */
const TOGGLED = "bg-accent-soft text-accent-soft-foreground hover:bg-accent-soft hover:text-accent-soft-foreground";

/**
 * What the person looking at the board may do on it, beside its name: an icon,
 * with the words in its tooltip. Quiet except for View only, which is the one
 * worth noticing before trying to change something.
 */
const ACCESS = {
  owner: { label: "Owner", tip: "You own this board.", icon: Crown, tone: "text-muted-foreground" },
  manage: { label: "Can manage", tip: "You can edit and manage this board.", icon: ShieldCheck, tone: "text-muted-foreground" },
  edit: { label: "Can edit", tip: "You can edit items. Settings are the owner's.", icon: Pencil, tone: "text-muted-foreground" },
  view: { label: "View only", tip: "You can read this board but not change it.", icon: Eye, tone: "text-amber-600 dark:text-amber-400" },
} as const;

function BoardAccessBadge({ permissions, board }: { permissions: PermissionContext; board: Board }) {
  const role = boardRoleFor(permissions, board);
  if (!role) return null;
  const access = ACCESS[role === "OWNER" ? "owner" : canManageBoard(permissions, board) ? "manage" : role === "EDITOR" ? "edit" : "view"];
  const Icon = access.icon;
  return (
    <SimpleTooltip label={`${access.label}: ${access.tip}`}>
      <span role="img" aria-label={access.label} tabIndex={0} className={cn("inline-flex size-6 shrink-0 cursor-default items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", access.tone)} data-testid="board-access-badge">
        <Icon className="size-4" />
      </span>
    </SimpleTooltip>
  );
}

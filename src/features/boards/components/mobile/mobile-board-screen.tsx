"use client";

import { Archive, ArrowLeft, Globe, History, MoreHorizontal, Star, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { MenuSheet } from "@/components/layout/menu-sheet";
import type { MenuAction } from "@/components/layout/row-menu";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Board, BoardViewKind } from "@/domain";
import { useBoardMenuActions } from "@/features/boards/board-menu";
import { BoardActivityDialog } from "@/features/boards/components/dialogs/board-activity-dialog";
import { BoardSettingsDialog, type BoardSettingsSection } from "@/features/boards/components/dialogs/board-settings-dialog";
import { DeleteBoardDialog } from "@/features/boards/components/dialogs/delete-board-dialog";
import { ShareBoardDialog, useBoardShareStatus } from "@/features/boards/components/dialogs/share-board-dialog";
import { MobileBoardTools } from "@/features/boards/components/mobile/mobile-board-tools";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { copyToClipboard } from "@/features/members/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * The board's header on a phone: back, what board this is, and everything else
 * behind one button.
 *
 * The desktop header spreads a title, a description, a member stack, Invite,
 * Share, Activity and a menu across one line. At 375px those would each be a
 * 24px target, so the row keeps the two things a thumb reaches for — back and
 * favourite — and the rest becomes one menu of full-width rows. Every action is
 * still there, and it is the same declaration list the desktop menu is built
 * from, so neither can drift from the other.
 */
export function MobileBoardHeader({ board }: { board: Board }) {
  const ws = useWorkspace();
  const actions = useBoardActions(board);
  const manage = canManageBoard(ws.permissions, board);
  const [settings, setSettings] = React.useState<BoardSettingsSection | null>(null);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);

  const favourite = ws.isFavourite(board.id);
  const team = ws.teamById(board.teamId);
  const memberCount = ws.boardMembers.filter((m) => m.boardId === board.id).length;
  const share = useBoardShareStatus(board.id).data ?? null;
  const shared = !!share && share.enabled;
  const shareUrl = share ? `${typeof window === "undefined" ? "" : window.location.origin}${routes.share(share.token)}` : "";

  const boardActions = useBoardMenuActions(board, {
    openSettings: setSettings,
    rename: () => setRenaming(true),
    share: () => setShareOpen(true),
    requestDelete: () => setDeleteOpen(true),
  });

  // The phone's menu is the board's own actions plus the three the desktop
  // header keeps as separate buttons, which have no room here.
  const menuActions: MenuAction[] = [
    { type: "item", label: "Members", icon: <Users />, hint: String(memberCount), onSelect: () => setSettings("members") },
    ...(manage ? ([{ type: "item", label: "Invite to this board", icon: <UserPlus />, onSelect: () => setSettings("members") }] satisfies MenuAction[]) : []),
    { type: "item", label: "Board activity", icon: <History />, onSelect: () => setActivityOpen(true) },
    { type: "separator" },
    ...boardActions,
  ];

  return (
    <>
      <header className="relative shrink-0 border-b border-border/70 bg-card px-2 pt-2 pb-2">
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 opacity-[0.12]", colorClasses(board.color).dot)}
          style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }}
        />
        <div className="relative flex items-center gap-1">
          <Button variant="ghost" size="icon" asChild className="size-11 shrink-0 text-muted-foreground">
            <Link href={routes.browse(ws.slug)} aria-label="Back to browse">
              <ArrowLeft />
            </Link>
          </Button>
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", colorClasses(board.color).solid)}>
            <DynamicIcon name={board.icon} className="size-4" />
          </span>
          <span className="min-w-0 flex-1 px-1">
            <h1 className="truncate text-[17px] leading-tight font-semibold tracking-tight" data-testid="mobile-board-name">
              {board.name}
            </h1>
            <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              {team && <span className="truncate">{team.name}</span>}
              {board.archivedAt && <span className="shrink-0 rounded bg-surface-strong px-1 py-px font-medium">Archived</span>}
              {shared && (
                <button type="button" onClick={() => void copyToClipboard(shareUrl, "Link copied")} className="flex shrink-0 items-center gap-0.5 text-emerald-700 dark:text-emerald-300" data-testid="mobile-board-shared">
                  <Globe className="size-3" aria-hidden /> Shared
                </button>
              )}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-pressed={favourite}
            aria-label={favourite ? "Remove from favourites" : "Add to favourites"}
            onClick={() => actions.toggleFavourite.mutate(!favourite)}
            data-testid="mobile-favourite-toggle"
          >
            <Star className={cn("size-5", favourite && "fill-amber-400 text-amber-400")} />
          </Button>
          <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Board options" onClick={() => setMenuOpen(true)} data-testid="mobile-board-menu">
            <MoreHorizontal className="size-5" />
          </Button>
        </div>
      </header>

      {board.archivedAt && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Archive className="size-4 shrink-0" aria-hidden /> <span className="min-w-0 flex-1">Archived and read-only.</span>
          {manage && (
            <Button variant="outline" size="sm" className="h-9 shrink-0 bg-background" onClick={() => actions.restoreBoard.mutate()}>
              Restore
            </Button>
          )}
        </div>
      )}

      <MenuSheet open={menuOpen} onOpenChange={setMenuOpen} title={board.name} actions={menuActions} />
      <RenameSheet board={board} open={renaming} onOpenChange={setRenaming} />
      <BoardSettingsDialog board={board} section={settings} onSectionChange={setSettings} onRequestDelete={() => setDeleteOpen(true)} />
      <BoardActivityDialog board={board} open={activityOpen} onOpenChange={setActivityOpen} />
      <ShareBoardDialog board={board} open={shareOpen} onOpenChange={setShareOpen} />
      <DeleteBoardDialog board={board} open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={() => actions.deleteBoard.mutateAsync().then(() => undefined)} />
    </>
  );
}

/** Renaming needs a field, and the header has no room for an inline one. */
function RenameSheet({ board, open, onOpenChange }: { board: Board; open: boolean; onOpenChange: (open: boolean) => void }) {
  const actions = useBoardActions(board);
  const [name, setName] = React.useState(board.name);
  // The field starts from the current name each time it opens; adjusted during
  // render so the sheet never shows a stale name for a frame.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setName(board.name);
  }

  const save = () => {
    const next = name.trim();
    if (next && next !== board.name) actions.updateBoard.mutate({ name: next });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title="Rename board"
        footer={
          <Button className="h-11 w-full" onClick={save}>
            Save
          </Button>
        }
      >
        <div className="pb-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            aria-label="Board name"
            data-testid="mobile-board-rename-input"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The tools row, boxed so it sits clear of the header. */
export function MobileBoardToolsRow({ view, onViewChange }: { view: BoardViewKind; onViewChange: (view: BoardViewKind) => void }) {
  return (
    <div className="shrink-0 border-b border-border/70 px-3 py-2">
      <MobileBoardTools view={view} onViewChange={onViewChange} />
    </div>
  );
}

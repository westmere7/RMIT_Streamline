"use client";

import { Archive, ArchiveRestore, ArrowRight, Bell, BellOff, Copy, Inbox, Kanban, Palette, Pencil, Settings2, Share2, SquareKanban, Star, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import type { MenuAction } from "@/components/layout/row-menu";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import type { Board } from "@/domain";
import { isBoardMuted } from "@/domain";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useNotificationPreferenceMutations, useNotificationPreferences } from "@/features/notifications/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { routes } from "@/lib/routes";
import { canDeleteBoard, canManageBoard } from "@/lib/permissions/permissions";

/**
 * What each place has to supply, because it is the one thing that differs: the
 * sidebar opens dialogs it owns, the board header opens its own.
 */
export interface BoardMenuHandlers {
  openSettings: (section: "general" | "members") => void;
  /** Renaming in place where there is a name to click (the header), or the settings field where there is not. */
  rename: () => void;
  share: () => void;
  requestDelete: () => void;
}

/**
 * The board's menu, built once and rendered wherever a board is offered: the
 * row in the sidebar and the "…" in the board's own header.
 *
 * They used to be written out separately and had drifted — one could share a
 * link and rename, the other could open a view and favourite. One list means
 * the same actions in the same order, whichever way someone reaches for them;
 * only what an action *does* is passed in, since each place owns its dialogs.
 */
export function useBoardMenuActions(board: Board, handlers: BoardMenuHandlers): MenuAction[] {
  const ws = useWorkspace();
  const router = useRouter();
  const actions = useBoardActions(board);
  const preferences = useNotificationPreferences(ws.currentUser.id);
  const { setBoardSubscribed } = useNotificationPreferenceMutations(ws.currentUser.id);
  const muted = isBoardMuted(preferences.data, board.id);
  const manage = canManageBoard(ws.permissions, board);
  const favourite = ws.isFavourite(board.id);
  const teams = ws.teams.filter((t) => t.archivedAt === null);

  const list: MenuAction[] = [
    // From the sidebar these open the board; from its own header they put the
    // view back to the table or to the kanban, which is the same wish.
    { type: "item", label: "Open", icon: <SquareKanban />, onSelect: () => router.push(ws.boardPath(board)) },
    { type: "item", label: "Open as Kanban", icon: <Kanban />, onSelect: () => router.push(ws.boardPath(board, { view: "kanban" })) },
    { type: "item", label: favourite ? "Remove from favourites" : "Add to favourites", icon: <Star />, onSelect: () => actions.toggleFavourite.mutate(!favourite) },
    { type: "separator" },
    { type: "item", label: "Board settings", icon: <Settings2 />, onSelect: () => handlers.openSettings("general") },
    { type: "item", label: "Manage members", icon: <Users />, onSelect: () => handlers.openSettings("members") },
    ...(manage ? [{ type: "item", label: "Share by link…", icon: <Share2 />, onSelect: handlers.share, testId: "board-menu-share" } satisfies MenuAction] : []),
    { type: "separator" },
    { type: "item", label: "Rename board", icon: <Pencil />, disabled: !manage, onSelect: handlers.rename },
    {
      type: "sub",
      label: "Colour & icon",
      icon: <Palette />,
      disabled: !manage,
      contentClassName: "w-72 space-y-3 p-3",
      content: (
        <>
          <ColorPicker value={board.color} onChange={(color) => actions.updateBoard.mutate({ color })} />
          <IconPicker value={board.icon} onChange={(icon) => actions.updateBoard.mutate({ icon })} />
        </>
      ),
    },
    {
      type: "sub",
      label: "Move to team",
      icon: <ArrowRight />,
      disabled: !manage || !!board.system,
      items: [
        { type: "item", label: "No team", disabled: board.teamId === null, onSelect: () => actions.updateBoard.mutate({ teamId: null }) },
        { type: "separator" },
        ...teams.map<MenuAction>((t) => ({
          type: "item",
          label: t.name,
          icon: <DynamicIcon name={t.icon} className={colorClasses(t.color).text} />,
          disabled: t.id === board.teamId,
          onSelect: () => actions.updateBoard.mutate({ teamId: t.id }),
        })),
      ],
    },
    { type: "item", label: "Duplicate board", icon: <Copy />, onSelect: () => actions.duplicateBoard.mutate() },
    {
      type: "item",
      label: muted ? "Resume notifications" : "Mute notifications",
      icon: muted ? <Bell /> : <BellOff />,
      onSelect: () => setBoardSubscribed.mutate({ boardId: board.id, subscribed: muted }),
      testId: "toggle-board-subscription",
    },
    { type: "separator" },
    // The board's archive, not the board's own archiving: everything that has
    // been taken off this board, on a screen of its own. Its own section, above
    // "Archive board", so the two are never read as the same thing.
    {
      type: "item",
      label: "Archived items",
      icon: <Inbox />,
      onSelect: () => router.push(routes.boardArchive(ws.slug, board.slug)),
      testId: "board-menu-archive",
    },
  ];

  if (manage && !board.system) {
    list.push({ type: "separator" });
    list.push(
      board.archivedAt
        ? { type: "item", label: "Restore board", icon: <ArchiveRestore />, onSelect: () => actions.restoreBoard.mutate() }
        : { type: "item", label: "Archive board", icon: <Archive />, onSelect: () => actions.archiveBoard.mutate() },
    );
  }
  if (canDeleteBoard(ws.permissions, board) && !board.system) {
    list.push({ type: "item", label: "Delete board", icon: <Trash2 />, destructive: true, onSelect: handlers.requestDelete });
  }
  return list;
}

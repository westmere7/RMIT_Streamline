"use client";

import { Archive, ArrowRightLeft, Copy, CornerDownRight, Hash, Link2, Maximize2, Pencil, PictureInPicture2, Plus, Share2, SquareKanban, Trash2, Undo2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import type { MenuAction } from "@/components/layout/row-menu";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import type { BoardGroup, Item } from "@/domain";
import { useBoardContext, useCanEditUnlocked, useItemSentBack } from "@/features/boards/board-context";
import { SendBackDialog, recallSendBack, useSendBackOffer } from "@/features/booking/send-back-section";
import { useServices } from "@/features/data/data-context";
import { useAllocation } from "@/features/booking/use-allocation";
import { useTaskMenuExtras } from "@/features/items/use-task-menu-extras";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { copyToClipboard } from "@/features/members/hooks";
import { colorClasses } from "@/lib/colors";
import { canEditBoard } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";
import { useBoardUiStore } from "@/stores/board-ui-store";

/** What each surface does itself for the entries that open a field or a dialog. */
export interface ItemMenuHandlers {
  onRename: () => void;
  onAddSubitem: () => void;
  onShare: () => void;
  onDelete: () => void;
}

/**
 * A task's menu, one list for every surface: the table row's "…" and right
 * click, the phone's card sheet and the kanban card. `phone` drops what a phone
 * cannot do (a pop-up beside the board) and adds what it has no other way to
 * reach (copying the ticket). `allocating` is the selection Allocate sends,
 * when the task is part of one.
 */
export function useItemMenuActions(item: Item, group: BoardGroup, handlers: ItemMenuHandlers, options: { phone?: boolean; allocating?: readonly string[] } = {}): { actions: MenuAction[]; dialogs: React.ReactNode } {
  const { actions, dialogs } = useItemMenuList(item, group, handlers, options);
  return { actions, dialogs };
}

function useItemMenuList(item: Item, group: BoardGroup, handlers: ItemMenuHandlers, options: { phone?: boolean; allocating?: readonly string[] }): { actions: MenuAction[]; dialogs: React.ReactNode } {
  const { board, model, mutations, canEdit, canManage, openItem, itemMenu } = useBoardContext();
  const ws = useWorkspace();
  const setLinkDialogItem = useBoardUiStore((s) => s.setLinkDialogItem);
  const setMoveRequest = useBoardUiStore((s) => s.setMoveRequest);
  const setReallocateRequest = useBoardUiStore((s) => s.setReallocateRequest);
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const queueBoard = ws.boards.find((b) => b.system === "TASK_ALLOCATION" && !b.archivedAt);
  const canReallocate = !!queueBoard && canEditBoard(ws.permissions, queueBoard);
  const extras = useTaskMenuExtras(item, canEdit);
  const allocation = useAllocation();
  const phone = options.phone ?? false;
  // Sending back for what's missing: offered under Allocate; while it waits, Recall in its place.
  const services = useServices();
  const queryClient = useQueryClient();
  const sentBack = useItemSentBack(item.id);
  const canAct = useCanEditUnlocked();
  const { offered } = useSendBackOffer(item);
  const [sendingBack, setSendingBack] = React.useState(false);
  const sendBackDialog = sendingBack ? <SendBackDialog item={item} open onOpenChange={setSendingBack} /> : null;
  const dialogs = (
    <>
      {extras.dialogs}
      {sendBackDialog}
    </>
  );

  // A view over somewhere else: Open, then that page's own entries, and nothing that would act on the view's copy.
  if (itemMenu) return { actions: [{ type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) }, ...itemMenu.extra(item)], dialogs };

  const open: MenuAction[] = [
    { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
    ...(phone ? [] : [{ type: "item", label: "Open in pop-up", icon: <PictureInPicture2 />, onSelect: () => openItem(item.id, "popup") } satisfies MenuAction]),
    ...(phone && item.ticket ? [{ type: "item", label: `Copy ID ${item.ticket}`, icon: <Hash />, onSelect: () => void copyToClipboard(item.ticket!, `${item.ticket} copied`) } satisfies MenuAction] : []),
  ];

  // A subitem lives in its parent's group and goes where its task goes: open, rename, delete.
  if (item.parentItemId) {
    if (!canEdit) return { actions: open, dialogs };
    return { actions: [...open, { type: "separator" }, { type: "item", label: "Rename", icon: <Pencil />, onSelect: handlers.onRename }, { type: "item", label: "Delete", icon: <Trash2 />, destructive: true, onSelect: handlers.onDelete }], dialogs };
  }
  // Sent back and waiting: locked, so reading, and the way out.
  if (sentBack && canAct) {
    const recall: MenuAction = { type: "item", label: "Recall send back", icon: <Undo2 />, accent: true, onSelect: () => void recallSendBack(services, queryClient, item, ws.currentUser.id), testId: "menu-recall-send-back" };
    return { actions: [recall, { type: "separator" }, ...open, ...extras.reading], dialogs };
  }
  if (!canEdit) return { actions: [...open, ...extras.reading], dialogs };

  // On Task Allocation: send this request, or the selection it belongs to, straight to a team's board.
  const allocating = options.allocating && options.allocating.length > 0 ? [...options.allocating] : [item.id];
  const allocateLabel = allocating.length > 1 ? `Allocate ${allocating.length} requests to` : "Allocate to";
  const allocate: MenuAction[] = !allocation.available
    ? []
    : allocation.empty
      ? [{ type: "item", label: allocateLabel, icon: <ArrowRightLeft />, disabled: true, hint: "No boards", onSelect: () => {}, testId: "allocate-blocked" }, { type: "separator" }]
      : [
          {
            type: "sub",
            label: allocateLabel,
            icon: <ArrowRightLeft />,
            accent: true,
            // Team, then board, so the board a request lands on is always named before it is sent there.
            items: allocation.targets.map(({ team, boards }) => ({
              type: "sub" as const,
              label: team ? team.name : "No team",
              icon: team ? <DynamicIcon name={team.icon} className={cn("size-3.5", colorClasses(team.color).text)} /> : <CornerDownRight />,
              // The board is the manager's choice; the group is the board's own landing group.
              items: boards.map((target) => ({ type: "item" as const, label: target.name, icon: <SquareKanban />, onSelect: () => allocation.allocate.mutate({ itemIds: allocating, boardId: target.id }) })),
            })),
          },
          { type: "separator" },
        ];

  const sendBack: MenuAction[] = offered && !sentBack ? [{ type: "item", label: "Send back for more information…", icon: <Undo2 />, onSelect: () => setSendingBack(true), testId: "menu-send-back" }] : [];
  // Under Allocate to, inside its section; on its own section where there is no allocating.
  const top: MenuAction[] = allocate.length > 0 ? [...allocate.slice(0, -1), ...sendBack, { type: "separator" }] : sendBack.length > 0 ? [...sendBack, { type: "separator" }] : [];

  const targets = model.moveTargetsFor([item.id]).filter((g) => g.id !== group.id);
  const actions: MenuAction[] = [
    ...top,
    ...open,
    ...extras.reading,
    { type: "separator" },
    { type: "item", label: "Rename", icon: <Pencil />, onSelect: handlers.onRename },
    { type: "item", label: "Add subitem", icon: <Plus />, onSelect: handlers.onAddSubitem },
    // A copy is made by hand, and Booked by Form takes bookings only.
    ...(item.groupId === model.intakeGroupId ? [] : [{ type: "item", label: "Duplicate", icon: <Copy />, onSelect: () => void mutations.duplicateItem(item.id) } satisfies MenuAction]),
    ...(canManage ? [{ type: "item", label: "Share by link…", icon: <Share2 />, onSelect: handlers.onShare } satisfies MenuAction] : []),
    // Nothing in the allocation queue is linkable: allocating is the one way off that board.
    ...(allocation.available
      ? []
      : [
          {
            type: "item",
            label: "Link to another item…",
            icon: <Link2 />,
            onSelect: () => {
              setLinkDialogItem(item.id);
              openItem(item.id);
            },
          } satisfies MenuAction,
        ]),
    {
      type: "sub",
      label: "Move to group",
      icon: <CornerDownRight />,
      // With one group there is nowhere to go: greyed out rather than an empty list.
      disabled: targets.length === 0,
      items: targets.map((g) => ({
        type: "item" as const,
        label: g.name,
        icon: <span className={cn("size-2.5 rounded-full", colorClasses(g.color).dot)} />,
        onSelect: () => void mutations.moveItemsToGroup([item.id], g.id),
      })),
    },
    // To another board: not off a built-in board (Task Allocation allocates instead).
    ...(board.system ? [] : [{ type: "item", label: "Move to board…", icon: <ArrowRightLeft />, onSelect: () => setMoveRequest(item.id), testId: "item-move-board" } satisfies MenuAction]),
    // Back to Task Allocation, reset: a booked task, for whoever can edit it (admins and allocators).
    ...(!board.system && canReallocate && item.bookedVia ? [{ type: "item", label: "Re-allocate…", icon: <Undo2 />, onSelect: () => setReallocateRequest(item.id), testId: "item-reallocate" } satisfies MenuAction] : []),
    ...extras.columns,
    { type: "separator" },
    { type: "item", label: "Archive", icon: <Archive />, onSelect: () => setArchiveRequest([item.id]) },
    { type: "item", label: "Delete", icon: <Trash2 />, destructive: true, onSelect: handlers.onDelete },
  ];
  return { actions, dialogs };
}

"use client";

import { SquareKanban } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardRealtime } from "@/features/boards/hooks/use-board-realtime";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useSentBackItems } from "@/features/booking/send-back-hooks";
import { ReallocateDialog } from "@/features/boards/components/dialogs/reallocate-dialog";
import { useBoardUpdates } from "@/features/comments/updates";
import { ItemDetailPanel, ItemPanelSkeleton } from "@/features/items/item-detail-panel";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard, canManageBoard } from "@/lib/permissions/permissions";

const NO_FILTERS = { personIds: [], statusIds: [], priorityIds: [], groupIds: [], tags: [], date: null };

/**
 * The app's own task panel away from the task's board (the internal portal, the
 * dashboard): the board is read as its page reads it, and the panel edits the
 * task exactly as it would there, with what the reader may do there. A strip
 * under its header names the board and opens it with the task open.
 *
 * `popup` shows it as the board's "Open in pop-up" does (a centred dialog; the
 * full-screen panel on a phone), for a page that has no side to put a panel on.
 */
export function TaskPanelHost({ boardId, itemId, onOpen, onClose, popup = false }: { boardId: string; itemId: string; onOpen: (id: string) => void; onClose: () => void; popup?: boolean }) {
  const ws = useWorkspace();
  const board = ws.boardById(boardId);
  const snapshot = useBoardSnapshot(boardId);
  const mutations = useBoardMutations(boardId);
  useBoardRealtime(boardId);
  const [now] = React.useState(() => new Date());

  const model = React.useMemo(
    () => (snapshot.data ? buildBoardModel(snapshot.data, { search: "", filters: NO_FILTERS, sort: null, now, userName: (id) => ws.userById(id)?.displayName }) : null),
    [snapshot.data, now, ws],
  );
  const itemIds = React.useMemo(() => (snapshot.data ? snapshot.data.items.map((item) => item.id) : []), [snapshot.data]);
  const updates = useBoardUpdates(boardId, itemIds);
  const sentBackItemIds = useSentBackItems(boardId, snapshot.data?.items, snapshot.dataUpdatedAt);

  const openItem = React.useCallback((id: string | null) => (id ? onOpen(id) : onClose()), [onOpen, onClose]);
  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      board && model
        ? {
            board,
            model,
            mutations,
            users: ws.activeUsers,
            people: ws.users,
            canEdit: canEditBoard(ws.permissions, board),
            canManage: canManageBoard(ws.permissions, board),
            openItem,
            openItemUpdates: openItem,
            openEditLabels: () => undefined,
            now,
            showTicket: true,
            setShowTicket: () => undefined,
            updates,
            sentBackItemIds,
          }
        : null,
    [board, model, mutations, ws.activeUsers, ws.users, ws.permissions, openItem, now, updates, sentBackItemIds],
  );

  if (!contextValue || !board) return <ItemPanelSkeleton onClose={onClose} />;
  return (
    <BoardContextProvider value={contextValue}>
      <ItemDetailPanel
        itemId={itemId}
        onClose={onClose}
        popup={popup}
        notice={
          // The board the task is on, opened with the task open there.
          <div className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2 text-[13px]" data-testid="task-host-board-notice">
            <SquareKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              On <span className="font-medium">{board.name}</span>
            </span>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href={ws.boardPath(board, { itemId })} data-testid="task-host-open-board">
                Open board
              </Link>
            </Button>
          </div>
        }
      />
      {/* The panel's menu asks for it; the board page mounts its own, and this host is never on one. */}
      <ReallocateDialog />
    </BoardContextProvider>
  );
}

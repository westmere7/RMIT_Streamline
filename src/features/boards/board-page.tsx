"use client";

import { Archive, LayoutGrid, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BOARD_VIEWS, type BoardColumn, type BoardViewKind } from "@/domain";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { BoardHeader } from "@/features/boards/components/board-header";
import { BoardToolbar } from "@/features/boards/components/board-toolbar";
import { BoardViewTabs } from "@/features/boards/components/board-view-tabs";
import { EditLabelsDialog } from "@/features/boards/components/pickers/edit-labels-dialog";
import { BoardTable } from "@/features/boards/components/table/board-table";
import { CalendarView } from "@/features/boards/components/views/calendar-view";
import { FilesView } from "@/features/boards/components/views/files-view";
import { KanbanView } from "@/features/boards/components/views/kanban-view";
import { TimelineView } from "@/features/boards/components/views/timeline-view";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardRealtime } from "@/features/boards/hooks/use-board-realtime";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useServices } from "@/features/data/data-context";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard, canManageBoard, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { readRememberedView, rememberView, useBoardUi } from "@/stores/board-ui-store";

function isViewKind(value: string | null): value is BoardViewKind {
  return !!value && (BOARD_VIEWS as readonly string[]).includes(value);
}

export function BoardPage() {
  const params = useParams<{ boardSlug: string }>();
  const ws = useWorkspace();
  const board = ws.boards.find((b) => b.slug === params.boardSlug);

  if (!board) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Board not found"
        description="It may have been renamed or deleted."
        action={
          <Button variant="outline" asChild>
            <Link href={routes.workspace(ws.slug)}>Back to home</Link>
          </Button>
        }
      />
    );
  }
  if (!canViewBoard(ws.permissions, board)) {
    return <EmptyState icon={Lock} title="This board is private" description="Ask the board owner to add you as a member." />;
  }
  return <BoardScreen key={board.id} boardId={board.id} />;
}

function BoardScreen({ boardId }: { boardId: string }) {
  const ws = useWorkspace();
  const board = ws.boardById(boardId)!;
  const services = useServices();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const snapshot = useBoardSnapshot(boardId);
  const mutations = useBoardMutations(boardId);
  const actions = useBoardActions(board);
  const ui = useBoardUi(boardId);
  const [editLabelsColumn, setEditLabelsColumn] = React.useState<BoardColumn | null>(null);
  const [now] = React.useState(() => new Date());
  useBoardRealtime(boardId);

  // Remember recently visited boards for the home page.
  React.useEffect(() => {
    void services.repos.admin.recordBoardVisit(ws.currentUser.id, boardId);
  }, [services, ws.currentUser.id, boardId]);

  // The URL is the source of truth for the view; the remembered view fills in when it is absent.
  const viewParam = searchParams.get("view");
  const [rememberedView, setRememberedView] = React.useState<BoardViewKind | null>(() => readRememberedView(boardId));
  const view: BoardViewKind = isViewKind(viewParam) ? viewParam : (rememberedView ?? "table");

  const itemId = searchParams.get("item");

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || (k === "view" && v === "table")) next.delete(k);
        else next.set(k, v);
      }
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setView = (next: BoardViewKind) => {
    setRememberedView(next);
    rememberView(boardId, next);
    replaceParams({ view: next });
  };
  const openItem = React.useCallback((id: string | null) => replaceParams({ item: id }), [replaceParams]);

  const model = React.useMemo(
    () => (snapshot.data ? buildBoardModel(snapshot.data, { search: ui.search, filters: ui.filters, sort: ui.sort, now }) : null),
    [snapshot.data, ui.search, ui.filters, ui.sort, now],
  );

  const canEdit = canEditBoard(ws.permissions, board) && board.archivedAt === null;
  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      model
        ? {
            board,
            model,
            mutations,
            users: ws.users.filter((u) => u.deactivatedAt === null),
            canEdit,
            canManage: canManageBoard(ws.permissions, board),
            openItem,
            openEditLabels: setEditLabelsColumn,
            now,
          }
        : null,
    [board, model, mutations, ws.users, ws.permissions, canEdit, openItem, now],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="board-page">
      <BoardHeader board={board} />
      {board.archivedAt && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-5 py-1.5 text-[13px] text-amber-900">
          <Archive className="size-4" /> This board is archived and read-only.
          {canManageBoard(ws.permissions, board) && (
            <Button variant="outline" size="sm" className="ml-auto bg-background" onClick={() => actions.restoreBoard.mutate()}>
              Restore board
            </Button>
          )}
        </div>
      )}
      <BoardViewTabs view={view} onChange={setView} />
      {snapshot.isError && <ErrorState title="Something went wrong while loading this board." error={snapshot.error} onRetry={() => snapshot.refetch()} />}
      {!snapshot.isError && !contextValue && <BoardSkeleton />}
      {contextValue && (
        <BoardContextProvider value={contextValue}>
          {view === "table" && <BoardToolbar />}
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {view === "table" && <BoardTable />}
              {view === "kanban" && <KanbanView />}
              {view === "timeline" && <TimelineView />}
              {view === "calendar" && <CalendarView />}
              {view === "files" && <FilesView />}
            </div>
            {itemId && <ItemDetailPanel itemId={itemId} onClose={() => openItem(null)} />}
          </div>
          <EditLabelsDialog
            column={editLabelsColumn}
            open={editLabelsColumn !== null}
            onOpenChange={(open) => !open && setEditLabelsColumn(null)}
            onSave={(columnId, settings) => void mutations.updateColumn(columnId, { settings })}
          />
        </BoardContextProvider>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading board">
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-20" />)}
      </div>
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="space-y-1">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ))}
    </div>
  );
}

"use client";

import { Archive, SquareKanban, Lock } from "lucide-react";
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
import { boardBarClasses, BoardViewSwitcher } from "@/features/boards/components/board-view-switcher";
import { EditLabelsDialog } from "@/features/boards/components/pickers/edit-labels-dialog";
import { EditTagsDialog } from "@/features/boards/components/pickers/edit-tags-dialog";
import { BoardTable } from "@/features/boards/components/table/board-table";
import { CalendarView } from "@/features/boards/components/views/calendar-view";
import { ChartView } from "@/features/boards/components/views/chart-view";
import { GanttView } from "@/features/boards/components/views/gantt-view";
import { KanbanView } from "@/features/boards/components/views/kanban-view";
import { TimelineView } from "@/features/boards/components/views/timeline-view";
import { WorkloadView } from "@/features/boards/components/views/workload-view";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardRealtime } from "@/features/boards/hooks/use-board-realtime";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { tagOptionsFor } from "@/features/boards/tag-palette";
import { useServices } from "@/features/data/data-context";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { useBoardUpdates } from "@/features/comments/updates";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard, canManageBoard, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { readRememberedView, rememberView, useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

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
        icon={SquareKanban}
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

  // The URL is the source of truth for the view. Otherwise the view this person
  // last used on this board fills in: the browser's copy first, then the one
  // saved with their board visit, which follows them to another device.
  const viewParam = searchParams.get("view");
  const [rememberedView, setRememberedView] = React.useState<BoardViewKind | null>(() => readRememberedView(boardId, ws.currentUser.id));
  React.useEffect(() => {
    if (rememberedView !== null) return;
    let cancelled = false;
    void services.repos.admin.getBoardVisitView(ws.currentUser.id, boardId).then((saved) => {
      if (cancelled || !saved) return;
      rememberView(boardId, saved, ws.currentUser.id);
      setRememberedView(saved);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board; a later choice goes through setView
  }, [boardId, ws.currentUser.id]);
  const view: BoardViewKind = isViewKind(viewParam) ? viewParam : (rememberedView ?? "table");

  const itemId = searchParams.get("item");

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      // Read the query at call time rather than closing over `searchParams`:
      // depending on it made this callback — and with it the board context —
      // change on every navigation, which re-rendered every row and cell on the
      // board each time the detail panel opened.
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || (k === "view" && v === "table")) next.delete(k);
        else next.set(k, v);
      }
      const query = next.toString();
      router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, pathname],
  );

  const setView = (next: BoardViewKind) => {
    setRememberedView(next);
    rememberView(boardId, next, ws.currentUser.id);
    void services.repos.admin.recordBoardVisit(ws.currentUser.id, boardId, next);
    replaceParams({ view: next });
  };
  const openItem = React.useCallback((id: string | null) => replaceParams({ item: id }), [replaceParams]);
  const setRequestedItemTab = useBoardUiStore((s) => s.setRequestedItemTab);
  const openItemUpdates = React.useCallback(
    (id: string) => {
      setRequestedItemTab({ itemId: id, tab: "updates" });
      replaceParams({ item: id });
    },
    [replaceParams, setRequestedItemTab],
  );

  // The URL owns which item is open; the store mirrors it so rows can subscribe
  // to a boolean rather than re-rendering the whole table on every open.
  const setBoardLoading = useBoardUiStore((s) => s.setBoardLoading);
  React.useEffect(() => {
    setBoardLoading(snapshot.isFetching);
    return () => setBoardLoading(false);
  }, [snapshot.isFetching, setBoardLoading]);

  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  React.useEffect(() => {
    setOpenItemId(itemId);
    return () => setOpenItemId(null);
  }, [itemId, setOpenItemId]);

  const model = React.useMemo(
    () => (snapshot.data ? buildBoardModel(snapshot.data, { search: ui.search, filters: ui.filters, sort: ui.sort, now, userName: (id) => ws.userById(id)?.displayName }) : null),
    [snapshot.data, ui.search, ui.filters, ui.sort, now, ws],
  );

  const canEdit = canEditBoard(ws.permissions, board) && board.archivedAt === null;
  const itemIds = React.useMemo(() => (snapshot.data ? snapshot.data.items.map((item) => item.id) : []), [snapshot.data]);
  const updates = useBoardUpdates(board.id, itemIds);

  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      model
        ? {
            board,
            model,
            mutations,
            users: ws.activeUsers,
            canEdit,
            canManage: canManageBoard(ws.permissions, board),
            openItem,
            openItemUpdates,
            openEditLabels: setEditLabelsColumn,
            now,
            updates,
          }
        : null,
    [board, model, mutations, ws.activeUsers, ws.permissions, canEdit, openItem, openItemUpdates, now, updates],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="board-page">
      <BoardHeader board={board} />
      {board.archivedAt && (
        <div className="flex items-center gap-2 border-b bg-amber-50 px-6 py-2 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <Archive className="size-4" /> This board is archived and read-only.
          {canManageBoard(ws.permissions, board) && (
            <Button variant="outline" size="sm" className="ml-auto bg-background" onClick={() => actions.restoreBoard.mutate()}>
              Restore board
            </Button>
          )}
        </div>
      )}
      {!contextValue && (
        <div className={boardBarClasses}>
          <BoardViewSwitcher view={view} onChange={setView} />
        </div>
      )}
      {snapshot.isError && <ErrorState title="Something went wrong while loading this board." error={snapshot.error} onRetry={() => snapshot.refetch()} />}
      {!snapshot.isError && !contextValue && <BoardSkeleton />}
      {contextValue && (
        <BoardContextProvider value={contextValue}>
          <BoardToolbar view={view} onViewChange={setView} />
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {view === "table" && <BoardTable />}
              {view === "kanban" && <KanbanView />}
              {view === "timeline" && <TimelineView />}
              {view === "calendar" && <CalendarView />}
              {view === "gantt" && <GanttView />}
              {view === "workload" && <WorkloadView />}
              {view === "chart" && <ChartView />}
            </div>
            {/* On the Kanban the panel floats over the lanes rather than squeezing them. */}
            {itemId && <ItemDetailPanel itemId={itemId} onClose={() => openItem(null)} overlay={view === "kanban"} />}
          </div>
          <EditLabelsDialog
            column={editLabelsColumn?.type === "TAGS" ? null : editLabelsColumn}
            open={editLabelsColumn !== null && editLabelsColumn.type !== "TAGS"}
            onOpenChange={(open) => !open && setEditLabelsColumn(null)}
            onSave={(columnId, settings) => void mutations.updateColumn(columnId, { settings })}
          />
          <EditTagsDialog
            column={editLabelsColumn?.type === "TAGS" ? editLabelsColumn : null}
            options={editLabelsColumn?.type === "TAGS" && snapshot.data ? tagOptionsFor(editLabelsColumn, snapshot.data.values) : []}
            open={editLabelsColumn?.type === "TAGS"}
            onOpenChange={(open) => !open && setEditLabelsColumn(null)}
            onSave={(columnId, options, renames) => void mutations.updateColumnTags(columnId, options, renames)}
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

"use client";

import { Archive, SquareKanban, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { flushSync } from "react-dom";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingSweep } from "@/components/shared/loading-sweep";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BOARD_VIEWS, type BoardColumn, type BoardViewKind } from "@/domain";
import type { BoardSnapshot } from "@/services";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { BoardHeader } from "@/features/boards/components/board-header";
import { BoardToolbar } from "@/features/boards/components/board-toolbar";
import { boardBarClasses, BoardViewSwitcher } from "@/features/boards/components/board-view-switcher";
import { ArchiveItemsDialog } from "@/features/boards/components/dialogs/archive-items-dialog";
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
import { useArchiveCount } from "@/features/boards/archive/use-archive";
import { useViewSettingsFor } from "@/features/boards/components/views/view-settings";
import { MobileBoardHeader, MobileBoardToolsRow } from "@/features/boards/components/mobile/mobile-board-screen";
import { MobileKanbanView } from "@/features/boards/components/mobile/mobile-kanban-view";
import { MobileTableView } from "@/features/boards/components/mobile/mobile-table-view";
import { useMobileViewPref } from "@/features/boards/components/mobile/mobile-view-prefs";
import { useIsMobile } from "@/hooks/use-mobile";
import { tagOptionsFor } from "@/features/boards/tag-palette";
import { useServices } from "@/features/data/data-context";
import { ItemDetailPanel, ItemPanelSkeleton } from "@/features/items/item-detail-panel";
import { useBoardUpdates } from "@/features/comments/updates";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard, canManageBoard, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { readRememberedView, rememberView, useBoardUi, useBoardUiStore, type ItemOpenMode } from "@/stores/board-ui-store";

function isViewKind(value: string | null): value is BoardViewKind {
  return !!value && (BOARD_VIEWS as readonly string[]).includes(value);
}

/**
 * The detail panel, subscribed to which task is open rather than handed it.
 *
 * Opening a task used to be state of the page, so every click redrew the whole
 * board along with the panel. Here, the click redraws the panel and the two
 * rows whose highlight moved, and nothing else.
 *
 * `skeleton` is the board behind it still loading — a link followed to a task
 * on a board that is not on screen yet — where the frame goes up first and
 * fills in once the board lands.
 */
function ItemPanelSlot({ onClose, overlay, skeleton, popupAllowed }: { onClose: (id: string | null) => void; overlay?: boolean; skeleton?: boolean; popupAllowed?: boolean }) {
  const itemId = useBoardUiStore((s) => s.openItemId);
  const popup = useBoardUiStore((s) => s.openItemMode) === "popup" && !!popupAllowed;
  if (!itemId) return null;
  if (skeleton) return <ItemPanelSkeleton onClose={() => onClose(null)} />;
  return <ItemDetailPanel itemId={itemId} onClose={() => onClose(null)} overlay={overlay} popup={popup} />;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const snapshot = useBoardSnapshot(boardId);
  const mutations = useBoardMutations(boardId);
  const actions = useBoardActions(board);
  const ui = useBoardUi(boardId);
  const [editLabelsColumn, setEditLabelsColumn] = React.useState<BoardColumn | null>(null);
  const [now] = React.useState(() => new Date());
  // The ticket column is the table's own setting: per person, per board.
  const [tableSettings, updateTableSettings] = useViewSettingsFor(boardId, "table", { showTicket: true });
  const isMobile = useIsMobile();
  // Cards or the grid on a phone. Its own key: the desktop table has no such
  // choice, and the board's view settings follow the person to another device.
  const [tableMode, setTableMode] = useMobileViewPref<"cards" | "grid">(`table-mode:${boardId}`, "cards");
  // Ticking several cards at once; switched on from the tools strip, read by the view.
  const [selectMode, setSelectMode] = React.useState(false);
  const setShowTicket = React.useCallback((showTicket: boolean) => updateTableSettings({ showTicket }), [updateTableSettings]);
  // The archive, offered under the views as well as in the board's menu, with
  // how much is in it. One count for the board being looked at, not one per
  // board in the sidebar.
  const archivedCount = useArchiveCount(boardId);
  const archiveEntry = React.useMemo(
    () => ({ href: routes.boardArchive(ws.slug, board.slug), count: archivedCount.data ?? null }),
    [ws.slug, board.slug, archivedCount.data],
  );
  useBoardRealtime(boardId);

  // Remember recently visited boards for the home page.
  React.useEffect(() => {
    void services.repos.admin.recordBoardVisit(ws.currentUser.id, boardId).catch(() => undefined);
  }, [services, ws.currentUser.id, boardId]);

  // The URL is the source of truth for the view. Otherwise the view this person
  // last used on this board fills in: the browser's copy first, then the one
  // saved with their board visit, which follows them to another device.
  const viewParam = searchParams.get("view");
  const [rememberedView, setRememberedView] = React.useState<BoardViewKind | null>(() => readRememberedView(boardId, ws.currentUser.id));
  React.useEffect(() => {
    if (rememberedView !== null) return;
    let cancelled = false;
    void services.repos.admin
      .getBoardVisitView(ws.currentUser.id, boardId)
      .then((saved) => {
        if (cancelled || !saved) return;
        rememberView(boardId, saved, ws.currentUser.id);
        setRememberedView(saved);
      })
      // The board opens on its default view if the saved one cannot be read.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board; a later choice goes through setView
  }, [boardId, ws.currentUser.id]);
  const view: BoardViewKind = isViewKind(viewParam) ? viewParam : (rememberedView ?? "table");

  const urlItemId = searchParams.get("item");

  /**
   * Put the open task and the chosen view in the URL, so both survive a reload
   * and can be sent to somebody.
   *
   * Written straight to the history rather than through `router.replace`: both
   * are read only on the client, and asking the router for them fetched the
   * route again — measured at 130-450ms per click for a page that renders the
   * same thing either way. Next reads the history back into `useSearchParams`,
   * so a deep link, a reload and the back button all still work.
   *
   * The query is read at call time rather than closed over from
   * `searchParams`: depending on that made this callback — and with it the
   * board context — change on every navigation, which re-rendered every row and
   * cell on the board each time the detail panel opened.
   */
  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "" || (k === "view" && v === "table")) next.delete(k);
        else next.set(k, v);
      }
      const query = next.toString();
      window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}`);
    },
    [pathname],
  );

  const setView = (next: BoardViewKind) => {
    setRememberedView(next);
    rememberView(boardId, next, ws.currentUser.id);
    void services.repos.admin.recordBoardVisit(ws.currentUser.id, boardId, next).catch(() => undefined);
    replaceParams({ view: next });
  };
  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  const setOpenItemMode = useBoardUiStore((s) => s.setOpenItemMode);
  /**
   * Open a task in the panel, or close it — on screen before the handler returns.
   *
   * Which task is open is kept in the store rather than in this component, and
   * only the panel and the two rows changing highlight subscribe to it. Held
   * here it was state of the page, so every click redrew the board as well —
   * measured at ~95ms of blocked main thread for a table that had not changed
   * by so much as a cell.
   *
   * The flush is for the rest of the click: the URL is written in the same
   * handler, and Next reads it back as a router update, which would otherwise
   * sweep this along with it and land it a render later than it should.
   */
  const openItem = React.useCallback(
    (id: string | null, mode?: ItemOpenMode) => {
      flushSync(() => {
        // An explicit mode is the caller asking for one. Without it the way the
        // task is being looked at carries over — a breadcrumb followed from
        // inside the pop-up stays a pop-up — and closing puts it back to the
        // panel, so the next row clicked opens where rows always open.
        if (id === null) setOpenItemMode("panel");
        else if (mode) setOpenItemMode(mode);
        setOpenItemId(id);
      });
      // And the URL is bookkeeping. Writing it here costs ~150ms of router
      // reconciliation, which would sit between the flush above and the browser
      // getting a chance to paint it; a frame later it is free.
      requestAnimationFrame(() => replaceParams({ item: id }));
    },
    [replaceParams, setOpenItemId, setOpenItemMode],
  );
  const setRequestedItemTab = useBoardUiStore((s) => s.setRequestedItemTab);
  const openItemUpdates = React.useCallback(
    (id: string) => {
      setRequestedItemTab({ itemId: id, tab: "updates" });
      openItem(id);
    },
    [openItem, setRequestedItemTab],
  );

  const setBoardLoading = useBoardUiStore((s) => s.setBoardLoading);
  React.useEffect(() => {
    setBoardLoading(snapshot.isFetching);
    return () => setBoardLoading(false);
  }, [snapshot.isFetching, setBoardLoading]);

  // The URL is the other way a task opens — a deep link followed in, a back
  // button — and the one that survives a reload. The click has already set the
  // store; this is the route catching up with it, or overruling it.
  React.useEffect(() => {
    setOpenItemId(urlItemId);
    return () => setOpenItemId(null);
  }, [urlItemId, setOpenItemId]);

  // A link to a task that has since been put away lands here, on a board that
  // no longer holds it. Rather than a panel that says "not found", the archive
  // opens on it: the task is still there, just somewhere else. Only a task of
  // this board that is actually archived is sent on; anything else is left to
  // the panel's own not-found state.
  const router = useRouter();
  React.useEffect(() => {
    if (!urlItemId || !snapshot.data || snapshot.data.items.some((i) => i.id === urlItemId)) return;
    let cancelled = false;
    void services.repos.items
      .getById(urlItemId)
      .then((found) => {
        if (cancelled || !found || !found.archivedAt || found.boardId !== board.id) return;
        router.replace(routes.boardArchive(ws.slug, board.slug, { itemId: urlItemId }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [urlItemId, snapshot.data, services, board.id, board.slug, ws.slug, router]);

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
            showTicket: tableSettings.showTicket,
            setShowTicket,
            updates,
          }
        : null,
    [board, model, mutations, ws.activeUsers, ws.permissions, canEdit, openItem, openItemUpdates, now, updates, tableSettings.showTicket, setShowTicket],
  );

  // Next holds this page on screen until the next one is ready, so a board
  // being left looks identical to one being read. It says so instead: the
  // sweep runs and the board it is about to stop being fades back.
  const navPending = useUiStore((s) => s.navPending);
  const leaving = !!navPending && navPending !== pathname;
  const waiting = leaving || (!snapshot.isError && !contextValue);

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="board-page">
        {waiting && <LoadingSweep label="Loading board" />}
        <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", leaving && "pointer-events-none opacity-60")}>
        <MobileBoardHeader board={board} />
        {snapshot.isError && <ErrorState title="Something went wrong while loading this board." error={snapshot.error} onRetry={() => snapshot.refetch()} />}
        {!snapshot.isError && !contextValue && <BoardSkeleton />}
        {/* Followed a link to a task: the panel is what was asked for, so it
            goes up now and fills in when the board arrives behind it. */}
        {!snapshot.isError && !contextValue && <ItemPanelSlot onClose={openItem} skeleton />}
        {contextValue && (
          <BoardContextProvider value={contextValue}>
            <MobileBoardToolsRow view={view} onViewChange={setView} tableMode={tableMode} onTableModeChange={setTableMode} selectMode={selectMode} onSelectModeChange={setSelectMode} />
            <MobileBoardViews view={view} tableMode={tableMode} selectMode={selectMode} onSelectModeChange={setSelectMode} />
            {/* Full screen on a phone: the panel already goes fixed inset-0 below 1024. */}
            <ItemPanelSlot onClose={openItem} />
            <BoardLabelDialogs column={editLabelsColumn} onClose={() => setEditLabelsColumn(null)} snapshot={snapshot.data ?? null} mutations={mutations} />
            <ArchiveItemsDialog />
          </BoardContextProvider>
        )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="board-page">
      {/* Either the board on screen is on its way out, or the one asked for has
          not arrived. Shown here rather than on the sidebar row that asked for
          it: this is where it is being waited for — and outside the fade below,
          since a loading bar that dims with the thing it is reporting on is
          faintest exactly when it is needed. */}
      {waiting && <LoadingSweep label="Loading board" />}
      <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", leaving && "pointer-events-none opacity-60")}>
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
          <BoardViewSwitcher view={view} onChange={setView} archive={archiveEntry} />
        </div>
      )}
      {snapshot.isError && <ErrorState title="Something went wrong while loading this board." error={snapshot.error} onRetry={() => snapshot.refetch()} />}
      {!snapshot.isError && !contextValue && (
        <div className="relative flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <BoardSkeleton />
          </div>
          {/* Followed a link to a task: the panel is what was asked for, so it
              goes up now and fills in when the board arrives behind it. */}
          <ItemPanelSlot onClose={openItem} skeleton />
        </div>
      )}
      {contextValue && (
        <BoardContextProvider value={contextValue}>
          <BoardToolbar view={view} onViewChange={setView} archive={archiveEntry} />
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
            <ItemPanelSlot onClose={openItem} overlay={view === "kanban"} popupAllowed />
          </div>
          <BoardLabelDialogs column={editLabelsColumn} onClose={() => setEditLabelsColumn(null)} snapshot={snapshot.data ?? null} mutations={mutations} />
            <ArchiveItemsDialog />
        </BoardContextProvider>
      )}
      </div>
    </div>
  );
}

/**
 * Which presentation each view gets on a phone.
 *
 * The Main Table and the Kanban have mobile presentations of their own, because
 * a grid of cells and a row of 300px lanes are the two things a phone cannot
 * show. The date-axis views — timeline, calendar, gantt, workload, chart — keep
 * their existing implementations: they already scroll inside their own
 * containers and their control bars wrap, so what they need is a frame that
 * holds them to the screen, not a rewrite that would cost them their
 * capabilities.
 */
function MobileBoardViews({ view, tableMode, selectMode, onSelectModeChange }: { view: BoardViewKind; tableMode: "cards" | "grid"; selectMode: boolean; onSelectModeChange: (on: boolean) => void }) {
  if (view === "table") return <MobileTableView mode={tableMode} selectMode={selectMode} onSelectModeChange={onSelectModeChange} />;
  if (view === "kanban") return <MobileKanbanView />;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="mobile-view-frame">
      {view === "timeline" && <TimelineView />}
      {view === "calendar" && <CalendarView />}
      {view === "gantt" && <GanttView />}
      {view === "workload" && <WorkloadView />}
      {view === "chart" && <ChartView />}
    </div>
  );
}

/** The two label editors, shared by both shells so neither can drift. */
function BoardLabelDialogs({
  column,
  onClose,
  snapshot,
  mutations,
}: {
  column: BoardColumn | null;
  onClose: () => void;
  snapshot: BoardSnapshot | null;
  mutations: ReturnType<typeof useBoardMutations>;
}) {
  return (
    <>
      <EditLabelsDialog
        column={column?.type === "TAGS" ? null : column}
        open={column !== null && column.type !== "TAGS"}
        onOpenChange={(open) => !open && onClose()}
        onSave={(columnId, settings) => void mutations.updateColumn(columnId, { settings })}
      />
      <EditTagsDialog
        column={column?.type === "TAGS" ? column : null}
        options={column?.type === "TAGS" && snapshot ? tagOptionsFor(column, snapshot.values) : []}
        open={column?.type === "TAGS"}
        onOpenChange={(open) => !open && onClose()}
        onSave={(columnId, options, renames) => void mutations.updateColumnTags(columnId, options, renames)}
      />
    </>
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

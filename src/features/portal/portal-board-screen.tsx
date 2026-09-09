"use client";

import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { BOARD_VIEWS, type BoardViewKind, type PortalBoardPayload } from "@/domain";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { BoardToolbar } from "@/features/boards/components/board-toolbar";
import { MobileBoardTools } from "@/features/boards/components/mobile/mobile-board-tools";
import { MobileKanbanView } from "@/features/boards/components/mobile/mobile-kanban-view";
import { MobileTableView } from "@/features/boards/components/mobile/mobile-table-view";
import { useMobileViewPref } from "@/features/boards/components/mobile/mobile-view-prefs";
import { BoardTable } from "@/features/boards/components/table/board-table";
import { CalendarView } from "@/features/boards/components/views/calendar-view";
import { ChartView } from "@/features/boards/components/views/chart-view";
import { GanttView } from "@/features/boards/components/views/gantt-view";
import { KanbanView } from "@/features/boards/components/views/kanban-view";
import { TimelineView } from "@/features/boards/components/views/timeline-view";
import { useViewSettingsFor } from "@/features/boards/components/views/view-settings";
import { WorkloadView } from "@/features/boards/components/views/workload-view";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { ShareGuestProviders } from "@/features/share/share-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

/**
 * A department's requests, as a board.
 *
 * The portal used to draw its own list, its own cards and its own detail panel
 * — three things the application already has, done again, worse. This renders
 * the real ones: the board toolbar with its search, filters, sort and grouping,
 * all seven views, and the item panel a member of staff sees, on a board that
 * exists only for this department (`buildPortalBoard`).
 *
 * The mechanism is the one the public board link uses. `ShareGuestProviders`
 * builds a read-only data layer over the payload, so every component below
 * reads through the ordinary hooks and none of them knows it is in a portal.
 * Read-only is not a matter of hiding buttons: the repositories underneath
 * refuse to write, and `canEdit` is false, so there is nothing to press.
 */
export function PortalBoardScreen({ token, payload }: { token: string; payload: PortalBoardPayload }) {
  return (
    <ShareGuestProviders payload={payload} path={`/portal/${encodeURIComponent(token)}`}>
      <PortalBoard payload={payload} />
    </ShareGuestProviders>
  );
}

function isViewKind(value: string | null): value is BoardViewKind {
  return !!value && (BOARD_VIEWS as readonly string[]).includes(value);
}

function PortalBoard({ payload }: { payload: PortalBoardPayload }) {
  const board = payload.board;
  const router = useRouter();
  const searchParams = useSearchParams();
  const snapshot = useBoardSnapshot(board.id);
  const mutations = useBoardMutations(board.id);
  const [now] = React.useState(() => new Date());
  const [tableSettings, updateTableSettings] = useViewSettingsFor(board.id, "table", { showReference: true });
  const isMobile = useIsMobile();
  const [tableMode, setTableMode] = useMobileViewPref<"cards" | "grid">(`table-mode:${board.id}`, "cards");

  const view: BoardViewKind = isViewKind(searchParams.get("view")) ? (searchParams.get("view") as BoardViewKind) : "table";
  // `task` rather than `item`: the portal has always deep-linked a request that
  // way, and links people were sent must keep working.
  const openTaskId = searchParams.get("task");

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || (key === "view" && value === "table")) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router],
  );
  const openItem = React.useCallback((id: string | null) => replaceParams({ task: id }), [replaceParams]);

  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  React.useEffect(() => {
    setOpenItemId(openTaskId);
    return () => setOpenItemId(null);
  }, [openTaskId, setOpenItemId]);

  const ui = useBoardUi(board.id);
  const model = React.useMemo(
    () =>
      snapshot.data
        ? buildBoardModel(snapshot.data, {
            search: ui.search,
            filters: ui.filters,
            sort: ui.sort,
            now,
            userName: (id) => payload.users.find((u) => u.id === id)?.displayName,
          })
        : null,
    [snapshot.data, ui.search, ui.filters, ui.sort, now, payload.users],
  );

  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      model
        ? {
            board,
            model,
            mutations,
            users: payload.users,
            canEdit: false,
            canManage: false,
            openItem,
            openItemUpdates: openItem,
            openEditLabels: () => undefined,
            now,
            showReference: tableSettings.showReference,
            setShowReference: (showReference) => updateTableSettings({ showReference }),
            updates: new Map(),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateTableSettings is stable per board
    [board, model, mutations, payload.users, openItem, now, tableSettings.showReference],
  );

  if (!contextValue) return <FullPageLoader label="Opening your requests…" />;

  return (
    <BoardContextProvider value={contextValue}>
      {isMobile ? (
        <>
          <div className="shrink-0 border-b border-border/70 px-3 py-2">
            <MobileBoardTools view={view} onViewChange={(next) => replaceParams({ view: next })} hideSearch />
          </div>
          {view === "table" ? (
            <MobileTableView mode={tableMode} onModeChange={setTableMode} />
          ) : view === "kanban" ? (
            <MobileKanbanView />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <OtherView view={view} />
            </div>
          )}
          {openTaskId && <ItemDetailPanel itemId={openTaskId} onClose={() => openItem(null)} />}
        </>
      ) : (
        <>
          <BoardToolbar view={view} onViewChange={(next) => replaceParams({ view: next })} hideSearch />
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {view === "table" && <BoardTable />}
              {view === "kanban" && <KanbanView />}
              <OtherView view={view} />
            </div>
            {openTaskId && <ItemDetailPanel itemId={openTaskId} onClose={() => openItem(null)} overlay={view === "kanban"} />}
          </div>
        </>
      )}
    </BoardContextProvider>
  );
}

/** The five views that need no special treatment on either width. */
function OtherView({ view }: { view: BoardViewKind }) {
  return (
    <>
      {view === "timeline" && <TimelineView />}
      {view === "calendar" && <CalendarView />}
      {view === "gantt" && <GanttView />}
      {view === "workload" && <WorkloadView />}
      {view === "chart" && <ChartView />}
    </>
  );
}

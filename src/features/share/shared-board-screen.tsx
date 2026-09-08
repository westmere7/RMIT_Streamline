"use client";

import { CalendarClock, Eye } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { BOARD_VIEWS, type BoardViewKind, type PublicBoardPayload } from "@/domain";
import { BrandMark } from "@/features/auth/components/auth-shell";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { BoardToolbar } from "@/features/boards/components/board-toolbar";
import { BoardTable } from "@/features/boards/components/table/board-table";
import { CalendarView } from "@/features/boards/components/views/calendar-view";
import { ChartView } from "@/features/boards/components/views/chart-view";
import { GanttView } from "@/features/boards/components/views/gantt-view";
import { KanbanView } from "@/features/boards/components/views/kanban-view";
import { TimelineView } from "@/features/boards/components/views/timeline-view";
import { WorkloadView } from "@/features/boards/components/views/workload-view";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useViewSettingsFor } from "@/features/boards/components/views/view-settings";
import { useBoardUpdates } from "@/features/comments/updates";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { formatShortDate } from "@/lib/dates/dates";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

function isViewKind(value: string | null): value is BoardViewKind {
  return !!value && (BOARD_VIEWS as readonly string[]).includes(value);
}

/**
 * A shared board as a visitor sees it.
 *
 * The same views, cells and item panel the workspace uses, on data that came
 * down one public link. What is missing is everything that would take somebody
 * off this page: no sidebar, no board menu, no members, no way in. Editing is
 * off because the board context says so, which is the same switch the app uses
 * for a board somebody may read but not change.
 */
export function SharedBoardScreen({ payload }: { payload: PublicBoardPayload }) {
  const board = payload.board;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const snapshot = useBoardSnapshot(board.id);
  const mutations = useBoardMutations(board.id);
  const [now] = React.useState(() => new Date());
  const [tableSettings, updateTableSettings] = useViewSettingsFor(board.id, "table", { showReference: true });

  const view: BoardViewKind = isViewKind(searchParams.get("view")) ? (searchParams.get("view") as BoardViewKind) : "table";
  const itemId = searchParams.get("item");

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
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
  const openItem = React.useCallback((id: string | null) => replaceParams({ item: id }), [replaceParams]);

  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  React.useEffect(() => {
    setOpenItemId(itemId);
    return () => setOpenItemId(null);
  }, [itemId, setOpenItemId]);

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

  const itemIds = React.useMemo(() => payload.items.map((i) => i.id), [payload.items]);
  const updates = useBoardUpdates(board.id, itemIds);

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
            updates,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateTableSettings is stable per board
    [board, model, mutations, payload.users, openItem, now, updates, tableSettings.showReference],
  );

  // The board arrives before anything is drawn, so the wait looks the same as it
  // does inside the app rather than a header with a hole under it.
  if (!contextValue && !snapshot.isError) return <FullPageLoader label="Opening the shared board…" />;

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-canvas" data-testid="shared-board">
      <SharedBoardHeader payload={payload} />
      {snapshot.isError && <ErrorState title="Something went wrong while opening this board." error={snapshot.error} onRetry={() => snapshot.refetch()} />}
      {contextValue && (
        <BoardContextProvider value={contextValue}>
          <BoardToolbar view={view} onViewChange={(next) => replaceParams({ view: next })} />
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
            {itemId && <ItemDetailPanel itemId={itemId} onClose={() => openItem(null)} overlay={view === "kanban"} />}
          </div>
        </BoardContextProvider>
      )}
    </div>
  );
}

/** Says whose board this is, what it is called, and that nothing here can be changed. */
function SharedBoardHeader({ payload }: { payload: PublicBoardPayload }) {
  const board = payload.board;
  return (
    <header className="relative flex shrink-0 items-center gap-3.5 border-b border-border/60 px-5 py-3.5 sm:px-7">
      <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-20 opacity-[0.10]", colorClasses(board.color).dot)} style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }} />
      <span className={cn("relative hidden size-9 shrink-0 items-center justify-center rounded-xl shadow-xs sm:flex", colorClasses(board.color).solid)}>
        <DynamicIcon name={board.icon} className="size-4.5" />
      </span>
      <div className="relative min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold tracking-tight">
          <span className="truncate">{board.name}</span>
          <Badge variant="outline" className="gap-1 shrink-0" data-testid="share-view-only">
            <Eye className="size-3" /> View only
          </Badge>
        </h1>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {payload.workspaceName}
          {board.description ? ` · ${board.description}` : ""}
        </p>
      </div>
      {payload.expiresAt && (
        <SimpleTooltip label="After this day the link stops working.">
          <span className="relative hidden items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-2xs text-muted-foreground sm:flex" data-testid="share-expiry">
            <CalendarClock className="size-3.5" /> Until {formatShortDate(payload.expiresAt)}
          </span>
        </SimpleTooltip>
      )}
      <span className="relative flex items-center gap-2 pl-1">
        <BrandMark className="size-8 rounded-lg" />
      </span>
    </header>
  );
}

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Lock, SquareKanban } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import type { MenuAction } from "@/components/layout/row-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingSweep } from "@/components/shared/loading-sweep";
import { Button } from "@/components/ui/button";
import { DEFAULT_PORTAL_RANGE, EVERY_PORTAL_RANGE, formatPortalRange, parsePortalRange } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardRealtime } from "@/features/boards/hooks/use-board-realtime";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useBoardUpdates } from "@/features/comments/updates";
import { useServices } from "@/features/data/data-context";
import { ItemDetailPanel, ItemPanelSkeleton } from "@/features/items/item-detail-panel";
import { PortalBoardScreen } from "@/features/portal/portal-board-screen";
import { PortalBoardSkeleton } from "@/features/portal/portal-board-skeleton";
import { PortalHeader, PortalRangePicker } from "@/features/portal/portal-shell";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { canEditBoard, canManageBoard, canUseInternalPortal, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const NO_FILTERS = { personIds: [], statusIds: [], priorityIds: [], groupIds: [], tags: [], date: null };

/**
 * The internal portal: the portal's board over every task on the team boards
 * the reader can see, for admins and allocators who need to see where all the
 * work is. The same toolbar, views and groupings the stakeholders get; a task
 * opens the app's own panel, editable as it is on its board.
 */
export function InternalPortalPage() {
  const ws = useWorkspace();
  const auth = useAuth();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const taskAllocation = ws.boards.find((board) => board.system === "TASK_ALLOCATION");
  const allowed = canUseInternalPortal(ws.permissions, taskAllocation);

  const stakeholderId = searchParams.get("for") || null;
  const teamId = searchParams.get("team") || null;
  const chosenRange = parsePortalRange(searchParams.get("range")) ?? DEFAULT_PORTAL_RANGE;
  // The board's own search box, lifted so a search can reach every year.
  const [search, setSearch] = React.useState("");
  const searching = useDebouncedValue(search.trim(), 250).length > 0;
  const range = searching ? EVERY_PORTAL_RANGE : chosenRange;

  // The boards this reader can open: the same rule the sidebar uses.
  const boards = React.useMemo(() => ws.boards.filter((board) => board.archivedAt === null && !board.system && canViewBoard(ws.permissions, board)), [ws.boards, ws.permissions]);
  const boardsKey = boards.map((board) => board.id).join(",");

  const queryKey = ["internal-portal", ws.workspace.id, boardsKey, stakeholderId, teamId, formatPortalRange(range)];
  const page = useQuery({
    queryKey,
    queryFn: () => services.portals.internalBoard({ workspaceId: ws.workspace.id, boards, scope: { stakeholderId, teamId, range }, viewerName: auth.user?.displayName ?? null }),
    enabled: allowed,
    // Read when opened, on coming back to the tab and after a task is closed: no polling.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router],
  );

  // The open task and the board it is really on. A task opened from inside the
  // panel (a subitem, its parent) keeps the board the panel already has.
  const openTaskId = searchParams.get("task");
  const [panelBoardId, setPanelBoardId] = React.useState<string | null>(null);
  const knownBoard = openTaskId ? page.data?.boardOfItem[openTaskId] : undefined;
  // Remembered while rendering (React's way to follow a value), not in an effect.
  if (knownBoard && knownBoard !== panelBoardId) setPanelBoardId(knownBoard);
  const boardOfOpen = openTaskId ? (knownBoard ?? panelBoardId) : null;
  const closeTask = React.useCallback(() => {
    replaceParams({ task: null });
    // What was changed in the panel shows on the list.
    void queryClient.invalidateQueries({ queryKey: ["internal-portal", ws.workspace.id] });
  }, [replaceParams, queryClient, ws.workspace.id]);

  // A task's menu here: Open, and the board it is on, opened with the task open there.
  const boardOfItem = page.data?.boardOfItem;
  const itemMenu = React.useMemo(
    () => ({
      extra: (item: { id: string; parentItemId: string | null }): MenuAction[] => {
        const board = ws.boardById(boardOfItem?.[item.parentItemId ?? item.id]);
        return board ? [{ type: "item", label: "Open task's board", icon: <SquareKanban />, onSelect: () => router.push(ws.boardPath(board, { itemId: item.id })), testId: "internal-portal-row-open-board" }] : [];
      },
    }),
    [boardOfItem, ws, router],
  );

  if (!allowed) {
    return <EmptyState icon={Lock} title="For admins and allocators" className="h-full" />;
  }

  const context = page.data?.context ?? null;
  const home = routes.internalPortal(ws.workspace.slug);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="internal-portal-page">
      <PortalHeader
        internal
        back={
          // Opened from Portal and Booking's Portal card, and back there.
          <Button variant="ghost" size="icon-sm" className="-ml-2 text-muted-foreground" asChild>
            <Link href={routes.book(ws.workspace.slug)} aria-label="Back to Portal and Booking" title="Portal and Booking" data-testid="internal-portal-back">
              <ArrowLeft />
            </Link>
          </Button>
        }
        token=""
        home={home}
        portalName="Internal portal"
        viewerName={null}
        servedAt={page.data?.servedAt ?? null}
        stale={page.isFetching}
        totals={page.data?.totals ?? null}
        stakeholders={context?.stakeholders ?? []}
        stakeholderId={stakeholderId}
        onStakeholder={(id) => replaceParams({ for: id })}
        teams={context?.teams ?? []}
        teamId={teamId}
        onTeam={(id) => replaceParams({ team: id })}
        rangePicker={<PortalRangePicker range={range} onRange={(next) => replaceParams({ range: formatPortalRange(next) })} years={context?.years ?? []} rangeOverridden={searching} />}
      />
      {page.isPlaceholderData && <LoadingSweep testId="internal-portal-switching" />}
      {page.isError ? (
        <ErrorState title="Something went wrong while loading the internal portal." error={page.error} onRetry={() => page.refetch()} />
      ) : page.data ? (
        <div className="relative flex min-h-0 flex-1">
          <div className={cn("flex min-w-0 flex-1 flex-col transition-opacity", page.isPlaceholderData && "pointer-events-none opacity-60")} data-testid="internal-portal-board">
            <PortalBoardScreen
              token={`internal-${ws.workspace.id}`}
              home={home}
              payload={page.data}
              bookHref={false}
              defaultView="table"
              showItemGroups
              onSearchChange={setSearch}
              searchingAllYears={searching}
              refreshing={page.isFetching}
              onShowAll={range.kind === "all" ? undefined : () => replaceParams({ range: formatPortalRange(EVERY_PORTAL_RANGE) })}
              taskPanel="outside"
              linksStayHere={false}
              itemMenu={itemMenu}
            />
          </div>
          {openTaskId && boardOfOpen && <InternalTaskPanel key={boardOfOpen} boardId={boardOfOpen} itemId={openTaskId} onOpen={(id) => replaceParams({ task: id })} onClose={closeTask} />}
        </div>
      ) : (
        <PortalBoardSkeleton />
      )}
    </div>
  );
}

/**
 * The app's own task panel for a task on the internal portal, over the board it
 * really lives on: the board is read as its page reads it, and the panel edits
 * it exactly as it would there.
 */
function InternalTaskPanel({ boardId, itemId, onOpen, onClose }: { boardId: string; itemId: string; onOpen: (id: string) => void; onClose: () => void }) {
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
          }
        : null,
    [board, model, mutations, ws.activeUsers, ws.users, ws.permissions, openItem, now, updates],
  );

  if (!contextValue || !board) return <ItemPanelSkeleton onClose={onClose} />;
  return (
    <BoardContextProvider value={contextValue}>
      <ItemDetailPanel
        itemId={itemId}
        onClose={onClose}
        notice={
          // The board the task is on, opened with the task open there.
          <div className="mx-4 mt-3 flex shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2 text-[13px]" data-testid="internal-portal-board-notice">
            <SquareKanban className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              On <span className="font-medium">{board.name}</span>
            </span>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href={ws.boardPath(board, { itemId })} data-testid="internal-portal-open-board">
                Open board
              </Link>
            </Button>
          </div>
        }
      />
    </BoardContextProvider>
  );
}

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
import { useServices } from "@/features/data/data-context";
import { TaskPanelHost } from "@/features/items/task-panel-host";
import type { ItemOpenMode } from "@/stores/board-ui-store";
import { PortalBoardScreen } from "@/features/portal/portal-board-screen";
import { PortalBoardSkeleton } from "@/features/portal/portal-board-skeleton";
import { PortalHeader, PortalRangePicker } from "@/features/portal/portal-shell";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { canUseInternalPortal, canViewBoard } from "@/lib/permissions/permissions";
import { useWorkspaceRowChecks } from "@/lib/realtime/in-workspace";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

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
  // Where a task opens, as the board's toolbar has it (a view setting the board keeps).
  const [openMode, setOpenMode] = React.useState<ItemOpenMode>("panel");
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
    // Read when opened, on coming back to the tab, after a task is closed, and
    // when a teammate changes a task on one of its boards (below): no polling.
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });

  // A teammate's change to any task on these boards shows without a reload.
  // The page reads every board, so a busy minute is one read every 15 s at most.
  const checks = useWorkspaceRowChecks();
  const liveBindings = React.useMemo<RealtimeBinding[]>(() => {
    const keys = [["internal-portal", ws.workspace.id]];
    return [
      { table: "items", keys, accept: checks.onBoard },
      { table: "item_column_values", keys, accept: checks.onBoard },
      { table: "item_links", keys, accept: checks.inWorkspace },
      { table: "board_groups", keys, accept: checks.onBoard },
      { table: "board_columns", keys, accept: checks.onBoard },
    ];
  }, [ws.workspace.id, checks]);
  useRealtime(allowed ? `internal-portal:${ws.workspace.id}` : null, liveBindings, { coalesceMs: 2_000, minIntervalMs: 15_000, catchUp: { workspaceId: ws.workspace.id } });

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
              onOpenModeChange={setOpenMode}
            />
          </div>
          {openTaskId && boardOfOpen && <TaskPanelHost key={boardOfOpen} boardId={boardOfOpen} itemId={openTaskId} onOpen={(id) => replaceParams({ task: id })} onClose={closeTask} popup={openMode === "popup"} />}
        </div>
      ) : (
        <PortalBoardSkeleton />
      )}
    </div>
  );
}

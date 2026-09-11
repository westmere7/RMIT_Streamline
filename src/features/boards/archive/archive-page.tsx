"use client";

import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Lock, SearchX, SquareKanban, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ARCHIVE_PAGE_SIZES, EMPTY_ARCHIVE_REQUEST, type ArchivePageSize, type ArchiveRequest } from "@/domain";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { ArchiveTable } from "@/features/boards/archive/archive-table";
import { ArchiveToolbar } from "@/features/boards/archive/archive-toolbar";
import { useArchiveMutations, useArchivePage } from "@/features/boards/archive/use-archive";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { useBoardUpdates } from "@/features/comments/updates";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canEditBoard, canManageBoard, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { colorClasses } from "@/lib/colors";
import { useBoardUiStore } from "@/stores/board-ui-store";
import { cn, pluralize } from "@/lib/utils";

export function BoardArchivePage() {
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
  return <ArchiveScreen key={board.id} boardId={board.id} />;
}

/**
 * A board's archive: the board, trimmed to what an archived item still has.
 *
 * No groups, because a page of the archive is ordered by when things were put
 * away and cuts across every group the board has; no views, because a Kanban of
 * things nobody is working on is a wall of nothing, and a Gantt of them is a
 * chart of the past. The filters stay, because finding one task among thousands
 * is the whole reason to come here — and they run against the archive rather
 * than the page, which is why the page is the only thing loaded.
 */
function ArchiveScreen({ boardId }: { boardId: string }) {
  const ws = useWorkspace();
  const board = ws.boardById(boardId)!;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("item");

  const [request, setRequest] = React.useState<ArchiveRequest>(EMPTY_ARCHIVE_REQUEST);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState<string[] | null>(null);
  const [now] = React.useState(() => new Date());

  const page = useArchivePage(boardId, request, itemId);
  const archive = useArchiveMutations(boardId);
  // The board's own mutations, for the panel: opening a task from the archive
  // shows the same panel, and it expects a board to act on.
  const mutations = useBoardMutations(boardId);

  const canManage = canEditBoard(ws.permissions, board) && board.archivedAt === null;
  const data = page.data ?? null;

  /** Any change to what is being asked for starts again at the first page. */
  const patchRequest = (patch: Partial<ArchiveRequest>) => {
    setSelectedIds([]);
    setRequest((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));
  };

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
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

  // The model is built over the page's rows: cells, links and subitem counts
  // resolve against what came back, and nothing else is in memory to resolve
  // against. Search and filters are already applied by the query, so they are
  // not applied again here.
  const model = React.useMemo(
    () => (data ? buildBoardModel(data, { search: "", filters: { personIds: [], statusIds: [], priorityIds: [], groupIds: [], tags: [], date: null }, sort: null, now, userName: (id) => ws.userById(id)?.displayName }) : null),
    [data, now, ws],
  );

  const itemIds = React.useMemo(() => (data ? data.items.map((i) => i.id) : []), [data]);
  const updates = useBoardUpdates(boardId, itemIds);

  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      model
        ? {
            board,
            model,
            mutations,
            users: ws.activeUsers,
            // Nothing on this screen is editable: the panel opens read-only, and
            // the row's cells are a record of what the task was when it was put
            // away. Restoring it is how it becomes editable again.
            canEdit: false,
            canManage: canManageBoard(ws.permissions, board),
            openItem,
            openItemUpdates: openItem,
            openEditLabels: () => undefined,
            now,
            showReference: true,
            setShowReference: () => undefined,
            updates,
          }
        : null,
    [board, model, mutations, ws.activeUsers, ws.permissions, openItem, now, updates],
  );

  // The pager counts the archive, not the page; the focus item is a row fetched
  // by id for the panel and is not part of the page it was not on.
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / request.pageSize));
  const rows = React.useMemo(() => (data ? data.items.filter((i) => i.id !== data.focusItemId) : []), [data]);
  const groupsById = React.useMemo(() => new Map((data?.groups ?? []).map((g) => [g.id, g])), [data]);
  const extraTags = React.useMemo(() => (data?.values ?? []).flatMap((v) => (v.value.type === "TAGS" ? v.value.tags : [])), [data]);

  const restore = (itemIds: string[]) => {
    archive.restore.mutate(itemIds);
    setSelectedIds((current) => current.filter((id) => !itemIds.includes(id)));
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="board-archive-page">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2 shrink-0 rounded-full text-muted-foreground">
          <Link href={ws.boardPath(board)} data-testid="archive-back">
            <ChevronLeft /> Back to board
          </Link>
        </Button>
        <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />
        <DynamicIcon name={board.icon} className={cn("size-4 shrink-0", colorClasses(board.color).text)} />
        <h1 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
          <span className="truncate">{board.name}</span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-strong px-2 py-0.5 text-2xs font-medium text-muted-foreground">
            <Archive className="size-3" /> Archive
          </span>
        </h1>
      </header>

      <ArchiveToolbar
        request={request}
        onChange={patchRequest}
        groups={data?.groups ?? []}
        columns={model?.columns ?? []}
        users={ws.activeUsers}
        extraTags={extraTags}
        loading={page.isFetching}
      />

      {page.isError && <ErrorState title="Something went wrong while loading the archive." error={page.error} onRetry={() => page.refetch()} />}
      {!page.isError && !contextValue && <ArchiveSkeleton />}

      {contextValue && (
        <BoardContextProvider value={contextValue}>
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {rows.length === 0 ? (
                <EmptyState
                  icon={total === 0 ? Archive : SearchX}
                  title={total === 0 ? "Nothing has been archived yet" : "No archived items match these filters"}
                  description={
                    total === 0
                      ? "Archiving takes an item off the board and keeps it here, with everything on it."
                      : "Try widening the filters or clearing the search."
                  }
                />
              ) : (
                <ArchiveTable
                  items={rows}
                  groupsById={groupsById}
                  selectedIds={selectedIds}
                  onSelectedChange={setSelectedIds}
                  onRestore={restore}
                  onDelete={(ids) => setConfirmDelete(ids)}
                  busy={page.isFetching}
                  canManage={canManage}
                />
              )}
              <ArchivePager
                page={request.page}
                pageCount={pageCount}
                pageSize={request.pageSize}
                total={total}
                shown={rows.length}
                onPage={(next) => {
                  setSelectedIds([]);
                  setRequest((current) => ({ ...current, page: next }));
                }}
                onPageSize={(pageSize) => patchRequest({ pageSize })}
              />
            </div>
            {itemId && <ItemDetailPanel itemId={itemId} onClose={() => openItem(null)} />}
          </div>

          {selectedIds.length > 0 && canManage && (
            <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center">
              <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-border/70 bg-card px-2.5 py-2 shadow-xl" role="toolbar" aria-label="Selected archived items" data-testid="archive-bulk-bar">
                <span className="px-1.5 text-[13px] font-medium">{pluralize(selectedIds.length, "item")} selected</span>
                <span aria-hidden className="h-5 w-px bg-border" />
                <Button variant="ghost" size="sm" onClick={() => restore(selectedIds)} data-testid="archive-bulk-restore">
                  <ArchiveRestore /> Restore
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(selectedIds)}>
                  <Trash2 /> Delete
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={() => setSelectedIds([])}>
                  <X />
                </Button>
              </div>
            </div>
          )}
        </BoardContextProvider>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={confirmDelete ? `Delete ${pluralize(confirmDelete.length, "item")} permanently?` : ""}
        description="This cannot be undone. Everything on them goes too: updates, assets and history."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={async () => {
          const ids = confirmDelete ?? [];
          setConfirmDelete(null);
          setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
          await archive.remove.mutateAsync(ids);
        }}
      />
    </div>
  );
}

/**
 * The pager, and the size of a page.
 *
 * Fifty rows is the most it will read at once and where it starts; the smaller
 * sizes are for a slow connection or a small screen, not for asking for more.
 */
function ArchivePager({
  page,
  pageCount,
  pageSize,
  total,
  shown,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: ArchivePageSize;
  total: number;
  shown: number;
  onPage: (page: number) => void;
  onPageSize: (size: ArchivePageSize) => void;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = total === 0 ? 0 : first + shown - 1;
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border/70 px-6" data-testid="archive-pager">
      <span className="text-2xs text-muted-foreground tabular">
        {total === 0 ? "No items" : `${first}–${last} of ${total}`}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground" data-testid="archive-page-size">
            {pageSize} per page
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuLabel>Items per page</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value) as ArchivePageSize)}>
            {ARCHIVE_PAGE_SIZES.map((size) => (
              <DropdownMenuRadioItem key={size} value={String(size)}>
                {size}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="archive-prev">
          <ChevronLeft /> Previous
        </Button>
        <span className="px-2 text-2xs text-muted-foreground tabular" data-testid="archive-page-label">
          Page {page} of {pageCount}
        </span>
        <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} data-testid="archive-next">
          Next <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function ArchiveSkeleton() {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-label="Loading the archive">
      <Skeleton className="h-6 w-48" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

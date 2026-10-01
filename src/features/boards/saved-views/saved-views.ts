"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { BOARD_VIEWS, EMPTY_VIEW_FILTERS, boardViewsFor, cleanViewName, sameViewConfig, type Board, type BoardColumn, type BoardViewKind, type SavedBoardView, type SavedBoardViewPatch, type SavedViewConfig } from "@/domain";
import { readPersonalViewSettings } from "@/features/boards/components/views/view-settings";
import { useActiveSavedView, useSavedViewStore, viewDefaults } from "@/features/boards/saved-views/saved-view-store";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

/**
 * Who may change a saved view: whoever saved it, and on a shared view anyone
 * who can edit the board. Mirrors policies/0023.
 */
export function canChangeView(view: SavedBoardView, userId: string, canEdit: boolean): boolean {
  return view.createdBy === userId || (view.shared && canEdit);
}

const OPEN_KEY = "streamline.saved-view";

function readOpen(userId: string, boardId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, string>;
    return map[`${userId}:${boardId}`] ?? null;
  } catch {
    return null;
  }
}

function writeOpen(userId: string, boardId: string, viewId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "{}") as Record<string, string>;
    if (viewId) map[`${userId}:${boardId}`] = viewId;
    else delete map[`${userId}:${boardId}`];
    window.localStorage.setItem(OPEN_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

export interface SavedViewsController {
  views: SavedBoardView[];
  /** The saved view on screen, or null for the board as this person left it. */
  active: SavedBoardView | null;
  /** On screen differs from what the active view saved. */
  dirty: boolean;
  canEdit: boolean;
  userId: string;
  open: (view: SavedBoardView | null) => void;
  discard: () => void;
  saveChanges: () => Promise<void>;
  /** Saves what is on screen (or `config`, for a copy) under a new name, and opens it. */
  create: (name: string, shared: boolean, config?: SavedViewConfig) => Promise<void>;
  update: (view: SavedBoardView, patch: SavedBoardViewPatch) => Promise<void>;
  remove: (view: SavedBoardView) => Promise<void>;
}

/**
 * The board's saved views, and which one is open.
 *
 * A view opens by putting its search, filters and sort in the board's UI store,
 * its view settings and hidden columns in the saved-view store, and its view in
 * the URL. Leaving it for the default clears the first and drops the second, so
 * the person's own settings come back as they were.
 */
export function useSavedViewsController({
  board,
  view,
  setView,
  replaceParams,
  columns,
  userId,
  canEdit,
  requestedId,
}: {
  board: Board;
  view: BoardViewKind;
  setView: (view: BoardViewKind) => void;
  replaceParams: (patch: Record<string, string | null>) => void;
  /** The board's columns as stored, before any view hides its own. */
  columns: readonly BoardColumn[];
  userId: string;
  canEdit: boolean;
  /** A view asked for by the URL. */
  requestedId: string | null;
}): SavedViewsController {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.savedViews(board.id, userId);
  const query = useQuery({ queryKey: key, queryFn: () => services.repos.savedViews.listByBoard(board.id, userId), staleTime: 30_000 });
  const views = React.useMemo(() => query.data ?? [], [query.data]);
  const working = useActiveSavedView(board.id);
  const ui = useBoardUi(board.id);
  const active = working ? (views.find((v) => v.id === working.id) ?? null) : null;

  const open = React.useCallback(
    (next: SavedBoardView | null) => {
      const store = useBoardUiStore.getState();
      if (next) {
        const c = next.config;
        useSavedViewStore.getState().activate(board.id, next);
        store.setSearch(board.id, c.search);
        store.clearFilters(board.id);
        store.setFilters(board.id, c.filters);
        store.setSort(board.id, c.sort);
        if (boardViewsFor(board).includes(c.view)) setView(c.view);
      } else {
        useSavedViewStore.getState().clear(board.id);
        store.setSearch(board.id, "");
        store.clearFilters(board.id);
        store.setSort(board.id, null);
      }
      writeOpen(userId, board.id, next?.id ?? null);
      replaceParams({ sv: next?.id ?? null });
    },
    [board, setView, replaceParams, userId],
  );

  // Once the list is in: the view the link asks for, else the one this person
  // last had open here.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current || !query.data) return;
    started.current = true;
    const wanted = requestedId ?? readOpen(userId, board.id);
    if (!wanted) return;
    const found = query.data.find((v) => v.id === wanted);
    if (found) open(found);
    else {
      writeOpen(userId, board.id, null);
      if (requestedId) replaceParams({ sv: null });
    }
  }, [query.data, requestedId, userId, board.id, open, replaceParams]);

  // Deleted, or made private, by somebody else while it was open.
  React.useEffect(() => {
    if (working && query.data && !query.data.some((v) => v.id === working.id)) open(null);
  }, [working, query.data, open]);

  const currentConfig = React.useCallback((): SavedViewConfig => {
    const store = useBoardUiStore.getState().boards[board.id];
    const draft = useSavedViewStore.getState().boards[board.id];
    const defaults = viewDefaults();
    const settings: SavedViewConfig["settings"] = {};
    if (draft) Object.assign(settings, structuredClone(draft.settings));
    else {
      for (const kind of BOARD_VIEWS) {
        const own = { ...defaults[kind], ...readPersonalViewSettings(userId, board.id, kind) };
        if (Object.keys(own).length > 0) settings[kind] = own;
      }
    }
    return {
      view,
      search: store?.search ?? "",
      filters: structuredClone(store?.filters ?? EMPTY_VIEW_FILTERS),
      sort: store?.sort ?? null,
      hiddenColumnIds: draft ? [...draft.hiddenColumnIds] : columns.filter((c) => c.hidden).map((c) => c.id),
      settings,
    };
  }, [board.id, columns, userId, view]);

  // Read on every render, so the Edited mark follows each change as it is made.
  const dirty = React.useMemo(() => {
    if (!active || !working) return false;
    const now: SavedViewConfig = { view, search: ui.search, filters: ui.filters, sort: ui.sort, hiddenColumnIds: working.hiddenColumnIds, settings: working.settings };
    return !sameViewConfig(now, active.config, viewDefaults());
  }, [active, working, view, ui.search, ui.filters, ui.sort]);

  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [queryClient, key]);
  const fail = (what: string) => (error: unknown) => {
    toast.error(error instanceof Error && error.message ? `${what}: ${error.message}` : what);
    throw error;
  };

  const saveChanges = async () => {
    if (!active) return;
    const saved = await services.repos.savedViews.update(active.id, { config: currentConfig() }).catch(fail("Could not save the view"));
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.map((v) => (v.id === saved.id ? saved : v)));
    toast.success(`Saved ${saved.name}`);
  };

  const create = async (name: string, shared: boolean, config?: SavedViewConfig) => {
    const created = await services.repos.savedViews
      .create({ boardId: board.id, name: cleanViewName(name), shared: shared && canEdit, config: config ?? currentConfig(), createdBy: userId })
      .catch(fail("Could not save the view"));
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => [...(list ?? []), created]);
    open(created);
    void refresh();
  };

  const update = async (target: SavedBoardView, patch: SavedBoardViewPatch) => {
    const clean = { ...patch, ...(patch.name !== undefined ? { name: cleanViewName(patch.name) } : {}), ...(patch.shared !== undefined ? { shared: patch.shared && canEdit } : {}) };
    const saved = await services.repos.savedViews.update(target.id, clean).catch(fail("Could not change the view"));
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.map((v) => (v.id === saved.id ? saved : v)));
  };

  const remove = async (target: SavedBoardView) => {
    await services.repos.savedViews.delete(target.id).catch(fail("Could not delete the view"));
    if (working?.id === target.id) open(null);
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.filter((v) => v.id !== target.id));
  };

  return {
    views,
    active,
    dirty,
    canEdit,
    userId,
    open,
    discard: () => active && open(active),
    saveChanges,
    create,
    update,
    remove,
  };
}

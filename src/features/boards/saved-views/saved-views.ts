"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { BOARD_VIEWS, DEFAULT_VIEW_NAME, EMPTY_VIEW_FILTERS, boardViewsFor, cleanViewName, sameViewConfig, type Board, type BoardColumn, type BoardViewKind, type SavedBoardView, type SavedBoardViewPatch, type SavedViewConfig } from "@/domain";
import { readPersonalViewSettings } from "@/features/boards/components/views/view-settings";
import { useActiveSavedView, useSavedViewStore, viewDefaults } from "@/features/boards/saved-views/saved-view-store";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { hasActiveFilters, useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

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
  /** The named views: shared ones and the reader's own. The Default view is apart. */
  views: SavedBoardView[];
  /** The board's Default view, once someone has saved it. */
  defaultView: SavedBoardView | null;
  /** The saved row on screen, the Default view's included; null on an unsaved default. */
  active: SavedBoardView | null;
  /** The Default view is on screen, saved or not. */
  onDefault: boolean;
  /** On screen differs from what it was saved as (or, on an unsaved default, from a clean board). */
  dirty: boolean;
  /** Whoever is looking may save what is on screen back over it. */
  maySave: boolean;
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
 * the URL. The Default view is the board with no other view open: once an
 * editor saves it, it opens like any other (but stays out of the URL);
 * until then it is the person's own settings on a clean board.
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
  requestedView,
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
  /** A view kind the URL names. The board's Default view opening by itself leaves it be. */
  requestedView: string | null;
}): SavedViewsController {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.savedViews(board.id, userId);
  const query = useQuery({ queryKey: key, queryFn: () => services.repos.savedViews.listByBoard(board.id, userId), staleTime: 30_000 });
  const all = React.useMemo(() => query.data ?? [], [query.data]);
  const views = React.useMemo(() => all.filter((v) => !v.isDefault), [all]);
  const defaultView = all.find((v) => v.isDefault) ?? null;
  const working = useActiveSavedView(board.id);
  const ui = useBoardUi(board.id);
  const active = working ? (all.find((v) => v.id === working.id) ?? null) : null;
  const onDefault = !working || !!active?.isDefault;

  /** Null is the Default view: the saved one if there is one, else a clean board. */
  const open = React.useCallback(
    (wanted: SavedBoardView | null, keepView = false) => {
      const next = wanted ?? queryClient.getQueryData<SavedBoardView[]>(key)?.find((v) => v.isDefault) ?? null;
      const store = useBoardUiStore.getState();
      if (next) {
        const c = next.config;
        useSavedViewStore.getState().activate(board.id, next);
        store.setSearch(board.id, c.search);
        store.clearFilters(board.id);
        store.setFilters(board.id, c.filters);
        store.setSort(board.id, c.sort);
        if (!keepView && boardViewsFor(board).includes(c.view)) setView(c.view);
      } else {
        useSavedViewStore.getState().clear(board.id);
        store.setSearch(board.id, "");
        store.clearFilters(board.id);
        store.setSort(board.id, null);
      }
      // The Default view is where the board opens anyway, so it needs neither.
      const named = next && !next.isDefault ? next.id : null;
      writeOpen(userId, board.id, named);
      replaceParams({ sv: named });
    },
    [board, setView, replaceParams, userId, queryClient, key],
  );

  // Once the list is in: the view the link asks for, else the one this person
  // last had open here, else the board's saved Default view.
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current || !query.data) return;
    started.current = true;
    const wanted = requestedId ?? readOpen(userId, board.id);
    const found = wanted ? query.data.find((v) => v.id === wanted && !v.isDefault) : undefined;
    if (wanted && !found) {
      writeOpen(userId, board.id, null);
      if (requestedId) replaceParams({ sv: null });
    }
    if (found) open(found);
    // A link that names a view (?view=kanban) opens on that view, with the
    // Default view's filters and settings around it.
    else if (query.data.some((v) => v.isDefault)) open(null, !!requestedView);
  }, [query.data, requestedId, requestedView, userId, board.id, open, replaceParams]);

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

  // What a save in flight is writing. It counts as saved the moment Save is
  // pressed, so the Edited mark goes then rather than when the server answers,
  // and comes back if the save fails.
  const [saving, setSaving] = React.useState<SavedViewConfig | null>(null);

  // Read on every render, so the Edited mark follows each change as it is made.
  const dirty = React.useMemo(() => {
    if (saving) {
      const now: SavedViewConfig = working
        ? { view, search: ui.search, filters: ui.filters, sort: ui.sort, hiddenColumnIds: working.hiddenColumnIds, settings: working.settings }
        : currentConfig();
      return !sameViewConfig(now, saving, viewDefaults());
    }
    if (active && working) {
      const now: SavedViewConfig = { view, search: ui.search, filters: ui.filters, sort: ui.sort, hiddenColumnIds: working.hiddenColumnIds, settings: working.settings };
      return !sameViewConfig(now, active.config, viewDefaults());
    }
    // An unsaved default has nothing to compare with but a clean board.
    return !working && (ui.search.trim() !== "" || hasActiveFilters(ui.filters) || ui.sort !== null);
  }, [saving, active, working, view, ui.search, ui.filters, ui.sort, currentConfig]);

  const maySave = active ? canChangeView(active, userId, canEdit) : onDefault && canEdit;

  const refresh = React.useCallback(() => queryClient.invalidateQueries({ queryKey: key }), [queryClient, key]);
  const fail = (what: string) => (error: unknown) => {
    toast.error(error instanceof Error && error.message ? `${what}: ${error.message}` : what);
    throw error;
  };

  const saveChanges = async () => {
    if (!active && (!onDefault || !canEdit)) return;
    const config = currentConfig();
    setSaving(config);
    try {
      if (active) {
        // The list holds it as saved at once too, so nothing waits on the answer.
        queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.map((v) => (v.id === active.id ? { ...v, config } : v)));
        const saved = await services.repos.savedViews.update(active.id, { config }).catch((error: unknown) => {
          queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.map((v) => (v.id === active.id ? active : v)));
          return fail("Could not save the view")(error);
        });
        queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.map((v) => (v.id === saved.id ? saved : v)));
        toast.success(`Saved ${saved.name}`);
        return;
      }
      // The first save of the board's Default view, for everyone on it.
      const created = await services.repos.savedViews
        .create({ boardId: board.id, name: DEFAULT_VIEW_NAME, shared: true, isDefault: true, config, createdBy: userId })
        .catch(fail("Could not save the default view"));
      queryClient.setQueryData<SavedBoardView[]>(key, (list) => [...(list ?? []), created]);
      open(created);
      toast.success(`Saved ${DEFAULT_VIEW_NAME}`);
    } finally {
      setSaving(null);
    }
  };

  const create = async (name: string, shared: boolean, config?: SavedViewConfig) => {
    const created = await services.repos.savedViews
      .create({ boardId: board.id, name: cleanViewName(name), shared: shared && canEdit, isDefault: false, config: config ?? currentConfig(), createdBy: userId })
      .catch(fail("Could not save the view"));
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => [...(list ?? []), created]);
    open(created);
    void refresh();
  };

  const update = async (target: SavedBoardView, patch: SavedBoardViewPatch) => {
    // The Default view keeps its name and stays shared.
    const allowed = target.isDefault ? { config: patch.config } : patch;
    const clean = { ...allowed, ...(allowed.name !== undefined ? { name: cleanViewName(allowed.name) } : {}), ...(allowed.shared !== undefined ? { shared: allowed.shared && canEdit } : {}) };
    const saved = await services.repos.savedViews.update(target.id, clean).catch(fail("Could not change the view"));
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.map((v) => (v.id === saved.id ? saved : v)));
  };

  const remove = async (target: SavedBoardView) => {
    if (target.isDefault) return;
    await services.repos.savedViews.delete(target.id).catch(fail("Could not delete the view"));
    queryClient.setQueryData<SavedBoardView[]>(key, (list) => list?.filter((v) => v.id !== target.id));
    if (working?.id === target.id) open(null);
  };

  const discard = () => {
    if (active) open(active);
    else open(null);
  };

  return { views, defaultView, active, onDefault, dirty, maySave, canEdit, userId, open, discard, saveChanges, create, update, remove };
}

"use client";

import { create } from "zustand";
import type { BoardViewKind } from "@/domain";

/** Built-in fields, or any column by id ("column:<id>") from a click on its header. */
export type SortField = "name" | "dueDate" | "priority" | "status" | "createdAt" | `column:${string}`;

export function columnSortField(columnId: string): SortField {
  return `column:${columnId}`;
}

/** The column id a "column:<id>" sort field points at, else null. */
export function sortFieldColumnId(field: SortField): string | null {
  return field.startsWith("column:") ? field.slice("column:".length) : null;
}
export type SortDirection = "asc" | "desc";

export interface BoardSort {
  field: SortField;
  direction: SortDirection;
}

export type DateFilter = "overdue" | "today" | "thisWeek" | "noDate" | null;

export interface BoardFilters {
  /** User ids; item matches when any PERSON column contains one of them. */
  personIds: string[];
  /** Status label ids. */
  statusIds: string[];
  /** Priority label ids. */
  priorityIds: string[];
  groupIds: string[];
  /** Tag names (case-insensitive); item matches when any TAGS column contains one of them. */
  tags: string[];
  date: DateFilter;
}

export const EMPTY_FILTERS: BoardFilters = { personIds: [], statusIds: [], priorityIds: [], groupIds: [], tags: [], date: null };

export interface BoardUiState {
  search: string;
  filters: BoardFilters;
  sort: BoardSort | null;
  selectedItemIds: string[];
  /** Item ids with subitems expanded. */
  expandedItemIds: string[];
  /** Kanban lane column id override (defaults to first STATUS column). */
  kanbanColumnId: string | null;
}

interface BoardUiStore {
  boards: Record<string, BoardUiState>;
  /**
   * Item whose detail panel is open, mirrored from the URL. It lives here rather
   * than in the board context so a row can subscribe to "is it me?" instead of
   * to the id: on a board of a few hundred rows, re-rendering every row each
   * time the panel opened cost seconds.
   */
  openItemId: string | null;
  setOpenItemId: (itemId: string | null) => void;
  /** A one-off request for the panel to open on a given tab (the updates badge asks for "updates"). */
  requestedItemTab: { itemId: string; tab: string } | null;
  setRequestedItemTab: (request: { itemId: string; tab: string } | null) => void;
  /**
   * The open board is still loading or refetching. Kept here rather than in the
   * board context so that saying "still loading" re-renders the search box and
   * the empty state, not every row on the board.
   */
  boardLoading: boolean;
  setBoardLoading: (loading: boolean) => void;
  /** Item whose panel should open the link dialog as soon as it mounts. */
  linkDialogItemId: string | null;
  setLinkDialogItem: (itemId: string | null) => void;
  setSearch: (boardId: string, search: string) => void;
  setFilters: (boardId: string, filters: Partial<BoardFilters>) => void;
  clearFilters: (boardId: string) => void;
  setSort: (boardId: string, sort: BoardSort | null) => void;
  setSelected: (boardId: string, ids: string[]) => void;
  toggleSelected: (boardId: string, id: string, selected?: boolean) => void;
  clearSelection: (boardId: string) => void;
  toggleExpanded: (boardId: string, itemId: string) => void;
  setKanbanColumn: (boardId: string, columnId: string | null) => void;
}

export const EMPTY_BOARD_UI: BoardUiState = {
  search: "",
  filters: EMPTY_FILTERS,
  sort: null,
  selectedItemIds: [],
  expandedItemIds: [],
  kanbanColumnId: null,
};

function update(state: BoardUiStore, boardId: string, patch: Partial<BoardUiState>): Partial<BoardUiStore> {
  const current = state.boards[boardId] ?? EMPTY_BOARD_UI;
  return { boards: { ...state.boards, [boardId]: { ...current, ...patch } } };
}

/** Transient per-board table state (filters, sort, search, selection). Not persisted. */
export const useBoardUiStore = create<BoardUiStore>()((set) => ({
  boards: {},
  openItemId: null,
  setOpenItemId: (openItemId) => set({ openItemId }),
  requestedItemTab: null,
  setRequestedItemTab: (requestedItemTab) => set({ requestedItemTab }),
  boardLoading: false,
  setBoardLoading: (boardLoading) => set({ boardLoading }),
  linkDialogItemId: null,
  setLinkDialogItem: (linkDialogItemId) => set({ linkDialogItemId }),
  setSearch: (boardId, search) => set((s) => update(s, boardId, { search })),
  setFilters: (boardId, filters) =>
    set((s) => update(s, boardId, { filters: { ...(s.boards[boardId]?.filters ?? EMPTY_FILTERS), ...filters } })),
  clearFilters: (boardId) => set((s) => update(s, boardId, { filters: EMPTY_FILTERS })),
  setSort: (boardId, sort) => set((s) => update(s, boardId, { sort })),
  setSelected: (boardId, ids) => set((s) => update(s, boardId, { selectedItemIds: ids })),
  toggleSelected: (boardId, id, selected) =>
    set((s) => {
      const current = s.boards[boardId]?.selectedItemIds ?? [];
      const has = current.includes(id);
      const next = selected ?? !has;
      if (next === has) return {};
      return update(s, boardId, { selectedItemIds: next ? [...current, id] : current.filter((x) => x !== id) });
    }),
  clearSelection: (boardId) => set((s) => update(s, boardId, { selectedItemIds: [] })),
  toggleExpanded: (boardId, itemId) =>
    set((s) => {
      const current = s.boards[boardId]?.expandedItemIds ?? [];
      return update(s, boardId, {
        expandedItemIds: current.includes(itemId) ? current.filter((x) => x !== itemId) : [...current, itemId],
      });
    }),
  setKanbanColumn: (boardId, columnId) => set((s) => update(s, boardId, { kanbanColumnId: columnId })),
}));

export function useBoardUi(boardId: string): BoardUiState {
  return useBoardUiStore((s) => s.boards[boardId] ?? EMPTY_BOARD_UI);
}

export function hasActiveFilters(filters: BoardFilters): boolean {
  return (
    filters.personIds.length > 0 ||
    filters.statusIds.length > 0 ||
    filters.priorityIds.length > 0 ||
    filters.groupIds.length > 0 ||
    filters.tags.length > 0 ||
    filters.date !== null
  );
}

export function activeFilterCount(filters: BoardFilters): number {
  return (
    filters.personIds.length +
    filters.statusIds.length +
    filters.priorityIds.length +
    filters.groupIds.length +
    filters.tags.length +
    (filters.date ? 1 : 0)
  );
}

/** Remembered view per board (localStorage). */
const VIEW_KEY = "streamline.board-view";

/**
 * The browser's copy of "which view did I last use on this board", keyed by
 * person and board so two people sharing a machine each get their own. The
 * database keeps the same fact on the board visit (see recordBoardVisit); this
 * copy exists so the right view paints before that round trip returns.
 */
export function readRememberedView(boardId: string, userId?: string): BoardViewKind | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, BoardViewKind>) : {};
    return (userId ? map[`${userId}:${boardId}`] : undefined) ?? map[boardId] ?? null;
  } catch {
    return null;
  }
}

export function rememberView(boardId: string, view: BoardViewKind, userId?: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, BoardViewKind>) : {};
    map[userId ? `${userId}:${boardId}` : boardId] = view;
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

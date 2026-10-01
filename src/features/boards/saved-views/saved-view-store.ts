"use client";

import { create } from "zustand";
import type { BoardViewKind, SavedBoardView, SavedViewConfig } from "@/domain";

/**
 * The saved view a board is showing, as it stands on screen: its view settings
 * and hidden columns, edited freely and saved back only when asked.
 *
 * Search, filters and sort stay in the board's UI store, where the toolbar
 * already reads and writes them; a view puts its own there when it opens.
 */
export interface ActiveSavedView {
  id: string;
  settings: SavedViewConfig["settings"];
  hiddenColumnIds: string[];
}

interface SavedViewStore {
  boards: Record<string, ActiveSavedView | undefined>;
  activate: (boardId: string, view: SavedBoardView) => void;
  clear: (boardId: string) => void;
  setSettings: (boardId: string, kind: BoardViewKind, settings: Record<string, unknown>) => void;
  setHidden: (boardId: string, columnId: string, hidden: boolean) => void;
}

export const useSavedViewStore = create<SavedViewStore>()((set) => ({
  boards: {},
  activate: (boardId, view) =>
    set((s) => ({ boards: { ...s.boards, [boardId]: { id: view.id, settings: structuredClone(view.config.settings), hiddenColumnIds: [...view.config.hiddenColumnIds] } } })),
  clear: (boardId) => set((s) => ({ boards: { ...s.boards, [boardId]: undefined } })),
  setSettings: (boardId, kind, settings) =>
    set((s) => {
      const active = s.boards[boardId];
      if (!active) return {};
      return { boards: { ...s.boards, [boardId]: { ...active, settings: { ...active.settings, [kind]: settings } } } };
    }),
  setHidden: (boardId, columnId, hidden) =>
    set((s) => {
      const active = s.boards[boardId];
      if (!active) return {};
      const rest = active.hiddenColumnIds.filter((id) => id !== columnId);
      return { boards: { ...s.boards, [boardId]: { ...active, hiddenColumnIds: hidden ? [...rest, columnId] : rest } } };
    }),
}));

export function useActiveSavedView(boardId: string): ActiveSavedView | undefined {
  return useSavedViewStore((s) => s.boards[boardId]);
}

/**
 * Each view's defaults, as its settings hook last declared them. A view saved
 * before one of its settings was touched has no value for it, which reads as
 * the default rather than as a change.
 */
const DEFAULTS: Partial<Record<BoardViewKind, Record<string, unknown>>> = {};

export function registerViewDefaults(kind: BoardViewKind, defaults: Record<string, unknown>): void {
  DEFAULTS[kind] = defaults;
}

export function viewDefaults(): Partial<Record<BoardViewKind, Record<string, unknown>>> {
  return DEFAULTS;
}

"use client";

import { createContext, useContext, useMemo } from "react";
import type * as React from "react";
import type { MenuAction } from "@/components/layout/row-menu";
import type { Board, BoardColumn, Item, User } from "@/domain";
import type { BoardModel } from "@/features/boards/board-model";
import type { BoardMutations } from "@/features/boards/hooks/use-board-mutations";
import type { ItemUpdatesSummary } from "@/features/comments/updates";
import type { ItemOpenMode } from "@/stores/board-ui-store";
import type { FeedOptions } from "@/features/boards/table-view-settings";

export interface BoardContextValue {
  board: Board;
  model: BoardModel;
  mutations: BoardMutations;
  /** Workspace users that can be assigned. */
  users: User[];
  /**
   * Everyone a cell may name: pending and deactivated people too, so a requester
   * who has not onboarded yet still shows. `users` when absent.
   */
  people?: User[];
  canEdit: boolean;
  canManage: boolean;
  /** Opens the task beside the board, or — asked for by name — as a pop-up over it. */
  openItem: (itemId: string | null, mode?: ItemOpenMode) => void;
  /** Opens the item straight on its Updates tab. */
  openItemUpdates: (itemId: string) => void;
  openEditLabels: (column: BoardColumn) => void;
  now: Date;
  /**
   * Whether the ticket column is on screen. It is not a column of the board — no
   * width, no position, nothing to edit — so it hides through the Hide menu and
   * is remembered per person, like a view's own settings.
   */
  showTicket: boolean;
  setShowTicket: (show: boolean) => void;
  /**
   * Keeps "open in pop-up" or "open in panel", picked from a task's menu, as
   * where this board opens tasks from now on. A view setting, so a saved view
   * keeps it. Absent where the board is a view over somewhere else.
   */
  rememberOpenMode?: (mode: ItemOpenMode) => void;
  /** Where this board opens tasks now (the setting rememberOpenMode keeps). */
  openMode?: ItemOpenMode;
  /** How the pop-up's feed reads: a view setting of the board, kept with a saved view. */
  feedOptions?: FeedOptions;
  setFeedOptions?: (patch: Partial<FeedOptions>) => void;
  /** Update counts per item (subitems included), with how many are new to this person. */
  updates: Map<string, ItemUpdatesSummary>;
  /**
   * A task's menu where the board is a view over somewhere else (the internal
   * portal): the page's own entries after Open, and only those. The journey,
   * star, follow and pop-up entries would act on the view's copy, not the task,
   * so they are left to the real panel the page opens.
   */
  itemMenu?: { extra: (item: Item) => MenuAction[] };
  /**
   * Tasks sent back to their requester and not answered yet. Each shows "Sent
   * back" in place of its status, and nobody edits it until the requester
   * answers or the team takes it back: their answer would land on top.
   */
  sentBackItemIds?: ReadonlySet<string>;
  /**
   * Inside a sent-back task's scope, whether the reader could edit it were it
   * not waiting: they may still post updates and take the send-back back.
   * Absent outside one, where `canEdit` says the same.
   */
  canEditUnlocked?: boolean;
}

const BoardContext = createContext<BoardContextValue | null>(null);

/**
 * One task's part of the board: its row, card or panel. While the task waits
 * on its requester, everything inside reads `canEdit` as false, so every cell,
 * menu and field the board already gates on it stays put without each needing
 * to know why. Always a provider, so nothing remounts when the lock comes or goes.
 */
export function ItemEditScope({ itemId, children }: { itemId: string; children: React.ReactNode }) {
  const ctx = useContext(BoardContext);
  const locked = !!ctx && ctx.canEdit && !!ctx.sentBackItemIds?.has(itemId);
  const value = useMemo(() => (ctx && locked ? { ...ctx, canEdit: false, canEditUnlocked: true } : ctx), [ctx, locked]);
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

/** Whether this task waits on its requester, for whatever draws it. */
export function useItemSentBack(itemId: string | null | undefined): boolean {
  const ctx = useContext(BoardContext);
  return !!itemId && !!ctx?.sentBackItemIds?.has(itemId);
}

/** Whether the reader may post updates on, or act on the send-back of, the task in scope: the right the lock leaves alone. */
export function useCanEditUnlocked(): boolean {
  const ctx = useContext(BoardContext);
  return !!ctx && (ctx.canEditUnlocked ?? ctx.canEdit);
}

export const BoardContextProvider = BoardContext.Provider;

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoardContext must be used inside a board");
  return ctx;
}


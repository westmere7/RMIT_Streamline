"use client";

import { createContext, useContext } from "react";
import type { Board, BoardColumn, User } from "@/domain";
import type { BoardModel } from "@/features/boards/board-model";
import type { BoardMutations } from "@/features/boards/hooks/use-board-mutations";
import type { ItemUpdatesSummary } from "@/features/comments/updates";
import type { ItemOpenMode } from "@/stores/board-ui-store";

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
  /** Update counts per item (subitems included), with how many are new to this person. */
  updates: Map<string, ItemUpdatesSummary>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

export const BoardContextProvider = BoardContext.Provider;

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error("useBoardContext must be used inside a board");
  return ctx;
}


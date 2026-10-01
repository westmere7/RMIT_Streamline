"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * A board locked for one person: view only, so a stray click or drag changes
 * nothing. Not a permission. It is their own safety catch, kept in this
 * browser, and they take it off when they mean to edit. The board's own lock,
 * for everyone on it, is `Board.viewOnly`.
 */
interface BoardLockStore {
  /** "userId:boardId" for every board this person has locked for themselves. */
  locked: Record<string, true>;
  setLocked: (userId: string, boardId: string, on: boolean) => void;
}

export const useBoardLockStore = create<BoardLockStore>()(
  persist(
    (set) => ({
      locked: {},
      setLocked: (userId, boardId, on) =>
        set((s) => {
          const key = `${userId}:${boardId}`;
          const next = { ...s.locked };
          if (on) next[key] = true;
          else delete next[key];
          return { locked: next };
        }),
    }),
    { name: "streamline.board-lock" },
  ),
);

export function useLockedForMe(userId: string, boardId: string): boolean {
  return useBoardLockStore((s) => !!s.locked[`${userId}:${boardId}`]);
}

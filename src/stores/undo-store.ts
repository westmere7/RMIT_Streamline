"use client";

import { create } from "zustand";

/**
 * The one thing that can be undone right now.
 *
 * Not a history. A board keeps a single standing offer — the last reversible
 * thing somebody did — and it stands until they do anything else, at which
 * point it is gone whether or not they took it. That is the promise the bar
 * makes: "this stays here until you move on". A stack would need a rule about
 * what undoing the second thing does to the first, and nobody dragging cells
 * about wants to reason about that.
 *
 * Which actions offer one is decided where they run (useBoardMutations): the
 * ones with a clean inverse and no dialog of their own. Deleting is not among
 * them; it asks first and means it.
 */
export interface UndoOffer {
  id: string;
  /** What was done, in the past tense: "Status set to Done", "3 items archived". */
  label: string;
  undo: () => Promise<unknown>;
}

interface UndoStore {
  offer: UndoOffer | null;
  /** Something is being undone; the bar shows it rather than offering again. */
  busy: boolean;
  propose: (label: string, undo: () => Promise<unknown>) => void;
  clear: () => void;
  /** Takes the offer: runs its undo, then clears it. */
  perform: () => Promise<void>;
}

let counter = 0;

export const useUndoStore = create<UndoStore>()((set, get) => ({
  offer: null,
  busy: false,
  propose: (label, undo) => {
    counter += 1;
    set({ offer: { id: `undo-${counter}`, label, undo }, busy: false });
  },
  clear: () => set({ offer: null, busy: false }),
  perform: async () => {
    const { offer, busy } = get();
    if (!offer || busy) return;
    set({ busy: true });
    try {
      await offer.undo();
    } finally {
      // Whatever the undo did, the offer is spent; a failure has already been said.
      if (get().offer?.id === offer.id) set({ offer: null, busy: false });
    }
  },
}));

/** For code that is not a component: the mutations that offer, and the ones that retire an offer. */
export const offerUndo = (label: string, undo: () => Promise<unknown>) => useUndoStore.getState().propose(label, undo);
export const clearUndo = () => useUndoStore.getState().clear();

"use client";

import * as React from "react";
import type { ISODate } from "@/domain";
import type { TaskEvent } from "@/features/calendar/model";

/** What the pointer is over: a day, a task, or nothing (the details fall back to the chosen day). */
export interface CalendarFocus {
  day: ISODate | null;
  task: TaskEvent | null;
}

export interface FocusStore {
  get: () => CalendarFocus;
  set: (patch: Partial<CalendarFocus>) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Hover state kept outside React, so moving across a month re-renders the
 * details panel alone and not every cell of the calendar.
 */
export function createFocusStore(): FocusStore {
  let state: CalendarFocus = { day: null, task: null };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      const next = { ...state, ...patch };
      if (next.day === state.day && next.task === state.task) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useFocus(store: FocusStore): CalendarFocus {
  return React.useSyncExternalStore(store.subscribe, store.get, store.get);
}

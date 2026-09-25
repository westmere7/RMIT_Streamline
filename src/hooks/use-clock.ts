"use client";

import { useSyncExternalStore } from "react";

/**
 * Now, to within a few seconds, for things that count down.
 *
 * One timer for the whole page however many cells read it, and none at all
 * while nothing does. Every fifteen seconds is often enough for a countdown
 * shown in minutes, and a page coming back into view catches up at once.
 */
const TICK_MS = 15_000;

const listeners = new Set<() => void>();
let timer: number | null = null;
let current = 0;

function tick() {
  current = Math.floor(Date.now() / TICK_MS);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    timer = window.setInterval(tick, TICK_MS);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      timer = null;
    }
  };
}

function snapshot() {
  return current || (current = Math.floor(Date.now() / TICK_MS));
}

/** Re-renders the caller every tick. Read `new Date()` in the render for the time itself. */
export function useClockTick(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

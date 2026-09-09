"use client";

import * as React from "react";

/**
 * Presentation choices that exist only on a phone: which lane the Kanban is
 * showing, cards or grid on the Main Table.
 *
 * Its own storage key, deliberately. These have no desktop counterpart, and the
 * board's own view settings are saved with the person's board visit and follow
 * them to another device — writing a phone-shaped choice there would change what
 * their desktop opens on. Nothing here leaves the browser it was chosen in.
 */
const KEY = "streamline.mobile-view";

/**
 * The stored map, cached so every reader gets the same object identity.
 *
 * useSyncExternalStore compares snapshots by identity: parsing the JSON afresh
 * on each call would hand back a new object every time and spin the render loop.
 */
let cache: Record<string, unknown> | null = null;
const listeners = new Set<() => void>();

function all(): Record<string, unknown> {
  if (cache) return cache;
  if (typeof window === "undefined") return (cache = {});
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(storageKey: string, value: unknown): void {
  cache = { ...all(), [storageKey]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // A phone with storage blocked still works; the choice just lasts one visit.
  }
  for (const listener of listeners) listener();
}

/**
 * Hydration-safe by construction: the server snapshot is the stored map as the
 * server sees it (empty), so the markup matches and the remembered choice
 * arrives on the first commit — the same shape as useIsMobile.
 */
export function useMobileViewPref<T>(storageKey: string, fallback: T): [T, (value: T) => void] {
  const stored = React.useSyncExternalStore(subscribe, all, () => EMPTY)[storageKey];
  const value = stored === undefined ? fallback : (stored as T);
  const set = React.useCallback((next: T) => write(storageKey, next), [storageKey]);
  return [value, set];
}

const EMPTY: Record<string, unknown> = {};

"use client";

import * as React from "react";
import type { PersonalViewKey } from "@/data/repositories";
import type { BoardViewKind } from "@/domain";
import type { Services } from "@/services";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { registerViewDefaults, useSavedViewStore } from "@/features/boards/saved-views/saved-view-store";

const KEY = "streamline.view-settings";

function readLocal(storageKey: string): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {};
    return map[storageKey] ?? {};
  } catch {
    return {};
  }
}

/**
 * A change this browser has made but not yet saved to the database (the save
 * waits 600 ms for more). Until it is saved, this browser's copy is the newer
 * one: a reload in that gap must not let the database's older copy win.
 */
const PENDING_KEY = "streamline.view-settings.pending";

function pendingKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(PENDING_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function setPending(storageKey: string, pending: boolean): void {
  if (typeof window === "undefined") return;
  try {
    const keys = pendingKeys();
    if (pending) keys.add(storageKey);
    else keys.delete(storageKey);
    window.localStorage.setItem(PENDING_KEY, JSON.stringify([...keys]));
  } catch {
    // ignore storage failures
  }
}

function writeLocal(storageKey: string, value: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Record<string, unknown>>) : {};
    map[storageKey] = value;
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // ignore storage failures
  }
}

/** This person's own settings for a view on a board (or, as "columns", the columns they hid), as this browser last kept them. */
export function readPersonalViewSettings(userId: string, boardId: string, view: PersonalViewKey): Record<string, unknown> {
  return readLocal(`${userId}:${boardId}:${view}`);
}

/** A change to this person's own settings that this browser has not saved to the database yet. */
export function personalViewSettingsPending(userId: string, boardId: string, view: PersonalViewKey): boolean {
  return pendingKeys().has(`${userId}:${boardId}:${view}`);
}

/** Per person and board: the changes waiting for the database, the timer, and the save in flight. */
const personalQueues = new Map<string, { waiting: Map<PersonalViewKey, Record<string, unknown>>; timer: number | null; chain: Promise<void> }>();

/**
 * Keeps this person's own settings (the unsaved Default view's working copy):
 * in this browser at once, in the database 600 ms later.
 *
 * One board's changes go to the database one after another: a save replaces
 * the person's whole settings record with one key changed, so two side by
 * side (Discard resets the open mode and the hidden columns together) would
 * each write back the other's old value.
 */
export function savePersonalViewSettings(services: Services, userId: string, boardId: string, view: PersonalViewKey, settings: Record<string, unknown>): void {
  writeLocal(`${userId}:${boardId}:${view}`, settings);
  setPending(`${userId}:${boardId}:${view}`, true);
  const queueKey = `${userId}:${boardId}`;
  const queue = personalQueues.get(queueKey) ?? { waiting: new Map(), timer: null, chain: Promise.resolve() };
  personalQueues.set(queueKey, queue);
  queue.waiting.set(view, settings);
  if (queue.timer) window.clearTimeout(queue.timer);
  queue.timer = window.setTimeout(() => {
    queue.timer = null;
    const batch = [...queue.waiting];
    queue.waiting.clear();
    for (const [key, value] of batch) {
      queue.chain = queue.chain.then(() =>
        services.repos.admin
          .saveBoardViewSettings(userId, boardId, key, value)
          // Pending until the newest change to this key is saved.
          .then(() => {
            if (!queue.waiting.has(key)) setPending(`${userId}:${boardId}:${key}`, false);
          })
          .catch(() => undefined),
      );
    }
  }, 600);
}

/**
 * A view's own settings — the Kanban's lane dimension, a zoom level, what the
 * chart slices by — remembered per person and per board. The browser keeps a
 * copy so the view paints with the right settings at once; the same settings
 * are saved with the person's board visit so they follow them to another
 * device. Defaults fill in whatever has never been chosen.
 *
 * While a saved view is open on the board, the settings are that view's
 * instead: read from it and written to its working copy, and this person's own
 * are left as they were for when they go back. On a Default view nobody has
 * saved, the working copy is this person's own, and the saved-views controller
 * keeps it for them.
 */
export function useViewSettings<T extends Record<string, unknown>>(view: BoardViewKind, defaults: T): [T, (patch: Partial<T>) => void] {
  const { board } = useBoardContext();
  return useViewSettingsFor(board.id, view, defaults);
}

/**
 * The same, for a caller that knows the board but is not inside it yet — the
 * board screen itself, which reads the table's settings in order to build the
 * context the rest of the board reads them from.
 */
export function useViewSettingsFor<T extends Record<string, unknown>>(boardId: string, view: BoardViewKind, defaults: T): [T, (patch: Partial<T>) => void] {
  const board = { id: boardId };
  const user = useCurrentUser();
  const services = useServices();
  const storageKey = `${user.id}:${board.id}:${view}`;
  const [state, setState] = React.useState<T>(() => ({ ...defaults, ...(readLocal(storageKey) as Partial<T>) }));
  registerViewDefaults(view, defaults);
  const saved = useSavedViewStore((s) => s.boards[boardId]);
  const savedSettings = saved?.settings[view];
  const savedOn = !!saved;
  const setSavedSettings = useSavedViewStore((s) => s.setSettings);
  const defaultsKey = JSON.stringify(defaults);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults is a fresh literal each render; its JSON is what counts
  const savedState = React.useMemo(() => ({ ...defaults, ...savedSettings }) as T, [defaultsKey, savedSettings]);
  const touched = React.useRef(false);

  // Once per board and view: what the database remembers, unless the person has
  // already changed something in this session (their choice wins).
  React.useEffect(() => {
    touched.current = false;
    let cancelled = false;
    // A change made here and not saved yet (the page was left inside the save's
    // 600 ms): this browser's copy is the newer one, so it is saved now and wins.
    if (pendingKeys().has(storageKey)) {
      // Through the board's queue: other views may be catching up at the same moment.
      savePersonalViewSettings(services, user.id, board.id, view, readLocal(storageKey));
      return () => {
        cancelled = true;
      };
    }
    void services.repos.admin
      .getBoardViewSettings(user.id, board.id)
      .then((all) => {
        const remote = all[view];
        if (cancelled || touched.current || !remote || typeof remote !== "object") return;
        writeLocal(storageKey, remote as Record<string, unknown>);
        setState((prev) => ({ ...prev, ...(remote as Partial<T>) }));
      })
      .catch(() => {
        // the browser's copy is good enough
      });
    return () => {
      cancelled = true;
    };
  }, [services, user.id, board.id, view, storageKey]);

  const update = React.useCallback(
    (patch: Partial<T>) => {
      touched.current = true;
      setState((prev) => {
        const next = { ...prev, ...patch };
        savePersonalViewSettings(services, user.id, board.id, view, next);
        return next;
      });
    },
    [services, user.id, board.id, view],
  );

  const updateSaved = React.useCallback(
    (patch: Partial<T>) => {
      const current = useSavedViewStore.getState().boards[boardId]?.settings[view];
      setSavedSettings(boardId, view, { ...JSON.parse(defaultsKey), ...current, ...patch });
    },
    [boardId, view, defaultsKey, setSavedSettings],
  );

  return savedOn ? [savedState, updateSaved] : [state, update];
}

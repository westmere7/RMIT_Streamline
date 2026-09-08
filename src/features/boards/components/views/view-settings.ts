"use client";

import * as React from "react";
import type { BoardViewKind } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";

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

/**
 * A view's own settings — the Kanban's lane dimension, a zoom level, what the
 * chart slices by — remembered per person and per board. The browser keeps a
 * copy so the view paints with the right settings at once; the same settings
 * are saved with the person's board visit so they follow them to another
 * device. Defaults fill in whatever has never been chosen.
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
  const touched = React.useRef(false);
  const timer = React.useRef<number | null>(null);

  // Once per board and view: what the database remembers, unless the person has
  // already changed something in this session (their choice wins).
  React.useEffect(() => {
    touched.current = false;
    let cancelled = false;
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
        writeLocal(storageKey, next);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void services.repos.admin.saveBoardViewSettings(user.id, board.id, view, next).catch(() => undefined), 600);
        return next;
      });
    },
    [services, user.id, board.id, view, storageKey],
  );

  return [state, update];
}

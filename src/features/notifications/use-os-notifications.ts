"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import type { Notification } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useNotificationPreferences, useNotifications } from "@/features/notifications/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { currentPermission, shouldRaiseOsNotification, showOsNotification } from "@/lib/browser-notifications";

/** Ids already announced, so a refetch never repeats itself. */
const SEEN_KEY = "streamline.os-notifications.seen";
/** Enough to cover a busy day; the list is trimmed to keep localStorage small. */
const SEEN_LIMIT = 200;

function readSeen(userId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${SEEN_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    // A private window, cleared storage, or rubbish left by something else.
    return new Set();
  }
}

function writeSeen(userId: string, ids: Set<string>): void {
  try {
    window.localStorage.setItem(`${SEEN_KEY}:${userId}`, JSON.stringify([...ids].slice(-SEEN_LIMIT)));
  } catch {
    // Not being able to remember is not worth breaking the page over; the worst
    // case is one repeated notification after a reload.
  }
}

/**
 * Turns incoming notifications into operating-system notifications.
 *
 * The list is already kept fresh by polling and, on Supabase, by the realtime
 * subscription — this watches it and raises a toast for anything new and loud
 * that the reader has not already been shown. What counts as "should raise" is
 * `shouldRaiseOsNotification`, which is pure and tested on its own.
 *
 * The backlog is never announced: on the first pass everything present is
 * recorded as seen, so opening the app does not fire five notifications at once.
 */
export function useOsNotifications(): void {
  const user = useCurrentUser();
  const ws = useWorkspace();
  const router = useRouter();
  const { data: notifications } = useNotifications(user.id);
  const { data: preferences } = useNotificationPreferences(user.id);

  const seen = React.useRef<Set<string> | null>(null);
  /** Whose backlog has been taken in; switching account starts again. */
  const primedFor = React.useRef<string | null>(null);

  const urlFor = React.useCallback(
    (notification: Notification): string => {
      const board = ws.boardById(notification.boardId ?? (notification.entityType === "BOARD" ? notification.entityId : null));
      if (!board) return `/workspace/${ws.slug}/inbox`;
      return notification.entityType === "ITEM" ? ws.boardPath(board, { itemId: notification.entityId }) : ws.boardPath(board);
    },
    [ws],
  );

  React.useEffect(() => {
    if (!notifications) return;
    if (primedFor.current !== user.id) {
      // First pass for this account: remember what is already there and say
      // nothing, so opening the app — or switching account — does not fire the
      // whole backlog at once.
      primedFor.current = user.id;
      seen.current = readSeen(user.id);
      for (const n of notifications) seen.current.add(n.id);
      writeSeen(user.id, seen.current);
      return;
    }
    const known = seen.current ?? new Set<string>();

    const enabled = preferences?.browserEnabled ?? false;
    const permission = currentPermission();
    let announced = false;

    // Oldest first, so a burst arrives in the order it happened.
    for (const notification of [...notifications].reverse()) {
      const decision = shouldRaiseOsNotification({
        delivery: notification.delivery,
        enabled,
        permission,
        visibility: typeof document === "undefined" ? "visible" : document.visibilityState,
        alreadySeen: known.has(notification.id),
      });
      // Seen either way: a notification that arrived while the tab was open
      // should not appear the moment the reader switches away from it.
      if (known.has(notification.id)) continue;
      known.add(notification.id);
      announced = true;
      if (!decision) continue;
      showOsNotification(
        { id: notification.id, title: notification.title, body: notification.body, url: urlFor(notification) },
        (url) => router.push(url),
      );
    }
    if (announced) writeSeen(user.id, known);
  }, [notifications, preferences?.browserEnabled, router, user.id, urlFor]);
}

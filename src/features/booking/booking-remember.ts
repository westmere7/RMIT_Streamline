"use client";

import * as React from "react";
import type { BookingAssetLine, BookingRequest } from "@/domain";

/**
 * What this browser remembers about the bookings made from it.
 *
 * A stakeholder books two or three times a semester. They retype their name
 * and their email every time — two of the four questions the form insists on —
 * and then they retype the request itself, which is usually last term's
 * request with two words changed. Their own browser is the right place to keep
 * both: it never leaves the machine, it needs no account and no column,
 * nothing on the server has to know, and it is theirs to clear. The form says
 * whose details it has filled in and offers the way out.
 *
 * Scoped by portal (or by workspace on the public form), because one browser
 * may be used to book for two departments and the answer is not the same
 * person either time.
 */
export interface RememberedRequester {
  name: string;
  email: string;
}

/** A booking this browser has already made, enough of it to start another. */
export interface PastBooking {
  /** The item's id, which is also what its reference is made from. */
  id: string;
  reference: string;
  bookedAt: string;
  title: string;
  brief: string;
  assetTypes: string[];
  priority: string | null;
  teamId: string | null;
  referenceUrl: string | null;
  assets: BookingAssetLine[];
}

/** A booking that was started and not sent, exactly as it was left. */
export interface BookingDraftMemory {
  savedAt: string;
  title: string;
  brief: string;
  dueDate: string;
  referenceUrl: string;
  assetTypes: string[];
  priority: string | null;
  teamId: string | null;
  assets: BookingAssetLine[];
}

export interface BookingMemory {
  requester: RememberedRequester | null;
  bookings: PastBooking[];
  /** What was left half-written, or null once it has been sent or thrown away. */
  draft: BookingDraftMemory | null;
}

const KEY = "streamline.booking";

/**
 * How many bookings to keep. Enough that the last few sessions are all there,
 * few enough that the strip above the form stays a row rather than a list —
 * and that a shared machine cannot accumulate a year of somebody's requests.
 */
const KEEP = 5;

export const NO_MEMORY: BookingMemory = { requester: null, bookings: [], draft: null };

/**
 * The parsed store, cached against the text it was parsed from.
 *
 * useSyncExternalStore compares snapshots by identity, so parsing the JSON
 * afresh on every call would hand back a new object each time and spin the
 * render loop. Keying the cache on the raw string rather than caching once
 * costs a synchronous string read per render and buys two things: another tab
 * that books is picked up on the next render, and nothing has to remember to
 * invalidate anything.
 */
let cache: { raw: string | null; value: Record<string, BookingMemory> } | null = null;
const listeners = new Set<() => void>();

function raw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // A private window, or storage turned off.
    return null;
  }
}

function all(): Record<string, BookingMemory> {
  const text = raw();
  if (cache && cache.raw === text) return cache.value;
  const value: Record<string, BookingMemory> = {};
  try {
    const parsed = (text ? JSON.parse(text) : {}) as Record<string, Partial<BookingMemory> | undefined>;
    // Written by an older version, by hand, or by something else on this key:
    // anything that is not a booking is dropped rather than repaired.
    for (const [scope, entry] of Object.entries(parsed ?? {})) {
      const requester = entry?.requester;
      value[scope] = {
        requester: requester && typeof requester.name === "string" && typeof requester.email === "string" && requester.name.trim() && requester.email.trim() ? requester : null,
        bookings: Array.isArray(entry?.bookings) ? entry.bookings.filter((b): b is PastBooking => !!b && typeof b.id === "string" && typeof b.title === "string").slice(0, KEEP) : [],
        draft: entry?.draft && typeof entry.draft === "object" && typeof entry.draft.title === "string" ? entry.draft : null,
      };
    }
  } catch {
    // Not JSON at all: start again rather than refusing to render a form.
  }
  cache = { raw: text, value };
  return value;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function write(scope: string, memory: BookingMemory): void {
  const next = { ...all(), [scope]: memory };
  const text = JSON.stringify(next);
  cache = { raw: text, value: next };
  try {
    window.localStorage.setItem(KEY, text);
  } catch {
    // Nothing to do: the form still works, it just will not remember.
  }
  for (const listener of listeners) listener();
}

const EMPTY_MAP: Record<string, BookingMemory> = {};
const serverSnapshot = (): Record<string, BookingMemory> => EMPTY_MAP;
const subscribeNever = () => () => undefined;

/**
 * This browser's booking memory for one scope, and the ways to change it.
 *
 * Hydration-safe by construction: the server snapshot is "nothing
 * remembered", so the first markup matches and what this browser knows
 * arrives on the first commit.
 */
export function useBookingMemory(scope: string | null) {
  const stored = React.useSyncExternalStore(subscribe, all, serverSnapshot);
  const memory = (scope ? stored[scope] : undefined) ?? NO_MEMORY;

  /** Called once a booking is in: who made it, and what it was. */
  const remember = React.useCallback(
    (request: BookingRequest, reference: string, bookedAt: string) => {
      if (!scope) return;
      const current = all()[scope] ?? NO_MEMORY;
      const named = !!request.requesterName.trim() && !!request.requesterEmail.trim();
      const booking: PastBooking = {
        id: request.itemId ?? reference,
        reference,
        bookedAt,
        title: request.title.trim(),
        brief: request.brief.trim(),
        assetTypes: request.assetTypes,
        priority: request.priority,
        teamId: request.teamId,
        referenceUrl: request.referenceUrl ?? null,
        assets: request.assets,
      };
      write(scope, {
        requester: named ? { name: request.requesterName.trim(), email: request.requesterEmail.trim() } : current.requester,
        // Newest first, and re-booking from an old one replaces that entry
        // rather than listing the same request twice.
        bookings: [booking, ...current.bookings.filter((b) => b.id !== booking.id)].slice(0, KEEP),
        // The booking is in: whatever was saved half-written is that booking.
        draft: null,
      });
    },
    [scope],
  );

  /** Keep what has been typed so far, or clear it when `null` is passed. */
  const saveDraft = React.useCallback(
    (draft: BookingDraftMemory | null) => {
      if (scope) write(scope, { ...(all()[scope] ?? NO_MEMORY), draft });
    },
    [scope],
  );

  const forgetRequester = React.useCallback(() => {
    if (scope) write(scope, { ...(all()[scope] ?? NO_MEMORY), requester: null });
  }, [scope]);

  const clearHistory = React.useCallback(() => {
    if (scope) write(scope, { ...(all()[scope] ?? NO_MEMORY), bookings: [] });
  }, [scope]);

  return { requester: memory.requester, bookings: memory.bookings, draft: memory.draft, remember, saveDraft, forgetRequester, clearHistory };
}

/**
 * True once the page is running in the browser.
 *
 * The form builds its first draft from what this browser remembers, and that
 * is not knowable while the markup is being made on the server — so the form
 * itself waits one commit rather than filling itself in afterwards.
 */
export function useMountedInBrowser(): boolean {
  return React.useSyncExternalStore(subscribeNever, () => true, () => false);
}

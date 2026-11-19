"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useDataContext } from "@/features/data/data-context";
import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * Who is signed in and looking at the app right now.
 *
 * Supabase Realtime Presence keeps this in the Realtime server's memory: no
 * table, no write, no trigger, nothing in Postgres at all. Each tab joins one
 * channel on the socket it already holds for board updates, says who it is
 * once, and hears others come and go. A message goes out only when someone
 * arrives or leaves, which is what keeps it inside the free plan's allowance —
 * so nothing here may track more than who the person is (no board, no typing,
 * no cursor), and nothing may re-track on a timer.
 *
 * One channel for the whole app rather than one per workspace: people are
 * shared across workspaces, and someone at work in another one is still online.
 * It is a private channel; who may join is a policy on realtime.messages
 * (policies/0027), active members only.
 *
 * A tab out of sight for a minute leaves, and comes back when it is looked at.
 * Locally (the demo) the tabs of this browser tell each other over a
 * BroadcastChannel instead.
 */

/** The private channel's topic, matched by the realtime.messages policy. */
export const PRESENCE_TOPIC = "presence:app";
/** How long a hidden tab still counts as here: a glance at another window is not leaving. */
export const AWAY_AFTER_MS = 60_000;

// ── The store ───────────────────────────────────────────────────────────────

let online: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

/** Replaces who is online. Listeners hear only an actual change. */
export function setOnline(ids: Iterable<string>): void {
  const next = new Set(ids);
  if (next.size === online.size && [...next].every((id) => online.has(id))) return;
  online = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this person is online. Re-renders only when their own answer changes. */
export function useIsOnline(userId: string | null | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (userId ? online.has(userId) : false),
    () => false,
  );
}

// ── Being here ──────────────────────────────────────────────────────────────

/**
 * Whether this tab counts as here: visible, or hidden for less than
 * AWAY_AFTER_MS. Calls `onChange` when that flips.
 */
function watchHere(onChange: (here: boolean) => void): () => void {
  let here = true;
  let away: ReturnType<typeof setTimeout> | null = null;
  const set = (next: boolean) => {
    if (next === here) return;
    here = next;
    onChange(here);
  };
  const onVisibility = () => {
    if (away) clearTimeout(away);
    away = null;
    if (document.visibilityState === "visible") set(true);
    else away = setTimeout(() => set(false), AWAY_AFTER_MS);
  };
  document.addEventListener("visibilitychange", onVisibility);
  onVisibility();
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    if (away) clearTimeout(away);
  };
}

/** Takes part in presence as `userId` while mounted. Mounted once, by WorkspaceProvider. */
export function usePresence(userId: string | null): void {
  const { providerKind } = useDataContext();
  useEffect(() => {
    if (!userId) return;
    const stop = providerKind === "supabase" ? joinSupabase(userId) : joinLocal(userId);
    return () => {
      stop();
      setOnline([]);
    };
  }, [userId, providerKind]);
}

function joinSupabase(userId: string): () => void {
  const supabase = getSupabaseClient();
  // Keyed by person, so two tabs of one account are one entry with two metas.
  const channel = supabase.channel(PRESENCE_TOPIC, { config: { private: true, presence: { key: userId } } });
  let subscribed = false;
  let here = true;
  const sync = () => setOnline(Object.keys(channel.presenceState()));
  channel.on("presence", { event: "sync" }, sync);
  channel.subscribe((status) => {
    subscribed = status === "SUBSCRIBED";
    // After a drop the server has forgotten this tab, so it says so again.
    if (subscribed && here) void channel.track({});
    if (!subscribed) setOnline([]);
  });
  const unwatch = watchHere((next) => {
    here = next;
    if (!subscribed) return;
    void (here ? channel.track({}) : channel.untrack());
  });
  return () => {
    unwatch();
    void supabase.removeChannel(channel);
  };
}

/** What one tab tells the others in the demo. */
interface LocalPresenceMessage {
  tab: string;
  userId: string | null;
  /** "who" asks every tab to say who it is; the newcomer has heard nobody yet. */
  kind: "here" | "gone" | "who";
}

const LOCAL_CHANNEL = "streamline.presence";
/** A tab that has not spoken for this long has closed without saying so. */
const LOCAL_STALE_MS = 45_000;
const LOCAL_BEAT_MS = 15_000;

function joinLocal(userId: string): () => void {
  if (typeof BroadcastChannel === "undefined") {
    setOnline([userId]);
    return () => undefined;
  }
  const tab = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());
  const channel = new BroadcastChannel(LOCAL_CHANNEL);
  const others = new Map<string, { userId: string; at: number }>();
  let here = true;
  const publish = () => {
    const now = Date.now();
    for (const [id, seen] of others) if (now - seen.at > LOCAL_STALE_MS) others.delete(id);
    setOnline([...(here ? [userId] : []), ...[...others.values()].map((o) => o.userId)]);
  };
  const say = (kind: LocalPresenceMessage["kind"]) => channel.postMessage({ tab, userId, kind } satisfies LocalPresenceMessage);
  channel.onmessage = (event: MessageEvent<LocalPresenceMessage>) => {
    const message = event.data;
    if (!message || message.tab === tab) return;
    if (message.kind === "who") {
      if (here) say("here");
      return;
    }
    if (message.kind === "gone" || !message.userId) others.delete(message.tab);
    else others.set(message.tab, { userId: message.userId, at: Date.now() });
    publish();
  };
  say("here");
  say("who");
  publish();
  const beat = setInterval(() => {
    if (here) say("here");
    publish();
  }, LOCAL_BEAT_MS);
  const unwatch = watchHere((next) => {
    here = next;
    say(here ? "here" : "gone");
    publish();
  });
  const leave = () => say("gone");
  window.addEventListener("pagehide", leave);
  return () => {
    unwatch();
    clearInterval(beat);
    window.removeEventListener("pagehide", leave);
    leave();
    channel.close();
  };
}

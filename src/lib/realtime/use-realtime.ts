"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useDataContext } from "@/features/data/data-context";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isQueryHeld, onHoldReleased } from "@/lib/query/write-holds";

/**
 * One Supabase Realtime channel, expressed as tables and the queries they feed.
 *
 * Every live surface in the app used to carry its own copy of the same thirty
 * lines: open a channel, attach listeners, hold a timer so one write does not
 * cause five refetches, tear it all down again. This is that code, once.
 *
 * RLS applies to Realtime, so a subscriber is only told about rows it could
 * have selected; nothing here has to re-check who may see what. In local mode
 * the BroadcastChannel in ./local-realtime.ts invalidates the same keys, so the
 * hook stands down.
 */

export interface RealtimeBinding {
  /** Table in `public`. It must be in the `supabase_realtime` publication. */
  table: string;
  /** A `postgres_changes` filter such as `board_id=eq.<id>`. Without one, every row the reader may select arrives. */
  filter?: string;
  /**
   * Queries to invalidate when a row on this table moves. These are prefixes:
   * `["comments"]` refreshes every comment query, whichever item it is keyed by.
   */
  keys: ReadonlyArray<readonly unknown[]>;
  /**
   * Whether an inserted or updated row concerns this reader, for a table that
   * cannot be filtered on the wire (the row names a board, and a filter names
   * one value). Called with the row as it now is; a deletion carries only its
   * id and is always let through. Read at the moment the row arrives, so it may
   * close over state that changes: only the latest one given is used.
   */
  accept?: (row: Record<string, unknown>) => boolean;
  /**
   * Hear new rows only. For an append-only log read as a signal (activities),
   * where an update or a deletion says nothing, and where the unfiltered
   * deletion listener a filtered binding otherwise gets would hear every
   * deletion on the table.
   */
  insertsOnly?: boolean;
  /**
   * What to do, when the channel first comes up, about data this page read
   * before it was listening (a change committed in that gap reached nobody):
   * - "probe": ask the database whether the workspace changed since
   *   (`workspace_changed_within`, one tiny call) and read again only if so.
   *   For tables whose writes bump the workspace revision (boards, items,
   *   values, updates, assets, links, teams, profiles, activity) when the
   *   channel names its workspace (`options.catchUp`).
   * - "refetch": read again. For light queries the revision does not follow.
   * - "none": leave it; the next change reads anyway.
   * Defaults to "probe" when the channel names a workspace, else "refetch".
   */
  catchUp?: "probe" | "refetch" | "none";
}

export interface RealtimeOptions {
  /** One write often touches several rows; wait this long for the burst to end before reading. */
  coalesceMs?: number;
  /**
   * The least time between two reads, however long the burst runs. Coalescing
   * bounds one burst; this bounds a steady stream of them, which is what a
   * board being worked on looks like. Leave it off for small reads.
   */
  minIntervalMs?: number;
  /** The workspace whose revision a "probe" catch-up asks about (see RealtimeBinding.catchUp). */
  catchUp?: { workspaceId: string | null };
}

const DEFAULT_COALESCE_MS = 400;
/** Added to the time since the page read, for the read's own trip and the commit's. */
const CATCH_UP_MARGIN_S = 3;
/** How long the catch-up waits for the database feed to say it is up before going ahead. */
const CATCH_UP_FALLBACK_MS = 3_000;

/**
 * Live channels, by the topic they were opened under.
 *
 * Supabase hands back the *existing* channel when a topic is asked for twice,
 * and a channel that has already subscribed refuses new `postgres_changes`
 * callbacks — so two components asking for the same subscription used to crash
 * the second one. They share one, counted here: a board's rows all want the
 * same thing, and one row is as good a place to ask from as any.
 */
interface OpenChannel {
  readonly topic: string;
  /** How many mounted callers want it. The last one out closes it. */
  refs: number;
  close: () => void;
  /** Pending teardown, so React's mount-cleanup-mount in development does not churn the socket. */
  closing: ReturnType<typeof setTimeout> | null;
}
const open = new Map<string, OpenChannel>();
/**
 * Each opening gets a Supabase channel name of its own. Closing is asynchronous:
 * `removeChannel` keeps the old channel listed until it has unsubscribed, and a
 * caller that opened the same topic in that gap (a page swapped, a workspace
 * switched) was handed the old, already-subscribed channel and threw on its
 * first listener.
 */
let openings = 0;

/** Short, stable digest of the bindings, so one topic always means one set of listeners. */
function digest(signature: string): string {
  let hash = 0;
  for (let i = 0; i < signature.length; i += 1) hash = (Math.imul(31, hash) + signature.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

/**
 * Subscribes while `channel` is non-null and the provider is Supabase.
 *
 * `bindings` may be rebuilt on every render — the subscription is keyed by what
 * it describes, not by the identity of the array. Several components may ask
 * for the same channel; they share one subscription.
 */
export function useRealtime(channel: string | null, bindings: readonly RealtimeBinding[], options: RealtimeOptions = {}): void {
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  const { coalesceMs = DEFAULT_COALESCE_MS, minIntervalMs = 0 } = options;
  const catchUpWorkspaceId = options.catchUp?.workspaceId ?? null;

  // What the subscription is, rather than which array described it: the effect
  // re-runs when a table, a filter or a key changes, and not when a caller
  // rebuilds the same list on a render.
  const signature = JSON.stringify(bindings.map((b) => [b.table, b.filter ?? null, b.keys, b.insertsOnly ?? false]));
  // The subscription outlives renders; the checks it runs are always this render's.
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    if (!channel || providerKind !== "supabase" || bindings.length === 0) return;

    // The bindings are part of the topic, not just of the name the caller chose:
    // the same name with different listeners has to be a different channel, or
    // the first one to open wins and the second is silently wrong.
    const topic = `${channel}#${digest(signature)}`;
    const shared = open.get(topic);
    if (shared) {
      shared.refs += 1;
      if (shared.closing) {
        clearTimeout(shared.closing);
        shared.closing = null;
      }
      return () => release(topic);
    }

    const supabase = getSupabaseClient();
    // Keyed by the serialised query key so the same key queued twice is read once.
    const pending = new Map<string, readonly unknown[]>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRead = 0;
    // The first `SUBSCRIBED` is the subscription opening; a later one is it
    // coming back, and the gap in between is events nobody heard.
    let everSubscribed = false;
    // Set while a re-read waits for this browser's own saves to land (write-holds).
    let awaitingRelease: (() => void) | null = null;
    let closed = false;

    const flush = () => {
      timer = null;
      lastRead = Date.now();
      // A query with saves still on their way is read once they have landed:
      // read now, the server's copy would paint over the edits not yet saved.
      for (const [id, key] of [...pending.entries()]) {
        if (isQueryHeld(key)) continue;
        pending.delete(id);
        void queryClient.invalidateQueries({ queryKey: key });
      }
      if (pending.size === 0 || awaitingRelease) return;
      awaitingRelease = onHoldReleased(() => {
        if ([...pending.values()].some(isQueryHeld)) return;
        awaitingRelease?.();
        awaitingRelease = null;
        if (!timer && pending.size) timer = setTimeout(flush, coalesceMs);
      });
    };

    const schedule = (keys: ReadonlyArray<readonly unknown[]>) => {
      for (const key of keys) pending.set(JSON.stringify(key), key);
      // Deliberately not restarted per event: an import emits one every second
      // or so, and a timer that began again each time would never reach the end
      // of the burst and never read at all.
      if (timer) return;
      const wait = Math.max(coalesceMs, minIntervalMs > 0 ? lastRead + minIntervalMs - Date.now() : 0);
      timer = setTimeout(flush, wait);
    };

    openings += 1;
    const subscription = supabase.channel(`${topic}~${openings}`);
    // Tables whose deletions a filter would hide, and everything those
    // bindings wanted refreshed. See the DELETE listener below.
    const deletes = new Map<string, Map<string, readonly unknown[]>>();
    const accepted = (index: number, payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
      const accept = latest.current[index]?.accept;
      if (!accept || payload.eventType === "DELETE") return true;
      const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
      return !row || accept(row);
    };
    for (const [index, binding] of bindings.entries()) {
      const { keys } = binding;
      if (binding.insertsOnly) {
        const on = binding.filter ? { event: "INSERT" as const, schema: "public", table: binding.table, filter: binding.filter } : { event: "INSERT" as const, schema: "public", table: binding.table };
        subscription.on("postgres_changes", on, (payload) => {
          if (accepted(index, payload)) schedule(keys);
        });
      } else if (binding.filter) {
        subscription.on("postgres_changes", { event: "*", schema: "public", table: binding.table, filter: binding.filter }, (payload) => {
          if (accepted(index, payload)) schedule(keys);
        });
        const merged = deletes.get(binding.table) ?? new Map<string, readonly unknown[]>();
        for (const key of keys) merged.set(JSON.stringify(key), key);
        deletes.set(binding.table, merged);
      } else {
        subscription.on("postgres_changes", { event: "*", schema: "public", table: binding.table }, (payload) => {
          if (accepted(index, payload)) schedule(keys);
        });
      }
    }

    // A deletion arrives as its primary key and nothing else: with RLS on,
    // Postgres has no old row to hand Realtime, so `board_id=eq.…` matches
    // nothing and the event is dropped. A board therefore never heard that
    // somebody deleted a row on it — the one change that leaves a gap on screen
    // if it is missed.
    //
    // So every filtered binding gets a second listener for deletions alone,
    // without the filter. The cost is that deleting a row on one board refetches
    // another, which is rare enough not to matter. The alternative, `replica
    // identity full`, would make the filter work by putting the whole deleted
    // row on the wire — and deletions are not filtered by RLS, so that row would
    // reach every subscriber to the table, private boards included.
    for (const [table, merged] of deletes) {
      const keys = [...merged.values()];
      subscription.on("postgres_changes", { event: "DELETE", schema: "public", table }, () => schedule(keys));
    }
    // The data on screen was read before this channel was listening; anything
    // committed in between would otherwise wait for the next change to show.
    const catchUp = async () => {
      const listening = Date.now();
      const cache = queryClient.getQueryCache();
      // Read (or being read) before the channel was up: the oldest such read.
      const readBefore = (key: readonly unknown[]) => {
        let oldest: number | null = null;
        for (const query of cache.findAll({ queryKey: key })) {
          const { dataUpdatedAt, fetchStatus } = query.state;
          if (fetchStatus === "fetching") oldest = Math.min(oldest ?? listening, listening);
          else if (dataUpdatedAt > 0 && dataUpdatedAt <= listening) oldest = Math.min(oldest ?? dataUpdatedAt, dataUpdatedAt);
        }
        return oldest;
      };
      const refetch = new Map<string, readonly unknown[]>();
      const probe = new Map<string, readonly unknown[]>();
      let oldest = listening;
      for (const binding of latest.current) {
        const mode = binding.catchUp ?? (catchUpWorkspaceId ? "probe" : "refetch");
        if (mode === "none") continue;
        for (const key of binding.keys) {
          const at = readBefore(key);
          if (at === null) continue;
          if (mode === "probe" && catchUpWorkspaceId) {
            probe.set(JSON.stringify(key), key);
            oldest = Math.min(oldest, at);
          } else refetch.set(JSON.stringify(key), key);
        }
      }
      if (refetch.size) schedule([...refetch.values()]);
      if (!probe.size || !catchUpWorkspaceId) return;
      const seconds = (Date.now() - oldest) / 1000 + CATCH_UP_MARGIN_S;
      const { data, error } = await supabase.rpc("workspace_changed_within", { p_workspace_id: catchUpWorkspaceId, p_seconds: seconds });
      // Not sure is read again: a missed change costs more than one read.
      if (closed) return;
      if (error || data === true) schedule([...probe.values()]);
    };

    // `SUBSCRIBED` is the channel joining; the database feed behind it starts a
    // moment later, and says so in a system message. A change committed in
    // between reaches nobody (seen with a board just opened: a rename a second
    // after the board drew never arrived), so the catch-up waits for that
    // message, or for CATCH_UP_FALLBACK_MS when it does not come, and runs again
    // if it comes after all.
    let fallback: ReturnType<typeof setTimeout> | null = null;
    let caughtUpOnReady = false;
    subscription.on("system", {}, (payload: { extension?: string; status?: string }) => {
      if (payload?.extension !== "postgres_changes" || caughtUpOnReady || closed) return;
      caughtUpOnReady = true;
      if (fallback) clearTimeout(fallback);
      fallback = null;
      void catchUp();
    });

    subscription.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (!everSubscribed) {
        everSubscribed = true;
        if (!caughtUpOnReady) {
          fallback = setTimeout(() => {
            fallback = null;
            if (!closed) void catchUp();
          }, CATCH_UP_FALLBACK_MS);
        }
        return;
      }
      // Back after a drop — a laptop lid, a lost network, a sleeping tab. Read
      // everything this channel covers rather than trusting a stream that was
      // not running.
      schedule(bindings.flatMap((binding) => binding.keys));
    });

    open.set(topic, {
      topic,
      refs: 1,
      closing: null,
      close: () => {
        closed = true;
        if (timer) clearTimeout(timer);
        if (fallback) clearTimeout(fallback);
        awaitingRelease?.();
        awaitingRelease = null;
        pending.clear();
        void supabase.removeChannel(subscription);
      },
    });
    return () => release(topic);
    // `signature` stands in for `bindings`: same tables, same filters, same keys, same subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, providerKind, queryClient, signature, coalesceMs, minIntervalMs, catchUpWorkspaceId]);
}

/**
 * One caller has gone. Closing waits a tick: React unmounts and remounts an
 * effect on the spot in development, and a page that swaps one row component
 * for another does the same — tearing the socket down and building it again in
 * between is churn nobody asked for, and `removeChannel` is asynchronous enough
 * that the rebuild can collide with it.
 */
function release(topic: string): void {
  const shared = open.get(topic);
  if (!shared) return;
  shared.refs -= 1;
  if (shared.refs > 0 || shared.closing) return;
  shared.closing = setTimeout(() => {
    open.delete(topic);
    shared.close();
  }, 0);
}

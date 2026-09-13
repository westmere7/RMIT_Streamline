"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useDataContext } from "@/features/data/data-context";
import { getSupabaseClient } from "@/lib/supabase/client";

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
}

const DEFAULT_COALESCE_MS = 400;

/**
 * Subscribes while `channel` is non-null and the provider is Supabase.
 *
 * `bindings` may be rebuilt on every render — the subscription is keyed by what
 * it describes, not by the identity of the array.
 */
export function useRealtime(channel: string | null, bindings: readonly RealtimeBinding[], options: RealtimeOptions = {}): void {
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  const { coalesceMs = DEFAULT_COALESCE_MS, minIntervalMs = 0 } = options;

  // What the subscription is, rather than which array described it: the effect
  // re-runs when a table, a filter or a key changes, and not when a caller
  // rebuilds the same list on a render.
  const signature = JSON.stringify(bindings.map((b) => [b.table, b.filter ?? null, b.keys]));

  useEffect(() => {
    if (!channel || providerKind !== "supabase" || bindings.length === 0) return;

    const supabase = getSupabaseClient();
    // Keyed by the serialised query key so the same key queued twice is read once.
    const pending = new Map<string, readonly unknown[]>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRead = 0;
    // The first `SUBSCRIBED` is the subscription opening; a later one is it
    // coming back, and the gap in between is events nobody heard.
    let everSubscribed = false;

    const flush = () => {
      timer = null;
      lastRead = Date.now();
      const keys = [...pending.values()];
      pending.clear();
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
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

    const subscription = supabase.channel(channel);
    // Tables whose deletions a filter would hide, and everything those
    // bindings wanted refreshed. See the DELETE listener below.
    const deletes = new Map<string, Map<string, readonly unknown[]>>();
    for (const binding of bindings) {
      const { keys } = binding;
      if (binding.filter) {
        subscription.on("postgres_changes", { event: "*", schema: "public", table: binding.table, filter: binding.filter }, () => schedule(keys));
        const merged = deletes.get(binding.table) ?? new Map<string, readonly unknown[]>();
        for (const key of keys) merged.set(JSON.stringify(key), key);
        deletes.set(binding.table, merged);
      } else {
        subscription.on("postgres_changes", { event: "*", schema: "public", table: binding.table }, () => schedule(keys));
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
    subscription.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (!everSubscribed) {
        everSubscribed = true;
        return;
      }
      // Back after a drop — a laptop lid, a lost network, a sleeping tab. Read
      // everything this channel covers rather than trusting a stream that was
      // not running.
      schedule(bindings.flatMap((binding) => binding.keys));
    });

    return () => {
      if (timer) clearTimeout(timer);
      pending.clear();
      void supabase.removeChannel(subscription);
    };
    // `signature` stands in for `bindings`: same tables, same filters, same keys, same subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, providerKind, queryClient, signature, coalesceMs, minIntervalMs]);
}

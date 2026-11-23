"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { holdQuery } from "@/lib/query/write-holds";
import { beginUnsavedWork, onLeaving } from "@/lib/unsaved-work";

export interface BatchedWritesOptions<T> {
  /** The query the writes change: held (write-holds) from the first write until the last has landed. */
  queryKey: readonly unknown[];
  /** How long a write waits for more before the batch goes. */
  delayMs: number;
  /** The longest the first write of a long run waits. */
  maxWaitMs?: number;
  /** A later write to the same thing folded into the one waiting. */
  merge: (earlier: T, later: T) => T;
  /** Saves one write. */
  send: (id: string, write: T) => Promise<unknown>;
  /** Once nothing is waiting or on its way: the moment to read back, once. `failed` counts writes that did not save. */
  onDrained: (failed: number) => void;
}

export interface BatchedWrites<T> {
  /** Queues a write for `id` (folded into one already waiting for it). Show it on screen yourself first. */
  enqueue: (id: string, write: T) => void;
  /** True while anything is waiting or on its way. */
  busy: () => boolean;
}

/**
 * Quick, repeated edits saved in batches: each change is shown at once by the
 * caller, writes to the same thing are folded together, and the batch goes
 * once the edits pause, its saves one after another. While any write is waiting or on the wire the query is
 * held, so a realtime re-read cannot paint the server's older copy over them,
 * and leaving the page warns. When everything has landed, `onDrained` runs
 * once — one read back for the whole burst rather than one per click.
 */
export function useBatchedWrites<T>(options: BatchedWritesOptions<T>): BatchedWrites<T> {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  // The getter is called from timers and promise callbacks, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [writes] = useState(() => createBatchedWrites(() => latest.current));
  // Leaving the screen sends what is waiting rather than dropping it.
  useEffect(() => () => writes.flushNow(), [writes]);
  return writes;
}

function createBatchedWrites<T>(options: () => BatchedWritesOptions<T>): BatchedWrites<T> & { flushNow: () => void } {
  const queue = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstAt: number | null = null;
  let inflight = 0;
  let failed = 0;
  let guard: { release: () => void; settled: () => void; leaving: () => void } | null = null;
  /** The last save queued: the next one starts when it has finished. */
  let tail: Promise<unknown> = Promise.resolve();

  const done = () => {
    if (inflight > 0 || timer || queue.size > 0) return;
    const held = guard;
    guard = null;
    const count = failed;
    failed = 0;
    held?.release();
    held?.settled();
    held?.leaving();
    options().onDrained(count);
  };

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstAt = null;
    const batch = [...queue.entries()];
    queue.clear();
    // One after another, never side by side: saves to things that share a
    // parent (the lines of one task, the boxes of one update) each rework that
    // parent, and two at once can land in the wrong order and leave it stale.
    for (const [id, write] of batch) {
      inflight += 1;
      tail = tail
        .then(() => options().send(id, write))
        .catch((error) => {
          failed += 1;
          console.error("[batched-writes] a write did not save", error);
        })
        .finally(() => {
          inflight -= 1;
          done();
        });
    }
    done();
  };

  return {
    enqueue: (id, write) => {
      const { queryKey, merge, delayMs, maxWaitMs = delayMs * 5 } = options();
      const waiting = queue.get(id);
      queue.set(id, waiting === undefined ? write : merge(waiting, write));
      // Sent at once rather than after the pause if the page is closed, reloaded or hidden.
      guard ??= { release: holdQuery(queryKey), settled: beginUnsavedWork(), leaving: onLeaving(() => timer && flush()) };
      const now = Date.now();
      firstAt ??= now;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, Math.max(0, Math.min(delayMs, firstAt + maxWaitMs - now)));
    },
    busy: () => inflight > 0 || timer !== null || queue.size > 0,
    flushNow: () => {
      if (timer) flush();
    },
  };
}

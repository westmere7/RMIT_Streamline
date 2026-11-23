import type { MutationCache } from "@tanstack/react-query";
import { holdQuery } from "@/lib/query/write-holds";

/**
 * Guards the gap between "the screen says it is saved" and "the database has it".
 *
 * Every write in the app is optimistic: the cell, row or sheet updates at once
 * and the repository call finishes a moment later — a network round trip against
 * Supabase, plus the pause the quick edits wait out to be saved together (a
 * board cell 0.4 s, asset lines and checklist ticks 0.6 s, sheets 2 s, docs
 * 0.8 s). Reloading or closing the tab inside that window cancels the request
 * and the change is gone with no trace, which is the one kind of data loss a
 * work tracker cannot afford.
 *
 * So while any write is waiting or in flight the browser asks before leaving:
 * the batched editors hold this guard from the first edit to the last save, and
 * guardMutations covers every other save (each TanStack mutation). The window
 * is a few seconds at most, so in practice the prompt only appears when it is
 * about to save someone's work.
 */

let inFlight = 0;
let listening = false;

/** Saves waiting out a pause, asked to go at once when the page is leaving. */
const flushers = new Set<() => void>();

/** The page is going (closed, reloaded, navigated away) or hidden (another tab, a phone's home screen). */
function leaving() {
  for (const flush of [...flushers]) flush();
}

function onHidden() {
  if (document.visibilityState === "hidden") leaving();
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  // Whatever is waiting out its pause is sent now: it may still land if the
  // person leaves anyway, and it is on its way while they read the question.
  leaving();
  if (inFlight <= 0) return;
  // Browsers show their own wording; preventDefault is what asks the question.
  event.preventDefault();
  event.returnValue = "";
}

function listen() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("pagehide", leaving);
  document.addEventListener("visibilitychange", onHidden);
  listening = true;
}

function stopListening() {
  if (!listening || typeof window === "undefined") return;
  window.removeEventListener("beforeunload", onBeforeUnload);
  window.removeEventListener("pagehide", leaving);
  document.removeEventListener("visibilitychange", onHidden);
  listening = false;
}

/**
 * Registers a save that is waiting out a pause: `flush` sends it at once if
 * the page is closed, reloaded or hidden first. Returns the unregister.
 */
export function onLeaving(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

/** Resolves after `ms`, or at once if the page starts to leave first. */
export function pauseUnlessLeaving(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      off();
      resolve();
    };
    const timer = setTimeout(done, ms);
    const off = onLeaving(done);
  });
}

/**
 * Marks a write as started. Call the returned function when it settles — in a
 * `finally`, so a failed write does not leave the guard armed. Calling it twice
 * is harmless.
 */
export function beginUnsavedWork(): () => void {
  inFlight += 1;
  listen();
  let settled = false;
  return () => {
    if (settled) return;
    settled = true;
    inFlight = Math.max(0, inFlight - 1);
    if (inFlight === 0) stopListening();
  };
}

/** True while at least one write has not reached the database yet. */
export function hasUnsavedWork(): boolean {
  return inFlight > 0;
}

/** Test seam: forget any leaked counts between cases. */
export function resetUnsavedWork(): void {
  inFlight = 0;
  stopListening();
}

/**
 * Holds the guard for every mutation while it runs: posting an update, a
 * reaction, a follow — any save that is not one of the batched editors. A
 * mutation that names a query in `meta.holdQuery` (quickSave) also holds that
 * query for as long, so realtime re-reads of it wait until it has landed.
 */
export function guardMutations(cache: MutationCache): () => void {
  const running = new WeakMap<object, () => void>();
  return cache.subscribe((event) => {
    const mutation = event.mutation;
    if (!mutation) return;
    const pending = event.type !== "removed" && mutation.state.status === "pending";
    const held = running.get(mutation);
    if (pending && !held) {
      const settled = beginUnsavedWork();
      const key = (mutation.options.meta as { holdQuery?: readonly unknown[] } | undefined)?.holdQuery;
      const release = key ? holdQuery(key) : null;
      running.set(mutation, () => {
        settled();
        release?.();
      });
    }
    else if (!pending && held) {
      held();
      running.delete(mutation);
    }
  });
}

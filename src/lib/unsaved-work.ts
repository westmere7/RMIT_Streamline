/**
 * Guards the gap between "the screen says it is saved" and "the database has it".
 *
 * Every write in the app is optimistic: the cell, row or sheet updates at once
 * and the repository call finishes a moment later — a network round trip against
 * Supabase, and up to a second for the tracker editor, which waits for typing to
 * stop before it saves. Reloading or closing the tab inside that window cancels
 * the request and the change is gone with no trace, which is the one kind of data
 * loss a work tracker cannot afford.
 *
 * So while any write is in flight the browser asks before leaving. The window is
 * sub-second, so in practice the prompt only appears when it is about to save
 * someone's work.
 */

let inFlight = 0;
let listening = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (inFlight <= 0) return;
  // Browsers show their own wording; preventDefault is what asks the question.
  event.preventDefault();
  event.returnValue = "";
}

function listen() {
  if (listening || typeof window === "undefined") return;
  window.addEventListener("beforeunload", onBeforeUnload);
  listening = true;
}

function stopListening() {
  if (!listening || typeof window === "undefined") return;
  window.removeEventListener("beforeunload", onBeforeUnload);
  listening = false;
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

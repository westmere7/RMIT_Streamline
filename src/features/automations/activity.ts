import type { EntityId } from "@/domain";

/**
 * How long a board stays lit after its queue empties.
 *
 * A nudge drains the queue in about a second, and an indicator that appears
 * and vanishes inside a frame is one nobody saw. Each board is shown as busy
 * for at least this long after it first appeared, however quickly its rows
 * were processed. Long enough to register, short enough not to lie.
 */
export const AUTOMATION_ACTIVITY_HOLD_MS = 1_500;

/** Boards shown as busy, by when each was first seen with something pending. */
export type BusySince = ReadonlyMap<EntityId, number>;

export const NO_BUSY_BOARDS: BusySince = new Map();

/**
 * The next held set, given what the queue says now.
 *
 * Boards still pending keep their original timestamp. Boards that have gone
 * quiet stay until their hold runs out, and `recheckIn` says how long until
 * the earliest of those should be looked at again — null when nothing is
 * waiting to be let go. Returns `previous` itself when nothing changed, so a
 * caller holding it in React state does not re-render for the same answer.
 */
export function reconcileBusy(previous: BusySince, pending: readonly EntityId[], now: number, holdMs = AUTOMATION_ACTIVITY_HOLD_MS): { next: BusySince; recheckIn: number | null } {
  const next = new Map<EntityId, number>();
  let recheckIn: number | null = null;
  for (const id of pending) next.set(id, previous.get(id) ?? now);
  for (const [id, since] of previous) {
    if (next.has(id)) continue;
    const remaining = since + holdMs - now;
    if (remaining <= 0) continue;
    next.set(id, since);
    recheckIn = recheckIn === null ? remaining : Math.min(recheckIn, remaining);
  }
  return { next: sameBusy(previous, next) ? previous : next, recheckIn };
}

function sameBusy(a: BusySince, b: BusySince): boolean {
  if (a.size !== b.size) return false;
  for (const [id, since] of a) if (b.get(id) !== since) return false;
  return true;
}

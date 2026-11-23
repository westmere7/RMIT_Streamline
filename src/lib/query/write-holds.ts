/**
 * Queries with saves still on their way.
 *
 * Every quick edit is shown at once and saved after. A realtime event (often
 * just the echo of the first save in a burst) re-reads the query, and if that
 * read lands while later saves are still waiting or on the wire, it paints the
 * server's older copy over them: a tick that undoes itself for a second, a
 * deleted value that comes back. A query is held from the first edit until
 * its last save has landed; realtime re-reads of it wait (useRealtime) and
 * happen once, after.
 *
 * Keys match as TanStack prefixes do, both ways: holding ["item-assets", id]
 * also holds back an invalidation of ["item-assets"], and holding
 * ["comments"] holds every comments query.
 */

type Key = readonly unknown[];

const holds = new Map<string, { key: Key; count: number }>();
const listeners = new Set<() => void>();

const part = (value: unknown) => JSON.stringify(value ?? null);

function overlaps(a: Key, b: Key): boolean {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (part(a[i]) !== part(b[i])) return false;
  return true;
}

/** Holds `key` until the returned release is called (once; later calls do nothing). */
export function holdQuery(key: Key): () => void {
  const id = JSON.stringify(key);
  const entry = holds.get(id) ?? { key, count: 0 };
  entry.count += 1;
  holds.set(id, entry);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.count -= 1;
    if (entry.count <= 0) holds.delete(id);
    for (const listener of [...listeners]) listener();
  };
}

/** True while a save holds this key, or any key it covers or is covered by. */
export function isQueryHeld(key: Key): boolean {
  for (const { key: held } of holds.values()) if (overlaps(held, key)) return true;
  return false;
}

/** Called after every release; returns the unsubscribe. */
export function onHoldReleased(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

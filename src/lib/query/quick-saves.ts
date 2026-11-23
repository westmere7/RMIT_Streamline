import type { QueryClient } from "@tanstack/react-query";

type Key = readonly unknown[];

/**
 * Options for an optimistic save that people make in quick succession on one
 * list: a star, a reaction, a pin, a notification marked read, a line added.
 *
 * - `scope`: saves on the same list run one after another. Two quick clicks
 *   on one thing (star, unstar) would otherwise race, and the server could
 *   end on the first while the screen shows the second.
 * - `meta.holdQuery`: the list is held while any of them is waiting or on the
 *   wire (guardMutations → write-holds), so a realtime re-read waits rather
 *   than painting the server's older copy over the clicks still saving.
 * - `mutationKey`: what lastSave counts.
 *
 * Pair with lastSave: read back, or roll a failure back, only from the last
 * save still running.
 */
export function quickSave(key: Key) {
  return { mutationKey: [...key], scope: { id: JSON.stringify(key) }, meta: { holdQuery: key } };
}

/**
 * True for the last save on `key` still running (it counts itself while its
 * own callbacks run). Earlier ones skip the read back, which would show the
 * server without the saves behind them, and skip restoring their snapshot on
 * failure, which would undo those saves as well: the last one's read back
 * puts the server's truth on screen instead.
 */
export function lastSave(queryClient: QueryClient, key: Key): boolean {
  return queryClient.isMutating({ mutationKey: [...key] }) <= 1;
}

/** True while any save on `key` is waiting or running. */
export function savesPending(queryClient: QueryClient, key: Key): boolean {
  return queryClient.isMutating({ mutationKey: [...key] }) > 0;
}

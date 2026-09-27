import type { ActivityMetadata } from "@/domain";

/**
 * Rework in the demo history: some finished work goes back once on its way.
 *
 * The generated history walks nearly every task straight from In Progress to
 * Done, so the dashboard's Sent back read close to nothing. This picks a share
 * of the finished tasks and slips a return into the stretch before their final
 * Done — sent back from review, or reopened after being marked done — without
 * moving that Done, so when the work finished (and every figure built on it)
 * stays where it was.
 *
 * Used by the local seed over its own history and by `db:seed:rework` over a
 * live workspace's. Which tasks is decided by a hash of the item id, and a task
 * that already went back is left alone, so a second run adds nothing.
 */

/** One recorded change of status, as both callers can supply it. */
export interface HistoryChange {
  itemId: string;
  boardId: string | null;
  workspaceId: string;
  actorId: string;
  at: string;
  metadata: ActivityMetadata;
}

/** A change to add. The caller gives it an id. */
export type ReworkChange = HistoryChange & { eventType: "ITEM_COLUMN_VALUE_UPDATED" };

/** FNV-1a, so the choice of task is the same on every run and in both callers. */
function hashKey(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const DONE = /^done$/i;
const REVIEW = /review|approv|feedback|proof|sign.?off/i;
const MINUTE = 60_000;

/** Whether a task's history already shows it going back. */
function wentBack(changes: HistoryChange[]): boolean {
  return changes.some(({ metadata: { from, to } }) => !!from && !!to && ((DONE.test(from) && !DONE.test(to)) || (REVIEW.test(from) && !DONE.test(to))));
}

/**
 * `createdAt` is when each task was made, for the many that went to Done in a
 * single recorded change: the stretch before it starts there.
 */
export function planRework(history: HistoryChange[], share = 0.45, createdAt: ReadonlyMap<string, string> = new Map()): ReworkChange[] {
  const byItem = new Map<string, HistoryChange[]>();
  for (const change of history) {
    if (change.metadata.columnType !== "STATUS") continue;
    const list = byItem.get(change.itemId) ?? [];
    list.push(change);
    byItem.set(change.itemId, list);
  }
  const added: ReworkChange[] = [];
  for (const [itemId, list] of byItem) {
    const changes = list.slice().sort((a, b) => a.at.localeCompare(b.at));
    const done = changes.at(-1)!;
    const since = changes.at(-2)?.at ?? createdAt.get(itemId);
    // Finished work only, with a stretch of work before the Done to put the return in.
    if (!since || !done.metadata.to || !DONE.test(done.metadata.to)) continue;
    const working = done.metadata.from;
    if (!working || /not started/i.test(working) || DONE.test(working) || wentBack(changes)) continue;
    const pick = hashKey(`rework:${itemId}`);
    if (pick % 1000 >= share * 1000) continue;
    const start = Date.parse(since);
    const end = Date.parse(done.at);
    // Room for two changes in order; the figures read the order, not the gaps.
    if (end - start < 10 * MINUTE) continue;
    // A third reopened after a Done that did not hold, the rest sent back from review.
    const reopened = (pick >>> 10) % 3 === 0;
    const middle = reopened ? "Done" : "In Review";
    const at = (fraction: number) => new Date(start + (end - start) * fraction).toISOString();
    const step = (when: string, from: string, to: string): ReworkChange => ({
      eventType: "ITEM_COLUMN_VALUE_UPDATED",
      itemId,
      boardId: done.boardId,
      workspaceId: done.workspaceId,
      actorId: done.actorId,
      at: when,
      metadata: { itemName: done.metadata.itemName, columnName: done.metadata.columnName, columnType: "STATUS", from, to },
    });
    added.push(step(at(0.45), working, middle), step(at(0.7), middle, working));
  }
  return added;
}

import { threadPinOf, type Activity, type Comment } from "@/domain";

/** One entry of the pop-up's feed: an update (with its replies elsewhere) or a line of the task's history. */
export type FeedEntry = { kind: "update"; comment: Comment } | { kind: "log"; activity: Activity };

/**
 * The pop-up's one feed: what was said and what was done, together.
 *
 * `updates` come in the Updates tab's order (orderUpdates: pinned conversations
 * first, then newest first). The pinned ones stay on top; the rest and the
 * history lines are woven together, newest first. An "update posted" line is
 * left out, as the update itself is there.
 */
export function mergeFeed(updates: readonly Comment[], repliesTo: ReadonlyMap<string, readonly Comment[]>, log: readonly Activity[]): FeedEntry[] {
  const pinnedIds = new Set(updates.filter((u) => threadPinOf(u, [...(repliesTo.get(u.id) ?? [])])).map((u) => u.id));
  const pinned = updates.filter((u) => pinnedIds.has(u.id));
  const rest = updates.filter((u) => !pinnedIds.has(u.id));
  const lines = log.filter((a) => a.eventType !== "COMMENT_ADDED").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const merged: FeedEntry[] = pinned.map((comment) => ({ kind: "update", comment }));
  let i = 0;
  let j = 0;
  while (i < rest.length || j < lines.length) {
    const update = rest[i];
    const line = lines[j];
    if (update && (!line || update.createdAt >= line.createdAt)) {
      merged.push({ kind: "update", comment: update });
      i++;
    } else if (line) {
      merged.push({ kind: "log", activity: line });
      j++;
    }
  }
  return merged;
}

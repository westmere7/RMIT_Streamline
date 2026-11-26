import type { Activity, Comment } from "@/domain";

/** One entry of the pop-up's feed: an update (with its replies elsewhere) or a line of the task's history. */
export type FeedEntry = { kind: "update"; comment: Comment } | { kind: "log"; activity: Activity };

/** How the feed is laid out: everything by time, or every update above the history. */
export type FeedOrder = "time" | "updatesFirst";

/**
 * The pop-up's one feed: what was said and what was done, together.
 *
 * `updates` come in the Updates tab's order (orderUpdates: pinned conversations
 * first, then newest first). Pinned conversations lead either way, in that
 * order. "time" then weaves the other updates and every history line together
 * by when it happened, newest first; "updatesFirst" keeps the other updates
 * next and the history under them. An "update posted" line is left out: the
 * update itself is there.
 *
 * @param isPinned Whether a conversation is pinned (a pinned reply counts).
 */
export function mergeFeed(updates: readonly Comment[], log: readonly Activity[], order: FeedOrder = "time", isPinned: (update: Comment) => boolean = (u) => u.pin != null): FeedEntry[] {
  const lines = log.filter((a) => a.eventType !== "COMMENT_ADDED").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pinned = updates.filter(isPinned).map((comment): FeedEntry => ({ kind: "update", comment }));
  const unpinned = updates.filter((u) => !isPinned(u));
  if (order === "updatesFirst") return [...pinned, ...unpinned.map((comment): FeedEntry => ({ kind: "update", comment })), ...lines.map((activity): FeedEntry => ({ kind: "log", activity }))];
  const rest = [...unpinned].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const merged: FeedEntry[] = [...pinned];
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

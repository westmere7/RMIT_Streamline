/**
 * Near-real-time updates for local mode.
 *
 * IndexedDB is shared by every tab on this origin but never tells anyone it
 * changed, so a tab that writes announces the change on a BroadcastChannel and
 * the other tabs refetch. This is what a Supabase realtime subscription will
 * replace: the payload shape mirrors what `postgres_changes` filters give us
 * (which boards and items were touched) so the listener code stays the same.
 */

export interface DataChange {
  /** Boards whose snapshot may have changed (linked items make this several). */
  boardIds?: string[];
  /** Items whose panel data (links, comments, activity) may have changed. */
  itemIds?: string[];
  /** Coarse kinds so listeners can skip refetches they do not care about. */
  kinds: Array<"board" | "items" | "links" | "comments" | "messages" | "workspace" | "trackers">;
}

const CHANNEL_NAME = "streamline.data-changes";

/** Random per-tab id so a tab ignores its own announcements. */
const TAB_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

interface Envelope {
  from: string;
  change: DataChange;
}

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/** Tell other tabs that data changed. Safe to call anywhere; a no-op without BroadcastChannel. */
export function publishDataChange(change: DataChange): void {
  const ch = getChannel();
  if (!ch) return;
  const envelope: Envelope = { from: TAB_ID, change };
  ch.postMessage(envelope);
}

/** Runs `onChange` for announcements from other tabs. Returns an unsubscribe function. */
export function subscribeDataChanges(onChange: (change: DataChange) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => undefined;
  const handler = (event: MessageEvent<Envelope>) => {
    if (!event.data || event.data.from === TAB_ID) return;
    onChange(event.data.change);
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}

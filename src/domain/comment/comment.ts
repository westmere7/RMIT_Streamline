import type { EntityId, Timestamps } from "@/domain/common/types";

export interface Comment extends Timestamps {
  id: EntityId;
  itemId: EntityId;
  authorId: EntityId;
  body: string;
  /** User ids mentioned with @ in the body. */
  mentionUserIds: EntityId[];
  /**
   * Set when the same update was posted to linked items in one action: every
   * copy carries the same id. It is what lets an edit reach the others, and what
   * the badge on an update reads to say it lives on more than one task.
   */
  sharedId: EntityId | null;
  /**
   * The update this one replies to; null for an update of its own. Replies are
   * one level deep: this always names a top-level update.
   */
  parentId?: EntityId | null;
  /** Who reacted with what, oldest first. Absent where a store has none to give. */
  reactions?: CommentReaction[];
  /** The checklist boxes ticked in this update, by key (see checklistKey). Absent where a store has none to give. */
  checks?: CommentCheck[];
  /** Pinned to the top of the task's updates, and maybe to its overview (0150). Absent or null when not pinned. */
  pin?: CommentPin | null;
}

/**
 * A pinned update. Anyone who can edit the task pins it; `overview` puts it
 * above the task's description as well, and a task has at most one of those.
 */
export interface CommentPin {
  overview: boolean;
  pinnedBy: EntityId | null;
  pinnedAt: string;
}

/** Where an update is pinned: not at all, at the top of the updates, or on the overview too. */
export type CommentPinState = "none" | "pinned" | "overview";

/** The state an update's pin is in. */
export function pinStateOf(comment: Pick<Comment, "pin">): CommentPinState {
  return !comment.pin ? "none" : comment.pin.overview ? "overview" : "pinned";
}

/** The task's overview pin, if one of these updates or replies is it. */
export function overviewPinOf<T extends Pick<Comment, "pin">>(comments: readonly T[]): T | null {
  return comments.find((c) => c.pin?.overview) ?? null;
}

/**
 * The pin a conversation is ordered by: its update's own, or the strongest of
 * its replies' (a reply pinned to the overview outranks a plain pin), so a
 * pinned reply lifts its conversation to the top.
 */
export function threadPinOf(update: Pick<Comment, "pin">, replies: readonly Pick<Comment, "pin">[] = []): CommentPin | null {
  const pins = [update.pin, ...replies.map((r) => r.pin)].filter((p): p is CommentPin => !!p);
  return pins.find((p) => p.overview) ?? pins.sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt))[0] ?? null;
}

/**
 * The updates of a task in the order the Updates tab shows them: pinned ones
 * first (the overview pin, then the latest pinned), then the rest newest first.
 * `pinOf` says which pin a conversation counts by (see threadPinOf).
 */
export function orderUpdates<T extends Pick<Comment, "pin" | "createdAt">>(updates: readonly T[], pinOf: (update: T) => CommentPin | null | undefined = (u) => u.pin): T[] {
  const rank = (c: T) => (pinOf(c)?.overview ? 0 : pinOf(c) ? 1 : 2);
  return [...updates].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? pinOf(b)!.pinnedAt.localeCompare(pinOf(a)!.pinnedAt) : 0) || b.createdAt.localeCompare(a.createdAt));
}

/** One ticked box of a checklist in an update. No entry means not ticked. */
export interface CommentCheck {
  key: string;
  /** Who ticked it; null once that person has been removed. */
  userId: EntityId | null;
  checkedAt: string;
}

/** Ticks or unticks one box, keeping the rest. Ticking a ticked box keeps who ticked it first. */
export function withCheck(checks: readonly CommentCheck[] | undefined, key: string, userId: EntityId, on: boolean, at: string): CommentCheck[] {
  const rest = (checks ?? []).filter((c) => c.key !== key);
  const existing = (checks ?? []).find((c) => c.key === key);
  return on ? [...rest, existing ?? { key, userId, checkedAt: at }] : rest;
}

/** One person's reaction to an update or a reply. A person gives each emoji at most once. */
export interface CommentReaction {
  userId: EntityId;
  emoji: string;
  createdAt: string;
}

/**
 * The reactions on offer. A fixed set rather than a full picker: the point is
 * a quick acknowledgement, and two rows of these say most of what one is for.
 */
export const COMMENT_REACTIONS = ["👍", "👎", "❤️", "🎉", "😄", "😂", "😮", "😢", "😡", "🤔", "👀", "🙏", "👏", "🔥", "🚀", "✅"] as const;

/** Adds or takes away one person's emoji, keeping the rest in the order they came. */
export function withReaction(reactions: readonly CommentReaction[] | undefined, userId: EntityId, emoji: string, on: boolean, at: string): CommentReaction[] {
  const rest = (reactions ?? []).filter((r) => !(r.userId === userId && r.emoji === emoji));
  return on ? [...rest, { userId, emoji, createdAt: at }] : rest;
}

/** The reactions as chips: each emoji once, with who gave it, in the order each emoji first appeared. */
export function groupReactions(reactions: readonly CommentReaction[] | undefined): Array<{ emoji: string; userIds: EntityId[] }> {
  const groups = new Map<string, EntityId[]>();
  for (const r of [...(reactions ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.userId]);
  return [...groups].map(([emoji, userIds]) => ({ emoji, userIds }));
}

export type CommentInput = Pick<Comment, "itemId" | "authorId" | "body" | "mentionUserIds"> & { sharedId?: EntityId | null; parentId?: EntityId | null };

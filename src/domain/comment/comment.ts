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
}

/** One person's reaction to an update or a reply. A person gives each emoji at most once. */
export interface CommentReaction {
  userId: EntityId;
  emoji: string;
  createdAt: string;
}

/**
 * The reactions on offer. A short fixed set rather than a full picker: the
 * point is a quick acknowledgement, and six are enough to say most of them.
 */
export const COMMENT_REACTIONS = ["👍", "❤️", "🎉", "😄", "👀", "🙏"] as const;

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

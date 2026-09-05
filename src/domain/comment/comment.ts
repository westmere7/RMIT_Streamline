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
}

export type CommentInput = Pick<Comment, "itemId" | "authorId" | "body" | "mentionUserIds"> & { sharedId?: EntityId | null };

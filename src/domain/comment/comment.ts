import type { EntityId, Timestamps } from "@/domain/common/types";

export interface Comment extends Timestamps {
  id: EntityId;
  itemId: EntityId;
  authorId: EntityId;
  body: string;
  /** User ids mentioned with @ in the body. */
  mentionUserIds: EntityId[];
}

export type CommentInput = Pick<Comment, "itemId" | "authorId" | "body" | "mentionUserIds">;

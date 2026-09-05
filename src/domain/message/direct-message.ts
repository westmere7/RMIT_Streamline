import type { EntityId } from "@/domain/common/types";

/**
 * A one-to-one message between two people in a workspace.
 *
 * There is no conversation row: a thread is every message where the same two
 * people are the sender and the recipient, in either direction. That keeps the
 * permission rule to "you can see a message you sent or received", which is the
 * whole of the RLS policy in supabase/migrations/0005_direct_messages.sql.
 */
export interface DirectMessage {
  id: EntityId;
  workspaceId: EntityId;
  senderId: EntityId;
  recipientId: EntityId;
  body: string;
  /** Set when the recipient opens the thread; always null for the sender's copy. */
  readAt: string | null;
  createdAt: string;
}

export type DirectMessageInput = Pick<DirectMessage, "workspaceId" | "senderId" | "recipientId" | "body">;

/** One row in the message list: who it is with, the latest line, and what is unread. */
export interface DirectThread {
  userId: EntityId;
  lastMessage: DirectMessage;
  unread: number;
}

/** The person on the other end of a message from `userId`'s point of view. */
export function otherPartyOf(message: Pick<DirectMessage, "senderId" | "recipientId">, userId: EntityId): EntityId {
  return message.senderId === userId ? message.recipientId : message.senderId;
}

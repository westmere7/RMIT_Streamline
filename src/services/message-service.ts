import type { DirectMessage, DirectThread, EntityId, User } from "@/domain";
import { otherPartyOf } from "@/domain";
import type { Repositories } from "@/data/repositories";

/** A thread with the person it is with resolved, ready for the message list. */
export interface DirectThreadView extends DirectThread {
  user: User | null;
}

/**
 * One-to-one messaging. There is no conversation row: a thread is every message
 * between the same two people, so the service groups by the other party.
 */
export class MessageService {
  constructor(private readonly repos: Repositories) {}

  /** The people this user has exchanged messages with, most recent first. */
  async listThreads(workspaceId: EntityId, userId: EntityId): Promise<DirectThreadView[]> {
    const messages = await this.repos.messages.listForUser(workspaceId, userId);
    if (messages.length === 0) return [];

    const threads = new Map<EntityId, DirectThread>();
    for (const message of messages) {
      const other = otherPartyOf(message, userId);
      const existing = threads.get(other);
      const unread = message.recipientId === userId && message.readAt === null ? 1 : 0;
      if (!existing) {
        threads.set(other, { userId: other, lastMessage: message, unread });
        continue;
      }
      // listForUser is newest first, so the first one seen is the latest.
      existing.unread += unread;
    }

    const users = await this.repos.users.list();
    const byId = new Map(users.map((u) => [u.id, u]));
    return [...threads.values()]
      .sort((a, b) => b.lastMessage.createdAt.localeCompare(a.lastMessage.createdAt))
      .map((thread) => ({ ...thread, user: byId.get(thread.userId) ?? null }));
  }

  listThread(workspaceId: EntityId, userId: EntityId, otherUserId: EntityId): Promise<DirectMessage[]> {
    return this.repos.messages.listThread(workspaceId, userId, otherUserId);
  }

  /** Total unread messages, for the badge in the sidebar. */
  async unreadCount(workspaceId: EntityId, userId: EntityId): Promise<number> {
    const messages = await this.repos.messages.listForUser(workspaceId, userId);
    return messages.filter((m) => m.recipientId === userId && m.readAt === null).length;
  }

  async send(workspaceId: EntityId, senderId: EntityId, recipientId: EntityId, body: string): Promise<DirectMessage> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Message cannot be empty");
    if (senderId === recipientId) throw new Error("You cannot message yourself");
    return this.repos.messages.create({ workspaceId, senderId, recipientId, body: trimmed });
  }

  markRead(workspaceId: EntityId, userId: EntityId, otherUserId: EntityId): Promise<void> {
    return this.repos.messages.markThreadRead(workspaceId, userId, otherUserId);
  }

  deleteMessage(id: EntityId): Promise<void> {
    return this.repos.messages.delete(id);
  }
}

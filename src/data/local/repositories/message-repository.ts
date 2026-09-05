import type { DirectMessage, DirectMessageInput } from "@/domain";
import type { MessageRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/**
 * Two messages sent in the same millisecond would otherwise sort arbitrarily and
 * the conversation would read out of order. Postgres timestamps have microsecond
 * resolution and never collide; `Date.now()` does, so hand out strictly
 * increasing times here.
 */
let lastIssued = 0;

function nextTimestamp(): string {
  const millis = Math.max(Date.now(), lastIssued + 1);
  lastIssued = millis;
  return new Date(millis).toISOString();
}

/** Direct messages. A thread is both directions between the same two people. */
export class LocalMessageRepository implements MessageRepository {
  constructor(private readonly conn: LocalConnection) {}

  private async messagesFor(workspaceId: string, userId: string): Promise<DirectMessage[]> {
    const db = await this.conn.getDb();
    const [sent, received] = await Promise.all([
      db.getAllFromIndex("directMessages", "bySender", userId),
      db.getAllFromIndex("directMessages", "byRecipient", userId),
    ]);
    const seen = new Map<string, DirectMessage>();
    for (const message of [...sent, ...received]) {
      if (message.workspaceId === workspaceId) seen.set(message.id, message);
    }
    return [...seen.values()];
  }

  async listThread(workspaceId: string, userId: string, otherUserId: string): Promise<DirectMessage[]> {
    const mine = await this.messagesFor(workspaceId, userId);
    return mine
      .filter((m) => m.senderId === otherUserId || m.recipientId === otherUserId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listForUser(workspaceId: string, userId: string): Promise<DirectMessage[]> {
    return (await this.messagesFor(workspaceId, userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: DirectMessageInput): Promise<DirectMessage> {
    const db = await this.conn.getDb();
    const message: DirectMessage = { ...input, id: newId(), readAt: null, createdAt: nextTimestamp() };
    await db.put("directMessages", message);
    return message;
  }

  async markThreadRead(workspaceId: string, userId: string, otherUserId: string): Promise<void> {
    const db = await this.conn.getDb();
    const received = await db.getAllFromIndex("directMessages", "byRecipient", userId);
    const now = nowIso();
    const unread = received.filter((m) => m.workspaceId === workspaceId && m.senderId === otherUserId && m.readAt === null);
    await Promise.all(unread.map((m) => db.put("directMessages", { ...m, readAt: now })));
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("directMessages", id);
  }
}

import type { Subscription, SubscriptionInput } from "@/domain";
import type { SubscriptionRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByUser(userId: string, workspaceId: string): Promise<Subscription[]> {
    const db = await this.conn.getDb();
    return (await db.getAllFromIndex("subscriptions", "byUser", userId)).filter((s) => s.workspaceId === workspaceId);
  }

  async listByBoards(boardIds: string[]): Promise<Subscription[]> {
    const db = await this.conn.getDb();
    return (await Promise.all(boardIds.map((id) => db.getAllFromIndex("subscriptions", "byBoard", id)))).flat();
  }

  async upsert(input: SubscriptionInput): Promise<Subscription> {
    const db = await this.conn.getDb();
    const existing = (await db.getAllFromIndex("subscriptions", "byUser", input.userId)).find((s) => s.boardId === input.boardId && s.itemId === input.itemId);
    const now = nowIso();
    const saved: Subscription = existing ? { ...existing, events: input.events, updatedAt: now } : { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("subscriptions", saved);
    return saved;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("subscriptions", id);
  }
}

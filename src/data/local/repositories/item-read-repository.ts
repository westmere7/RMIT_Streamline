import type { ItemReadRepository } from "@/data/repositories";
import type { LocalConnection } from "../connection";

export class LocalItemReadRepository implements ItemReadRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByUser(userId: string): Promise<Record<string, string>> {
    const db = await this.conn.getDb();
    const reads = await db.getAllFromIndex("itemReads", "byUser", userId);
    return Object.fromEntries(reads.map((r) => [r.itemId, r.seenAt]));
  }

  async markSeen(userId: string, itemId: string, seenAt: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.put("itemReads", { id: `${userId}:${itemId}`, userId, itemId, seenAt });
  }
}

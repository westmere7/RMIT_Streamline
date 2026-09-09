import type { ItemShare, ItemShareInput } from "@/domain";
import type { ItemShareRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/** One share per task, found either by the task it opens or by the token in the link. */
export class LocalItemShareRepository implements ItemShareRepository {
  constructor(private readonly conn: LocalConnection) {}

  async getByItem(itemId: string): Promise<ItemShare | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("itemShares", "byItem", itemId)) ?? null;
  }

  async getByToken(token: string): Promise<ItemShare | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("itemShares", "byToken", token)) ?? null;
  }

  async create(input: ItemShareInput): Promise<ItemShare> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const share: ItemShare = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("itemShares", share);
    return share;
  }

  async update(id: string, patch: Partial<Pick<ItemShare, "token" | "enabled" | "expiresAt" | "passwordHash" | "access">>): Promise<ItemShare> {
    const db = await this.conn.getDb();
    const existing = await db.get("itemShares", id);
    if (!existing) throw new NotFoundError("ItemShare", id);
    const updated: ItemShare = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("itemShares", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("itemShares", id);
  }
}

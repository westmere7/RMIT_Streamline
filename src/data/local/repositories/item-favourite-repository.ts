import type { ItemFavourite } from "@/domain";
import type { ItemFavouriteRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalItemFavouriteRepository implements ItemFavouriteRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByUser(userId: string): Promise<ItemFavourite[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("itemFavourites", "byUser", userId);
  }

  async add(input: Pick<ItemFavourite, "userId" | "itemId" | "boardId">): Promise<ItemFavourite> {
    const db = await this.conn.getDb();
    const existing = (await db.getAllFromIndex("itemFavourites", "byUser", input.userId)).find((f) => f.itemId === input.itemId);
    if (existing) return existing;
    const saved: ItemFavourite = { ...input, id: newId(), createdAt: nowIso() };
    await db.put("itemFavourites", saved);
    return saved;
  }

  async remove(userId: string, itemIds: string[]): Promise<void> {
    const db = await this.conn.getDb();
    const ids = new Set(itemIds);
    for (const favourite of await db.getAllFromIndex("itemFavourites", "byUser", userId)) if (ids.has(favourite.itemId)) await db.delete("itemFavourites", favourite.id);
  }
}

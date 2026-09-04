import type { ItemLink, ItemLinkInput } from "@/domain";
import { normaliseLinkPair } from "@/domain";
import type { ItemLinkRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import type { StreamlineDatabase } from "../database";

/** Every link touching any of the given items, from either side, without duplicates. */
export async function linksTouching(db: StreamlineDatabase, itemIds: string[]): Promise<ItemLink[]> {
  const seen = new Map<string, ItemLink>();
  for (const id of itemIds) {
    const [asA, asB] = await Promise.all([db.getAllFromIndex("itemLinks", "byItemA", id), db.getAllFromIndex("itemLinks", "byItemB", id)]);
    for (const link of [...asA, ...asB]) seen.set(link.id, link);
  }
  return [...seen.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export class LocalItemLinkRepository implements ItemLinkRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByItem(itemId: string): Promise<ItemLink[]> {
    return linksTouching(await this.conn.getDb(), [itemId]);
  }

  async listByItems(itemIds: string[]): Promise<ItemLink[]> {
    if (itemIds.length === 0) return [];
    return linksTouching(await this.conn.getDb(), itemIds);
  }

  async getById(id: string): Promise<ItemLink | null> {
    const db = await this.conn.getDb();
    return (await db.get("itemLinks", id)) ?? null;
  }

  async create(input: ItemLinkInput): Promise<ItemLink> {
    const db = await this.conn.getDb();
    const [itemAId, itemBId] = normaliseLinkPair(input.itemIds[0], input.itemIds[1]);
    const existing = (await db.getAllFromIndex("itemLinks", "byItemA", itemAId)).find((l) => l.itemBId === itemBId);
    if (existing) return existing;
    const link: ItemLink = {
      id: newId(),
      workspaceId: input.workspaceId,
      itemAId,
      itemBId,
      createdBy: input.createdBy,
      createdAt: nowIso(),
    };
    await db.put("itemLinks", link);
    return link;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("itemLinks", id);
  }
}

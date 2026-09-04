import type { ItemLink, ItemLinkInput } from "@/domain";
import { normaliseLinkPair } from "@/domain";
import type { ItemLinkRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import type { StreamlineDatabase } from "../database";

/** Every link touching any of the given items, from either side, without duplicates. */
export async function linksTouching(db: StreamlineDatabase, itemIds: string[]): Promise<ItemLink[]> {
  const seen = new Map<string, ItemLink>();
  for (const id of itemIds) {
    const [asA, asB] = await Promise.all([db.getAllFromIndex("itemLinks", "byItemA", id), db.getAllFromIndex("itemLinks", "byItemB", id)]);
    // Links written before field exclusions existed have no `excluded`; read them as "sync everything".
    for (const link of [...asA, ...asB]) seen.set(link.id, { ...link, excluded: link.excluded ?? [] });
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
    const link = await db.get("itemLinks", id);
    return link ? { ...link, excluded: link.excluded ?? [] } : null;
  }

  async create(input: ItemLinkInput): Promise<ItemLink> {
    const db = await this.conn.getDb();
    const [itemAId, itemBId] = normaliseLinkPair(input.itemIds[0], input.itemIds[1]);
    const existing = (await db.getAllFromIndex("itemLinks", "byItemA", itemAId)).find((l) => l.itemBId === itemBId);
    if (existing) return { ...existing, excluded: existing.excluded ?? [] };
    const link: ItemLink = {
      id: newId(),
      workspaceId: input.workspaceId,
      itemAId,
      itemBId,
      excluded: input.excluded ?? [],
      createdBy: input.createdBy,
      createdAt: nowIso(),
    };
    await db.put("itemLinks", link);
    return link;
  }

  async update(id: string, patch: Partial<Pick<ItemLink, "excluded">>): Promise<ItemLink> {
    const db = await this.conn.getDb();
    const existing = await db.get("itemLinks", id);
    if (!existing) throw new NotFoundError("ItemLink", id);
    const updated: ItemLink = { ...existing, excluded: existing.excluded ?? [], ...patch, id };
    await db.put("itemLinks", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("itemLinks", id);
  }
}

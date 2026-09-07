import type { ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import type { ItemAssetRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

const byPosition = (a: ItemAsset, b: ItemAsset) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);

export class LocalItemAssetRepository implements ItemAssetRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByItem(itemId: string): Promise<ItemAsset[]> {
    const db = await this.conn.getDb();
    return (await db.getAllFromIndex("itemAssets", "byItem", itemId)).sort(byPosition);
  }

  async listByBoard(boardId: string): Promise<ItemAsset[]> {
    const db = await this.conn.getDb();
    return (await db.getAllFromIndex("itemAssets", "byBoard", boardId)).sort(byPosition);
  }

  async create(input: ItemAssetInput): Promise<ItemAsset> {
    const db = await this.conn.getDb();
    // The board is the item's, whatever the caller said — the same rule the database enforces.
    const item = await db.get("items", input.itemId);
    if (!item) throw new NotFoundError("Item", input.itemId);
    const now = nowIso();
    const asset: ItemAsset = {
      id: newId(),
      itemId: input.itemId,
      boardId: item.boardId,
      name: input.name.trim(),
      assetType: input.assetType?.trim() || null,
      quantity: input.quantity ?? null,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      notes: input.notes?.trim() || null,
      position: input.position ?? 0,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await db.put("itemAssets", asset);
    return asset;
  }

  async update(id: string, patch: ItemAssetPatch): Promise<ItemAsset> {
    const db = await this.conn.getDb();
    const existing = await db.get("itemAssets", id);
    if (!existing) throw new NotFoundError("Asset", id);
    const updated: ItemAsset = {
      ...existing,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      assetType: patch.assetType !== undefined ? patch.assetType?.trim() || null : existing.assetType,
      notes: patch.notes !== undefined ? patch.notes?.trim() || null : existing.notes,
      updatedAt: nowIso(),
    };
    await db.put("itemAssets", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("itemAssets", id);
  }
}

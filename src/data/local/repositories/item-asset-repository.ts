import type { ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import type { ItemAssetRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

const byPosition = (a: ItemAsset, b: ItemAsset) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);

/** Rows written before a line could have more than one person in charge. */
function normalize(asset: ItemAsset): ItemAsset {
  if (Array.isArray(asset.assigneeIds)) return asset.completedAt === undefined ? { ...asset, completedAt: null } : asset;
  const legacy = (asset as ItemAsset & { assigneeId?: string | null }).assigneeId;
  return { ...asset, assigneeIds: legacy ? [legacy] : [], completedAt: asset.completedAt ?? null, previewUrl: asset.previewUrl ?? null, artworkUrl: asset.artworkUrl ?? null };
}

export class LocalItemAssetRepository implements ItemAssetRepository {
  constructor(private readonly conn: LocalConnection) {}

  async getById(id: string): Promise<ItemAsset | null> {
    const db = await this.conn.getDb();
    const asset = await db.get("itemAssets", id);
    return asset ? normalize(asset) : null;
  }

  async listByItem(itemId: string): Promise<ItemAsset[]> {
    const db = await this.conn.getDb();
    return (await db.getAllFromIndex("itemAssets", "byItem", itemId)).map(normalize).sort(byPosition);
  }

  async listByBoard(boardId: string): Promise<ItemAsset[]> {
    const db = await this.conn.getDb();
    return (await db.getAllFromIndex("itemAssets", "byBoard", boardId)).map(normalize).sort(byPosition);
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
      assigneeIds: input.assigneeIds ?? [],
      dueDate: input.dueDate ?? null,
      completedAt: null,
      notes: input.notes?.trim() || null,
      previewUrl: input.previewUrl?.trim() || null,
      artworkUrl: input.artworkUrl?.trim() || null,
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
      ...normalize(existing),
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

import type { ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import { legacyAssetLinks, normalizeAssetLinks } from "@/domain";
import type { ItemAssetRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

const byPosition = (a: ItemAsset, b: ItemAsset) => a.position - b.position || a.createdAt.localeCompare(b.createdAt);

/**
 * Rows written by an older build: before a line could have more than one person
 * in charge, and before its links were a list and it could sit in a block.
 */
function normalize(asset: ItemAsset): ItemAsset {
  const stored = asset as ItemAsset & { assigneeId?: string | null; previewUrl?: string | null; artworkUrl?: string | null };
  const legacy = stored.assigneeId;
  const { previewUrl, artworkUrl, ...rest } = stored;
  return {
    ...rest,
    assigneeIds: Array.isArray(asset.assigneeIds) ? asset.assigneeIds : legacy ? [legacy] : [],
    completedAt: asset.completedAt ?? null,
    links: Array.isArray(asset.links) ? normalizeAssetLinks(asset.links) : legacyAssetLinks(previewUrl, artworkUrl),
    blockId: asset.blockId ?? null,
    blockName: asset.blockId ? asset.blockName ?? null : null,
    blockLinks: asset.blockId && Array.isArray(asset.blockLinks) ? normalizeAssetLinks(asset.blockLinks) : [],
    trackerSheetId: asset.trackerSheetId ?? null,
    trackerRowId: asset.trackerRowId ?? null,
  };
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

  async listByItems(itemIds: string[]): Promise<ItemAsset[]> {
    if (itemIds.length === 0) return [];
    const db = await this.conn.getDb();
    const lists = await Promise.all(itemIds.map((id) => db.getAllFromIndex("itemAssets", "byItem", id)));
    return lists.flat().map(normalize).sort(byPosition);
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
    const asset = build(input, item.boardId);
    await db.put("itemAssets", asset);
    return asset;
  }

  async createMany(inputs: ItemAssetInput[]): Promise<ItemAsset[]> {
    if (inputs.length === 0) return [];
    const db = await this.conn.getDb();
    const tx = db.transaction(["items", "itemAssets"], "readwrite");
    const created: ItemAsset[] = [];
    for (const input of inputs) {
      const item = await tx.objectStore("items").get(input.itemId);
      if (!item) throw new NotFoundError("Item", input.itemId);
      created.push(build(input, item.boardId));
    }
    // The pair (sheet, row) is unique, as the database's constraint has it.
    const taken = new Set((await tx.objectStore("itemAssets").getAll()).filter((a) => a.trackerSheetId).map((a) => a.trackerSheetId + ":" + a.trackerRowId));
    for (const asset of created) {
      if (asset.trackerSheetId) {
        const key = asset.trackerSheetId + ":" + asset.trackerRowId;
        if (taken.has(key)) throw new Error("That sheet row already has an asset line");
        taken.add(key);
      }
      await tx.objectStore("itemAssets").put(asset);
    }
    await tx.done;
    return created;
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.conn.getDb();
    const tx = db.transaction("itemAssets", "readwrite");
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  }

  async listBySheet(sheetId: string): Promise<ItemAsset[]> {
    const db = await this.conn.getDb();
    return (await db.getAll("itemAssets")).filter((a) => a.trackerSheetId === sheetId).map(normalize).sort(byPosition);
  }

  async update(id: string, patch: ItemAssetPatch): Promise<ItemAsset> {
    const db = await this.conn.getDb();
    const existing = await db.get("itemAssets", id);
    if (!existing) throw new NotFoundError("Asset", id);
    const base = normalize(existing);
    const updated: ItemAsset = {
      ...base,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : base.name,
      assetType: patch.assetType !== undefined ? patch.assetType?.trim() || null : base.assetType,
      notes: patch.notes !== undefined ? patch.notes?.trim() || null : base.notes,
      links: patch.links !== undefined ? normalizeAssetLinks(patch.links) : base.links,
      blockName: patch.blockName !== undefined ? patch.blockName?.trim() || null : base.blockName,
      blockLinks: patch.blockLinks !== undefined ? normalizeAssetLinks(patch.blockLinks) : base.blockLinks,
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

function build(input: ItemAssetInput, boardId: string): ItemAsset {
  const now = nowIso();
  return {
      id: newId(),
      itemId: input.itemId,
      boardId,
      name: input.name.trim(),
      assetType: input.assetType?.trim() || null,
      quantity: input.quantity ?? null,
      assigneeIds: input.assigneeIds ?? [],
      dueDate: input.dueDate ?? null,
      completedAt: input.completedAt ?? null,
      notes: input.notes?.trim() || null,
      links: normalizeAssetLinks(input.links ?? []),
      blockId: input.blockId ?? null,
      blockName: input.blockId ? input.blockName?.trim() || null : null,
      blockLinks: input.blockId ? normalizeAssetLinks(input.blockLinks ?? []) : [],
      position: input.position ?? 0,
      trackerSheetId: input.trackerSheetId ?? null,
      trackerRowId: input.trackerSheetId ? (input.trackerRowId ?? null) : null,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
}

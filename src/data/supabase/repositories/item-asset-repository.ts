import type { ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import type { ItemAssetRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList } from "../client";

const ASSET = "id, item_id, board_id, name, asset_type, quantity, assignee_ids, due_date, completed_at, notes, position, created_by, created_at, updated_at";

interface ItemAssetRow {
  id: string;
  item_id: string;
  board_id: string;
  name: string;
  asset_type: string | null;
  quantity: number | null;
  assignee_ids: string[] | null;
  due_date: string | null;
  completed_at: string | null;
  notes: string | null;
  position: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toItemAsset(row: ItemAssetRow): ItemAsset {
  return {
    id: row.id,
    itemId: row.item_id,
    boardId: row.board_id,
    name: row.name,
    assetType: row.asset_type,
    quantity: row.quantity,
    assigneeIds: row.assignee_ids ?? [],
    dueDate: row.due_date,
    completedAt: row.completed_at,
    notes: row.notes,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Asset lines. `item_assets_select` limits rows to items the caller can see and
 * the write policies to items they can edit, so the queries filter by item or
 * board only. board_id is set by a trigger from the item, whatever is sent.
 */
export class SupabaseItemAssetRepository implements ItemAssetRepository {
  async getById(id: string): Promise<ItemAsset | null> {
    const result = await db().from("item_assets").select(ASSET).eq("id", id).maybeSingle();
    const row = unwrap<ItemAssetRow | null>(result, "item_assets.getById");
    return row ? toItemAsset(row) : null;
  }

  async listByItem(itemId: string): Promise<ItemAsset[]> {
    const result = await db().from("item_assets").select(ASSET).eq("item_id", itemId).order("position", { ascending: true }).order("created_at", { ascending: true });
    return unwrapList<ItemAssetRow>(result, "item_assets.listByItem").map(toItemAsset);
  }

  async listByBoard(boardId: string): Promise<ItemAsset[]> {
    const result = await db().from("item_assets").select(ASSET).eq("board_id", boardId).order("position", { ascending: true }).order("created_at", { ascending: true });
    return unwrapList<ItemAssetRow>(result, "item_assets.listByBoard").map(toItemAsset);
  }

  async create(input: ItemAssetInput): Promise<ItemAsset> {
    const payload = {
      item_id: input.itemId,
      board_id: input.boardId,
      name: input.name.trim(),
      asset_type: input.assetType?.trim() || null,
      quantity: input.quantity ?? null,
      assignee_ids: input.assigneeIds ?? [],
      due_date: input.dueDate ?? null,
      completed_at: null,
      notes: input.notes?.trim() || null,
      position: input.position ?? 0,
      created_by: input.createdBy,
    };
    const result = await db().from("item_assets").insert(payload).select(ASSET).single();
    return toItemAsset(unwrap<ItemAssetRow>(result, "item_assets.create"));
  }

  async update(id: string, patch: ItemAssetPatch): Promise<ItemAsset> {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name.trim();
    if (patch.assetType !== undefined) payload.asset_type = patch.assetType?.trim() || null;
    if (patch.quantity !== undefined) payload.quantity = patch.quantity;
    if (patch.assigneeIds !== undefined) payload.assignee_ids = patch.assigneeIds;
    if (patch.dueDate !== undefined) payload.due_date = patch.dueDate;
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt;
    if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
    if (patch.position !== undefined) payload.position = patch.position;
    const result = await db().from("item_assets").update(payload).eq("id", id).select(ASSET).single();
    return toItemAsset(unwrap<ItemAssetRow>(result, "item_assets.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("item_assets").delete().eq("id", id), "item_assets.delete");
  }
}

import type { ColumnValue, Item, ItemColumnValue, ItemInput } from "@/domain";
import type { ItemRepository } from "@/data/repositories";
import { assertOk, chunk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { fromItemPatch, toItem, toItemColumnValue, type ItemColumnValueRow, type ItemRow } from "../rows";

const ITEM =
  "id, board_id, group_id, parent_item_id, name, description, position, created_by, archived_at, created_at, updated_at";
const VALUE = "id, item_id, column_id, value_json, updated_at";

export class SupabaseItemRepository implements ItemRepository {
  async listByBoard(boardId: string, options?: { includeArchived?: boolean }): Promise<Item[]> {
    let query = db().from("items").select(ITEM).eq("board_id", boardId);
    if (!options?.includeArchived) query = query.is("archived_at", null);
    const result = await query.order("position", { ascending: true });
    return unwrapList<ItemRow>(result, "items.listByBoard").map(toItem);
  }

  async listByIds(ids: string[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    const pages = await Promise.all(
      chunk(ids).map(async (part) => unwrapList<ItemRow>(await db().from("items").select(ITEM).in("id", part), "items.listByIds")),
    );
    return pages.flat().map(toItem);
  }

  async getById(id: string): Promise<Item | null> {
    const result = await db().from("items").select(ITEM).eq("id", id).maybeSingle();
    const row = unwrapMaybe<ItemRow>(result, "items.getById");
    return row ? toItem(row) : null;
  }

  async create(input: ItemInput & { position: number; id?: string }): Promise<Item> {
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      board_id: input.boardId,
      group_id: input.groupId,
      parent_item_id: input.parentItemId ?? null,
      name: input.name,
      description: input.description ?? null,
      position: input.position,
      created_by: input.createdBy,
    };
    const result = await db().from("items").insert(payload).select(ITEM).single();
    return toItem(unwrap<ItemRow>(result, "items.create"));
  }

  async update(id: string, patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">>): Promise<Item> {
    const result = await db().from("items").update(fromItemPatch(patch)).eq("id", id).select(ITEM).single();
    return toItem(unwrap<ItemRow>(result, "items.update"));
  }

  /**
   * One statement per distinct patch. Items in a batch usually share the same
   * change (archive, move to group), so identical patches are grouped and sent
   * as a single `in (...)` update.
   */
  async updateMany(patches: Array<{ id: string; patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">> }>): Promise<Item[]> {
    if (patches.length === 0) return [];
    const byPatch = new Map<string, { payload: Record<string, unknown>; ids: string[] }>();
    for (const { id, patch } of patches) {
      const payload = fromItemPatch(patch);
      const key = JSON.stringify(payload);
      const entry = byPatch.get(key);
      if (entry) entry.ids.push(id);
      else byPatch.set(key, { payload, ids: [id] });
    }
    const updated: Item[] = [];
    for (const { payload, ids } of byPatch.values()) {
      for (const part of chunk(ids)) {
        const result = await db().from("items").update(payload).in("id", part).select(ITEM);
        updated.push(...unwrapList<ItemRow>(result, "items.updateMany").map(toItem));
      }
    }
    return updated;
  }

  /** Subitems, values, comments and links cascade from the item rows. */
  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (const part of chunk(ids)) {
      assertOk(await db().from("items").delete().in("id", part), "items.deleteMany");
    }
  }

  // ---- Values --------------------------------------------------------------

  async listValuesByBoard(boardId: string): Promise<ItemColumnValue[]> {
    const columns = await db().from("board_columns").select("id").eq("board_id", boardId);
    const columnIds = unwrapList<{ id: string }>(columns, "item_column_values.listValuesByBoard.columns").map((c) => c.id);
    return this.listValuesByColumns(columnIds);
  }

  async listValuesByItem(itemId: string): Promise<ItemColumnValue[]> {
    const result = await db().from("item_column_values").select(VALUE).eq("item_id", itemId);
    return unwrapList<ItemColumnValueRow>(result, "item_column_values.listValuesByItem").map(toItemColumnValue);
  }

  async listValuesByColumns(columnIds: string[]): Promise<ItemColumnValue[]> {
    if (columnIds.length === 0) return [];
    const pages = await Promise.all(
      chunk(columnIds).map(async (part) =>
        unwrapList<ItemColumnValueRow>(
          await db().from("item_column_values").select(VALUE).in("column_id", part),
          "item_column_values.listValuesByColumns",
        ),
      ),
    );
    return pages.flat().map(toItemColumnValue);
  }

  async setValue(itemId: string, columnId: string, value: ColumnValue): Promise<ItemColumnValue> {
    const [result] = await this.setValues([{ itemId, columnId, value }]);
    if (!result) throw new Error("setValue produced no result");
    return result;
  }

  async setValues(values: Array<{ itemId: string; columnId: string; value: ColumnValue }>): Promise<ItemColumnValue[]> {
    if (values.length === 0) return [];
    // `unique (item_id, column_id)` makes this an upsert of one row per pair.
    const payload = values.map((v) => ({ item_id: v.itemId, column_id: v.columnId, value_json: v.value, updated_at: new Date().toISOString() }));
    const result = await db().from("item_column_values").upsert(payload, { onConflict: "item_id,column_id" }).select(VALUE);
    return unwrapList<ItemColumnValueRow>(result, "item_column_values.setValues").map(toItemColumnValue);
  }
}

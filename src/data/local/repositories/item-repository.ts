import type { ArchivePage, ArchiveQuery, ColumnValue, Item, ItemColumnValue, ItemInput } from "@/domain";
import { compareArchived, matchesArchiveQuery } from "@/domain";
import type { ItemRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import { deleteItemsCascade } from "./board-repository";

export class LocalItemRepository implements ItemRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByBoard(boardId: string, options?: { includeArchived?: boolean }): Promise<Item[]> {
    const db = await this.conn.getDb();
    const items = await db.getAllFromIndex("items", "byBoard", boardId);
    const filtered = options?.includeArchived ? items : items.filter((i) => i.archivedAt === null);
    return filtered.sort((a, b) => a.position - b.position);
  }

  /**
   * One page of the board's archive.
   *
   * Everything is already in the browser here, so the page is cut from the
   * filtered list rather than asked for: what matters is that the rules and the
   * order match what the Supabase provider asks the database for, which is why
   * both go through the same two functions.
   */
  async listArchivedPage(query: ArchiveQuery): Promise<ArchivePage<Item>> {
    const archived = await this.archivedOf(query.boardId);
    const needsValues = !!(query.status || query.priority || query.people || query.tags);
    const getValue = needsValues ? await this.valueLookup(archived.map((i) => i.id)) : () => undefined;
    const matched = archived.filter((item) => matchesArchiveQuery(item, query, getValue));
    matched.sort((a, b) => compareArchived(a, b, query.sort));
    return { rows: matched.slice(query.offset, query.offset + query.limit), total: matched.length };
  }

  async countArchived(boardId: string): Promise<number> {
    return (await this.archivedOf(boardId)).length;
  }

  private async archivedOf(boardId: string): Promise<Item[]> {
    const db = await this.conn.getDb();
    const items = await db.getAllFromIndex("items", "byBoard", boardId);
    return items.filter((i) => i.archivedAt !== null && i.parentItemId === null);
  }

  private async valueLookup(itemIds: string[]): Promise<(itemId: string, columnId: string) => ColumnValue | undefined> {
    const values = await this.listValuesByItems(itemIds);
    const byItem = new Map<string, Map<string, ColumnValue>>();
    for (const value of values) {
      const bucket = byItem.get(value.itemId) ?? new Map<string, ColumnValue>();
      bucket.set(value.columnId, value.value);
      byItem.set(value.itemId, bucket);
    }
    return (itemId, columnId) => byItem.get(itemId)?.get(columnId);
  }

  async listByIds(ids: string[]): Promise<Item[]> {
    const db = await this.conn.getDb();
    const results = await Promise.all(ids.map((id) => db.get("items", id)));
    return results.filter((i): i is Item => i !== undefined);
  }

  async getById(id: string): Promise<Item | null> {
    const db = await this.conn.getDb();
    return (await db.get("items", id)) ?? null;
  }

  async create(input: ItemInput & { position: number; id?: string }): Promise<Item> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const item: Item = {
      id: input.id ?? newId(),
      boardId: input.boardId,
      groupId: input.groupId,
      parentItemId: input.parentItemId ?? null,
      name: input.name,
      description: input.description ?? null,
      reference: input.reference ?? null,
      position: input.position,
      createdBy: input.createdBy,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.put("items", item);
    return item;
  }

  async update(id: string, patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">>): Promise<Item> {
    const db = await this.conn.getDb();
    const existing = await db.get("items", id);
    if (!existing) throw new NotFoundError("Item", id);
    const updated: Item = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("items", updated);
    return updated;
  }

  async updateMany(
    patches: Array<{ id: string; patch: Partial<Omit<Item, "id" | "boardId" | "createdAt">> }>,
  ): Promise<Item[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("items", "readwrite");
    const now = nowIso();
    const results: Item[] = [];
    for (const { id, patch } of patches) {
      const existing = await tx.store.get(id);
      if (!existing) continue;
      const updated: Item = { ...existing, ...patch, id, updatedAt: now };
      await tx.store.put(updated);
      results.push(updated);
    }
    await tx.done;
    return results;
  }

  async moveToBoard(itemId: string, input: { boardId: string; groupId: string; position: number }): Promise<Item> {
    const db = await this.conn.getDb();
    const item = await db.get("items", itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const subitems = await db.getAllFromIndex("items", "byParent", itemId);
    const moving = [item, ...subitems];
    const now = nowIso();

    // Values whose column belongs to the board being left. A value is keyed by
    // a column, and the new board does not have that column.
    const keep = new Set(await db.getAllKeysFromIndex("boardColumns", "byBoard", input.boardId));
    for (const moved of moving) {
      for (const value of await db.getAllFromIndex("itemColumnValues", "byItem", moved.id)) {
        if (!keep.has(value.columnId)) await db.delete("itemColumnValues", value.id);
      }
      // The deliverables' denormalised board, so the new board finds them.
      for (const asset of await db.getAllFromIndex("itemAssets", "byItem", moved.id)) {
        await db.put("itemAssets", { ...asset, boardId: input.boardId, updatedAt: now });
      }
    }

    for (const sub of subitems) {
      await db.put("items", { ...sub, boardId: input.boardId, groupId: input.groupId, updatedAt: now });
    }
    const moved: Item = { ...item, boardId: input.boardId, groupId: input.groupId, position: input.position, updatedAt: now };
    await db.put("items", moved);
    return moved;
  }

  async deleteMany(ids: string[]): Promise<void> {
    const db = await this.conn.getDb();
    await deleteItemsCascade(db, ids);
  }

  async listValuesByBoard(boardId: string): Promise<ItemColumnValue[]> {
    const db = await this.conn.getDb();
    const columnIds = await db.getAllKeysFromIndex("boardColumns", "byBoard", boardId);
    const perColumn = await Promise.all(columnIds.map((c) => db.getAllFromIndex("itemColumnValues", "byColumn", c)));
    return perColumn.flat();
  }

  async listValuesByItem(itemId: string): Promise<ItemColumnValue[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("itemColumnValues", "byItem", itemId);
  }

  async listValuesByItems(itemIds: string[]): Promise<ItemColumnValue[]> {
    const db = await this.conn.getDb();
    const perItem = await Promise.all(itemIds.map((id) => db.getAllFromIndex("itemColumnValues", "byItem", id)));
    return perItem.flat();
  }

  async listValuesByColumns(columnIds: string[]): Promise<ItemColumnValue[]> {
    const db = await this.conn.getDb();
    const perColumn = await Promise.all(columnIds.map((c) => db.getAllFromIndex("itemColumnValues", "byColumn", c)));
    return perColumn.flat();
  }

  async setValue(itemId: string, columnId: string, value: ColumnValue): Promise<ItemColumnValue> {
    const [result] = await this.setValues([{ itemId, columnId, value }]);
    if (!result) throw new Error("setValue produced no result");
    return result;
  }

  async setValues(
    values: Array<{ itemId: string; columnId: string; value: ColumnValue }>,
  ): Promise<ItemColumnValue[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("itemColumnValues", "readwrite");
    const now = nowIso();
    const results: ItemColumnValue[] = [];
    for (const { itemId, columnId, value } of values) {
      const existing = (await tx.store.index("byItem").getAll(itemId)).find((v) => v.columnId === columnId);
      const record: ItemColumnValue = existing
        ? { ...existing, value, updatedAt: now }
        : { id: newId(), itemId, columnId, value, updatedAt: now };
      await tx.store.put(record);
      results.push(record);
    }
    await tx.done;
    return results;
  }

  async setValuesIfAbsent(
    values: Array<{ itemId: string; columnId: string; value: ColumnValue }>,
  ): Promise<ItemColumnValue[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("itemColumnValues", "readwrite");
    const now = nowIso();
    const results: ItemColumnValue[] = [];
    for (const { itemId, columnId, value } of values) {
      const existing = (await tx.store.index("byItem").getAll(itemId)).find((v) => v.columnId === columnId);
      if (existing) continue;
      const record: ItemColumnValue = { id: newId(), itemId, columnId, value, updatedAt: now };
      await tx.store.put(record);
      results.push(record);
    }
    await tx.done;
    return results;
  }
}

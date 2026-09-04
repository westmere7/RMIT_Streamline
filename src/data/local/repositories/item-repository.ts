import type { ColumnValue, Item, ItemColumnValue, ItemInput } from "@/domain";
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
}

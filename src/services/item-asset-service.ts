import type { EntityId, ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import { recapAssets, recapColumnValue } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { todayISO } from "@/lib/dates/dates";

/**
 * A task's asset lines, and the "Assets recap" cells that summarise them.
 *
 * The lines are the truth; the recap value stored in an ASSETS_RECAP column is a
 * cache written here after every change so the board can sort, filter and
 * export it without reading every line. Cells still recompute from the live
 * lines when they have them, so the two never disagree on screen.
 */
export class ItemAssetService {
  constructor(private readonly repos: Repositories) {}

  list(itemId: EntityId): Promise<ItemAsset[]> {
    return this.repos.itemAssets.listByItem(itemId);
  }

  listByBoard(boardId: EntityId): Promise<ItemAsset[]> {
    return this.repos.itemAssets.listByBoard(boardId);
  }

  /** Adds a line at the end of the item's list. */
  async add(input: Omit<ItemAssetInput, "position" | "createdBy">, actorId: EntityId): Promise<ItemAsset> {
    if (!input.name.trim()) throw new Error("Say what the asset is");
    const existing = await this.repos.itemAssets.listByItem(input.itemId);
    const position = existing.length ? Math.max(...existing.map((a) => a.position)) + 1 : 0;
    const created = await this.repos.itemAssets.create({ ...input, position, createdBy: actorId });
    await this.recompute(input.itemId, created.boardId);
    return created;
  }

  /** Several lines at once, in order — a booking's deliverables, or a copy of another item's list. */
  async addMany(lines: Array<Omit<ItemAssetInput, "position" | "createdBy">>, actorId: EntityId): Promise<ItemAsset[]> {
    const kept = lines.filter((line) => line.name.trim());
    if (kept.length === 0) return [];
    const created = await Promise.all(kept.map((line, index) => this.repos.itemAssets.create({ ...line, position: index, createdBy: actorId })));
    const first = created[0]!;
    await this.recompute(first.itemId, first.boardId);
    return created;
  }

  async update(id: EntityId, patch: ItemAssetPatch): Promise<ItemAsset> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Say what the asset is");
    if (patch.quantity !== undefined && patch.quantity !== null && (!Number.isFinite(patch.quantity) || patch.quantity < 0)) throw new Error("Quantity must be zero or more");
    const updated = await this.repos.itemAssets.update(id, patch);
    await this.recompute(updated.itemId, updated.boardId);
    return updated;
  }

  async remove(id: EntityId, itemId: EntityId, boardId: EntityId): Promise<void> {
    await this.repos.itemAssets.delete(id);
    await this.recompute(itemId, boardId);
  }

  /** Copies one item's lines onto another (an allocated request onto its team-board mirror). */
  async copyTo(fromItemId: EntityId, toItemId: EntityId, toBoardId: EntityId, actorId: EntityId): Promise<ItemAsset[]> {
    const lines = await this.repos.itemAssets.listByItem(fromItemId);
    return this.addMany(
      lines.map((line) => ({ itemId: toItemId, boardId: toBoardId, name: line.name, assetType: line.assetType, quantity: line.quantity, assigneeId: line.assigneeId, dueDate: line.dueDate, notes: line.notes })),
      actorId,
    );
  }

  /** Rewrites the item's ASSETS_RECAP values from its lines. A no-op on boards without such a column. */
  async recompute(itemId: EntityId, boardId: EntityId): Promise<void> {
    const columns = (await this.repos.boards.listColumns(boardId)).filter((c) => c.type === "ASSETS_RECAP");
    if (columns.length === 0) return;
    const lines = await this.repos.itemAssets.listByItem(itemId);
    const value = recapColumnValue(recapAssets(lines, todayISO()));
    await this.repos.items.setValues(columns.map((column) => ({ itemId, columnId: column.id, value })));
  }
}

/**
 * Fills a freshly added ASSETS_RECAP column for every item on the board that
 * already has lines. Shared by adding a column by hand and by the Task
 * Allocation board's column top-up.
 */
export async function backfillAssetsRecap(repos: Repositories, boardId: EntityId, columnId: EntityId): Promise<void> {
  const column = await repos.boards.getColumn(columnId);
  if (!column || column.type !== "ASSETS_RECAP") throw new NotFoundError("Column", columnId);
  const lines = await repos.itemAssets.listByBoard(boardId);
  if (lines.length === 0) return;
  const byItem = new Map<EntityId, ItemAsset[]>();
  for (const line of lines) byItem.set(line.itemId, [...(byItem.get(line.itemId) ?? []), line]);
  const today = todayISO();
  await repos.items.setValues([...byItem.entries()].map(([itemId, itemLines]) => ({ itemId, columnId, value: recapColumnValue(recapAssets(itemLines, today)) })));
}

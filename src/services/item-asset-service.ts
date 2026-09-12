import type { ActivityEventType, ActivityInput, ActivityMetadata, EntityId, ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
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
 *
 * Every change is also written to the activity feed, with the item and the
 * board on it, so the same movement is read on the task's Activity tab, in the
 * board's activity and in the workspace feed.
 */
export class ItemAssetService {
  constructor(private readonly repos: Repositories) {}

  /**
   * The item's deliverables, which on a linked task means the pair's.
   *
   * A line belongs to the item it was added to and is shown on every item
   * linked to it: one poster, seen from both boards. Copying instead would give
   * the two sides their own counts to disagree about.
   */
  async list(itemId: EntityId): Promise<ItemAsset[]> {
    const ids = await this.sharedWith(itemId);
    if (ids.length === 1) return this.repos.itemAssets.listByItem(itemId);
    const lists = await Promise.all(ids.map((id) => this.repos.itemAssets.listByItem(id)));
    // The item's own lines first, then the far side's, each in its own order:
    // the list reads as "ours, and theirs" rather than interleaved by position
    // numbers that mean nothing across two boards.
    return lists.flat();
  }

  /**
   * Every item whose deliverables are the same as this one's: itself, and
   * everything reachable through links. Assets are never excluded from a link,
   * so no edge is skipped.
   */
  private async sharedWith(itemId: EntityId): Promise<EntityId[]> {
    const seen = new Set<EntityId>([itemId]);
    let frontier: EntityId[] = [itemId];
    while (frontier.length) {
      const next: EntityId[] = [];
      for (const link of await this.repos.links.listByItems(frontier)) {
        for (const end of [link.itemAId, link.itemBId]) {
          if (seen.has(end)) continue;
          seen.add(end);
          next.push(end);
        }
      }
      frontier = next;
    }
    return [itemId, ...[...seen].filter((id) => id !== itemId)];
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
    await this.record(created.itemId, created.boardId, actorId, [{ eventType: "ASSET_ADDED", metadata: { assetName: created.name } }]);
    return created;
  }

  /** Several lines at once, in order — a booking's deliverables, or a copy of another item's list. */
  async addMany(lines: Array<Omit<ItemAssetInput, "position" | "createdBy">>, actorId: EntityId): Promise<ItemAsset[]> {
    const kept = lines.filter((line) => line.name.trim());
    if (kept.length === 0) return [];
    const created = await Promise.all(kept.map((line, index) => this.repos.itemAssets.create({ ...line, position: index, createdBy: actorId })));
    const first = created[0]!;
    await this.recompute(first.itemId, first.boardId);
    // One entry for the batch: a booking with a dozen deliverables should read as
    // one arrival, not a dozen.
    await this.record(first.itemId, first.boardId, actorId, [
      created.length === 1 ? { eventType: "ASSET_ADDED", metadata: { assetName: first.name } } : { eventType: "ASSET_ADDED", metadata: { count: created.length } },
    ]);
    return created;
  }

  async update(id: EntityId, patch: ItemAssetPatch, actorId: EntityId): Promise<ItemAsset> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Say what the asset is");
    if (patch.quantity !== undefined && patch.quantity !== null && (!Number.isFinite(patch.quantity) || patch.quantity < 0)) throw new Error("Quantity must be zero or more");
    const before = await this.repos.itemAssets.getById(id);
    const updated = await this.repos.itemAssets.update(id, patch);
    await this.recompute(updated.itemId, updated.boardId);
    if (before) await this.record(updated.itemId, updated.boardId, actorId, changeEvents(before, updated));
    return updated;
  }

  async remove(id: EntityId, itemId: EntityId, boardId: EntityId, actorId: EntityId): Promise<void> {
    const before = await this.repos.itemAssets.getById(id);
    await this.repos.itemAssets.delete(id);
    await this.recompute(itemId, boardId);
    await this.record(itemId, boardId, actorId, [{ eventType: "ASSET_REMOVED", metadata: { assetName: before?.name } }]);
  }

  /** Copies one item's lines onto another (an allocated request onto its team-board mirror). */
  async copyTo(fromItemId: EntityId, toItemId: EntityId, toBoardId: EntityId, actorId: EntityId): Promise<ItemAsset[]> {
    const lines = await this.repos.itemAssets.listByItem(fromItemId);
    return this.addMany(
      lines.map((line) => ({ itemId: toItemId, boardId: toBoardId, name: line.name, assetType: line.assetType, quantity: line.quantity, assigneeIds: line.assigneeIds, dueDate: line.dueDate, notes: line.notes })),
      actorId,
    );
  }

  /**
   * Writes what happened to the feed. The item's and the board's names travel
   * with it so the entry still reads once either is gone.
   */
  private async record(itemId: EntityId, boardId: EntityId, actorId: EntityId, events: AssetEvent[]): Promise<void> {
    if (events.length === 0) return;
    const [item, board] = await Promise.all([this.repos.items.getById(itemId), this.repos.boards.getById(boardId)]);
    const common = { itemName: item?.name, boardName: board?.name };
    const rows: ActivityInput[] = events.map((event) => ({
      workspaceId: board?.workspaceId ?? "",
      boardId,
      itemId,
      actorId,
      eventType: event.eventType,
      metadata: { ...common, ...event.metadata },
    }));
    await this.repos.activities.createMany(rows);
  }

  /**
   * Rewrites the ASSETS_RECAP values from the lines. A no-op on boards without
   * such a column.
   *
   * Every item sharing these lines is rewritten, not just the one that changed:
   * they are all looking at the same deliverables, so a tick on one board has
   * to move the count on the other.
   */
  async recompute(itemId: EntityId, boardId: EntityId): Promise<void> {
    const ids = await this.sharedWith(itemId);
    const lines = (await Promise.all(ids.map((id) => this.repos.itemAssets.listByItem(id)))).flat();
    const value = recapColumnValue(recapAssets(lines, todayISO()));
    const items = ids.length === 1 ? [{ id: itemId, boardId }] : await this.repos.items.listByIds(ids);
    const writes: Array<{ itemId: EntityId; columnId: EntityId; value: typeof value }> = [];
    const byBoard = new Map<EntityId, EntityId[]>();
    for (const item of items) byBoard.set(item.boardId, [...(byBoard.get(item.boardId) ?? []), item.id]);
    for (const [board, itemIds] of byBoard) {
      const columns = (await this.repos.boards.listColumns(board)).filter((c) => c.type === "ASSETS_RECAP");
      for (const column of columns) for (const id of itemIds) writes.push({ itemId: id, columnId: column.id, value });
    }
    if (writes.length) await this.repos.items.setValues(writes);
  }
}

interface AssetEvent {
  eventType: ActivityEventType;
  metadata: ActivityMetadata;
}

/** How each detail is named in the feed. */
const FIELD_LABELS = { name: "the name", assetType: "the type", quantity: "the quantity", dueDate: "the due date", notes: "the spec" } as const;

/**
 * One entry per detail that actually moved, the way a column change is logged:
 * saving four fields at once should read as four changes, not one vague edit.
 */
function changeEvents(before: ItemAsset, after: ItemAsset): AssetEvent[] {
  const events: AssetEvent[] = [];
  const assetName = after.name;

  if (before.completedAt === null && after.completedAt !== null) events.push({ eventType: "ASSET_COMPLETED", metadata: { assetName } });
  if (before.completedAt !== null && after.completedAt === null) events.push({ eventType: "ASSET_REOPENED", metadata: { assetName } });

  for (const key of ["name", "assetType", "quantity", "dueDate", "notes"] as const) {
    const from = before[key];
    const to = after[key];
    if (from === to) continue;
    events.push({
      eventType: "ASSET_UPDATED",
      // A rename is about the line that was there a moment ago, so it names the old one.
      metadata: { assetName: key === "name" ? before.name : assetName, assetField: FIELD_LABELS[key], from: from === null ? null : String(from), to: to === null ? null : String(to) },
    });
  }

  const added = after.assigneeIds.filter((id) => !before.assigneeIds.includes(id));
  const removed = before.assigneeIds.filter((id) => !after.assigneeIds.includes(id));
  if (added.length || removed.length) {
    events.push({ eventType: "ASSET_UPDATED", metadata: { assetName, assetField: "who is in charge", addedUserIds: added, removedUserIds: removed } });
  }
  return events;
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

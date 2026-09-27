import type { ActivityEventType, ActivityInput, ActivityMetadata, AssetLink, EntityId, ItemAsset, ItemAssetInput, ItemAssetPatch } from "@/domain";
import { recapAssets, recapColumnValue } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { todayISO } from "@/lib/dates/dates";
import { newId } from "@/lib/ids";

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
/** What a board needs to know about its deliverables. See `ItemAssetService.loadBoard`. */
export interface BoardAssets {
  /** Every line stored on this board. Board totals are counted from these and nothing else. */
  lines: ItemAsset[];
  /** What each row shows: its own lines, then anything shared into it through a link. */
  byItem: Map<EntityId, ItemAsset[]>;
  /** Other boards holding lines shared into this one, so a subscription can watch them too. */
  linkedBoardIds: EntityId[];
}

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
   * A whole board's deliverables, as each of its rows actually shows them.
   *
   * The board needs two different answers about the same lines, and conflating
   * them is what made a linked row lie. `lines` is what is *stored here* — the
   * board's own totals, its chart, its workload, where counting the other
   * board's lines would be double counting. `byItem` is what each row *shows* —
   * its own lines plus everything shared into it through a link, which is the
   * set the item panel has always displayed.
   *
   * Before this, the status chip's progress bar and the Kanban card counted
   * `lines` per row: a task with three deliverables here and one on the board it
   * is linked to read "2 of 3 done" on the board and "2 of 4 done" in the panel
   * a few pixels away, and a task whose deliverables all live on the far side
   * showed no progress at all.
   *
   * Four reads whatever the size of the board, and only one of them is new for
   * a board with no links at all.
   */
  async loadBoard(boardId: EntityId, workspaceId: EntityId): Promise<BoardAssets> {
    const lines = await this.repos.itemAssets.listByBoard(boardId);
    const byItem = new Map<EntityId, ItemAsset[]>();
    for (const line of lines) byItem.set(line.itemId, [...(byItem.get(line.itemId) ?? []), line]);

    // Every link in the workspace: a handful of rows, and the only way to reach
    // the far side without reading this board's items back out of the database.
    const links = await this.repos.links.listByWorkspace(workspaceId);
    if (links.length === 0) return { lines, byItem, linkedBoardIds: [] };

    const neighbours = new Map<EntityId, EntityId[]>();
    for (const link of links) {
      for (const [from, to] of [
        [link.itemAId, link.itemBId],
        [link.itemBId, link.itemAId],
      ] as const) {
        neighbours.set(from, [...(neighbours.get(from) ?? []), to]);
      }
    }

    // Which of the linked items are on this board. Reading only the items that
    // appear in a link keeps this off the board's own item table.
    const linkedItems = await this.repos.items.listByIds([...neighbours.keys()]);
    const boardOf = new Map(linkedItems.map((item) => [item.id, item.boardId]));
    const near = linkedItems.filter((item) => item.boardId === boardId).map((item) => item.id);
    if (near.length === 0) return { lines, byItem, linkedBoardIds: [] };

    // The same walk `sharedWith` does, once for every linked row on the board,
    // so a chain of three linked tasks reaches the third the way the panel does.
    const shareSets = new Map<EntityId, EntityId[]>();
    const far = new Set<EntityId>();
    const linkedBoards = new Set<EntityId>();
    for (const itemId of near) {
      const seen = new Set<EntityId>([itemId]);
      let frontier = [itemId];
      while (frontier.length) {
        const next: EntityId[] = [];
        for (const id of frontier) {
          for (const end of neighbours.get(id) ?? []) {
            if (seen.has(end)) continue;
            seen.add(end);
            next.push(end);
          }
        }
        frontier = next;
      }
      const others = [...seen].filter((id) => id !== itemId);
      shareSets.set(itemId, others);
      for (const id of others) {
        far.add(id);
        const board = boardOf.get(id);
        if (board && board !== boardId) linkedBoards.add(board);
      }
    }

    const farLines = await this.repos.itemAssets.listByItems([...far]);
    const farByItem = new Map<EntityId, ItemAsset[]>();
    for (const line of farLines) farByItem.set(line.itemId, [...(farByItem.get(line.itemId) ?? []), line]);

    for (const [itemId, others] of shareSets) {
      const shared = others.flatMap((id) => farByItem.get(id) ?? []);
      if (shared.length === 0) continue;
      // The row's own lines first, then the far side's — the order the panel
      // reads them in.
      byItem.set(itemId, [...(byItem.get(itemId) ?? []), ...shared]);
    }

    return { lines, byItem, linkedBoardIds: [...linkedBoards] };
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

  /**
   * Several lines at once, in order, after whatever the item already lists — a
   * booking's deliverables, a copy of another item's list, or a new block.
   */
  async addMany(lines: Array<Omit<ItemAssetInput, "position" | "createdBy">>, actorId: EntityId): Promise<ItemAsset[]> {
    const kept = lines.filter((line) => line.name.trim());
    if (kept.length === 0) return [];
    const existing = await this.repos.itemAssets.listByItem(kept[0]!.itemId);
    const start = existing.length ? Math.max(...existing.map((a) => a.position)) + 1 : 0;
    const created = await Promise.all(kept.map((line, index) => this.repos.itemAssets.create({ ...line, position: start + index, createdBy: actorId })));
    const first = created[0]!;
    await this.recompute(first.itemId, first.boardId);
    // One entry for the batch: a booking with a dozen deliverables should read as
    // one arrival, not a dozen. A block arrives under its own name.
    const block = created.every((line) => line.blockId && line.blockId === first.blockId) ? first.blockName : null;
    await this.record(first.itemId, first.boardId, actorId, [
      created.length === 1 || block ? { eventType: "ASSET_ADDED", metadata: { assetName: block ?? first.name } } : { eventType: "ASSET_ADDED", metadata: { count: created.length } },
    ]);
    return created;
  }

  /**
   * Renames a block, changes who is in charge of all of it, or takes its lines
   * out of it. Every line is written, since each carries the block, and the
   * feed gets one entry for the block rather than one per line.
   */
  async updateBlock(itemId: EntityId, blockId: EntityId, patch: { name?: string; assigneeIds?: EntityId[]; links?: AssetLink[]; ungroup?: boolean }, actorId: EntityId): Promise<ItemAsset[]> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Name the block");
    const lines = (await this.list(itemId)).filter((line) => line.blockId === blockId);
    if (lines.length === 0) throw new NotFoundError("Block", blockId);
    const first = lines[0]!;
    const linePatch: ItemAssetPatch = {};
    if (patch.ungroup) Object.assign(linePatch, { blockId: null, blockName: null, blockLinks: [] });
    else {
      if (patch.name !== undefined) linePatch.blockName = patch.name.trim();
      if (patch.links !== undefined) linePatch.blockLinks = patch.links;
    }
    if (patch.assigneeIds !== undefined) linePatch.assigneeIds = patch.assigneeIds;
    const updated = await Promise.all(lines.map((line) => this.repos.itemAssets.update(line.id, linePatch)));
    await this.recompute(first.itemId, first.boardId);

    const blockName = first.blockName ?? "Block";
    const events: AssetEvent[] = [];
    if (!patch.ungroup && patch.name !== undefined && patch.name.trim() !== blockName) {
      events.push({ eventType: "ASSET_UPDATED", metadata: { assetName: blockName, assetField: "the block name", from: blockName, to: patch.name.trim() } });
    }
    if (patch.assigneeIds !== undefined) {
      const before = new Set(lines.flatMap((line) => line.assigneeIds));
      const added = patch.assigneeIds.filter((id) => !before.has(id));
      const removed = [...before].filter((id) => !patch.assigneeIds!.includes(id));
      if (added.length || removed.length) events.push({ eventType: "ASSET_UPDATED", metadata: { assetName: patch.name?.trim() || blockName, assetField: "who is in charge", addedUserIds: added, removedUserIds: removed } });
    }
    await this.record(first.itemId, first.boardId, actorId, events);
    return updated;
  }

  /**
   * Everything the block dialog edits, in one go: the block's name, people and
   * links, each line's name, type, quantity and due date, lines added and lines
   * taken off. The recap is rewritten once, at the end.
   */
  async saveBlock(itemId: EntityId, blockId: EntityId, form: SavedBlock, actorId: EntityId): Promise<void> {
    const blockName = form.name.trim();
    if (!blockName) throw new Error("Name the block");
    const current = (await this.list(itemId)).filter((line) => line.blockId === blockId);
    if (current.length === 0) throw new NotFoundError("Block", blockId);
    const first = current[0]!;
    const shared: ItemAssetPatch = { blockName, assigneeIds: form.assigneeIds, blockLinks: form.links };
    const events: AssetEvent[] = [];

    const oldName = first.blockName ?? "Block";
    if (blockName !== oldName) events.push({ eventType: "ASSET_UPDATED", metadata: { assetName: oldName, assetField: "the block name", from: oldName, to: blockName } });
    const before = new Set(current.flatMap((line) => line.assigneeIds));
    const added = form.assigneeIds.filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !form.assigneeIds.includes(id));
    if (added.length || removed.length) events.push({ eventType: "ASSET_UPDATED", metadata: { assetName: blockName, assetField: "who is in charge", addedUserIds: added, removedUserIds: removed } });

    const kept = new Set(form.lines.flatMap((line) => (line.id ? [line.id] : [])));
    for (const line of form.lines) {
      if (!line.id || !line.name.trim()) continue;
      const was = current.find((c) => c.id === line.id);
      if (!was) continue;
      const after = await this.repos.itemAssets.update(line.id, { ...shared, name: line.name.trim(), assetType: line.assetType, quantity: line.quantity, dueDate: line.dueDate });
      // Who is in charge is the block's, and was said once above.
      events.push(...changeEvents(was, after).filter((event) => event.metadata.assetField !== "who is in charge"));
    }
    for (const line of current) {
      if (kept.has(line.id)) continue;
      await this.repos.itemAssets.delete(line.id);
      events.push({ eventType: "ASSET_REMOVED", metadata: { assetName: line.name } });
    }
    const fresh = form.lines.filter((line) => !line.id && line.name.trim());
    if (fresh.length) {
      const existing = await this.repos.itemAssets.listByItem(first.itemId);
      const start = existing.length ? Math.max(...existing.map((a) => a.position)) + 1 : 0;
      for (const [index, line] of fresh.entries()) {
        const created = await this.repos.itemAssets.create({
          itemId: first.itemId,
          boardId: first.boardId,
          name: line.name.trim(),
          assetType: line.assetType,
          quantity: line.quantity,
          dueDate: line.dueDate,
          assigneeIds: form.assigneeIds,
          blockId,
          blockName,
          blockLinks: form.links,
          position: start + index,
          createdBy: actorId,
        });
        events.push({ eventType: "ASSET_ADDED", metadata: { assetName: created.name } });
      }
    }
    await this.recompute(first.itemId, first.boardId);
    await this.record(first.itemId, first.boardId, actorId, events);
  }

  /** Removes a block and every line in it. */
  async removeBlock(itemId: EntityId, blockId: EntityId, actorId: EntityId): Promise<void> {
    const lines = (await this.list(itemId)).filter((line) => line.blockId === blockId);
    if (lines.length === 0) return;
    const first = lines[0]!;
    await Promise.all(lines.map((line) => this.repos.itemAssets.delete(line.id)));
    await this.recompute(first.itemId, first.boardId);
    await this.record(first.itemId, first.boardId, actorId, [{ eventType: "ASSET_REMOVED", metadata: { assetName: first.blockName ?? "a block" } }]);
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

  /**
   * Copies one item's lines onto another (an allocated request onto its
   * team-board mirror). Blocks come across as blocks of their own: a new id for
   * each, so the copy and the original can be regrouped apart.
   */
  async copyTo(fromItemId: EntityId, toItemId: EntityId, toBoardId: EntityId, actorId: EntityId): Promise<ItemAsset[]> {
    const lines = await this.repos.itemAssets.listByItem(fromItemId);
    const blocks = new Map<EntityId, EntityId>();
    const blockOf = (id: EntityId | null) => {
      if (!id) return null;
      if (!blocks.has(id)) blocks.set(id, newId());
      return blocks.get(id)!;
    };
    return this.addMany(
      lines.map((line) => ({
        itemId: toItemId,
        boardId: toBoardId,
        name: line.name,
        assetType: line.assetType,
        quantity: line.quantity,
        assigneeIds: line.assigneeIds,
        dueDate: line.dueDate,
        notes: line.notes,
        blockId: blockOf(line.blockId),
        blockName: line.blockId ? line.blockName : null,
      })),
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

/** What the block dialog hands back. A line without an id is a new one; a line of the block missing from `lines` was taken off. */
export interface SavedBlock {
  name: string;
  assigneeIds: EntityId[];
  links: AssetLink[];
  lines: Array<{ id: EntityId | null; name: string; assetType: string | null; quantity: number | null; dueDate: string | null }>;
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

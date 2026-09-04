import type { ActivityInput, Board, BoardColumn, BoardGroup, ColumnLabel, ColumnValue, EntityId, Item, ItemColumnValue, ItemLink, NotificationInput } from "@/domain";
import { columnLabels, emptyValueFor, isEmptyValue, otherEndOf } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { displayValue } from "./column-display";
import { mapColumns, translateValue, valuesEqual, type ColumnMappingReport } from "./item-link-sync";

/** A linked item as shown in the item panel. */
export interface LinkedItemView {
  link: ItemLink;
  item: Item;
  board: Board;
  group: BoardGroup | null;
  /** Set when the linked item is a subitem. */
  parent: Item | null;
  status: ColumnLabel | null;
  ownerIds: EntityId[];
  dueDate: string | null;
  /** How the viewing item's columns map onto this item's board. */
  mapping: ColumnMappingReport;
}

/** A search hit in the link dialog. */
export interface LinkCandidate {
  item: Item;
  board: Board;
  group: BoardGroup | null;
  parent: Item | null;
  status: ColumnLabel | null;
  /** Already linked to the item being edited. */
  linked: boolean;
}

export type LinkChange = { kind: "name"; name: string } | { kind: "description"; description: string | null } | { kind: "value"; columnId: EntityId; value: ColumnValue };

export type LinkValidation = { ok: true } | { ok: false; reason: string };

export interface LinkOptions {
  /** Which side's values fill in the other's when the link is created. */
  seedFrom: "item" | "target";
}

interface BoardBundle {
  board: Board;
  columns: BoardColumn[];
  groups: BoardGroup[];
}

/**
 * Task Linking. Links are symmetric and transitive: a change to any item in a
 * connected set is mirrored to every other item in that set, one write per item,
 * so there is no fan-out loop. Subitems of a linked item are never touched.
 */
export class ItemLinkService {
  constructor(private readonly repos: Repositories) {}

  // ---- Reads ---------------------------------------------------------------

  async listForItem(itemId: EntityId): Promise<LinkedItemView[]> {
    const item = await this.repos.items.getById(itemId);
    if (!item) return [];
    const links = await this.repos.links.listByItem(itemId);
    if (links.length === 0) return [];
    const boards = new Map<EntityId, BoardBundle>();
    const own = await this.bundle(item.boardId, boards);
    const views: LinkedItemView[] = [];
    for (const link of links) {
      const other = await this.repos.items.getById(otherEndOf(link, itemId));
      if (!other) continue;
      const bundle = await this.bundle(other.boardId, boards);
      if (!bundle) continue;
      const values = await this.repos.items.listValuesByItem(other.id);
      views.push({
        link,
        item: other,
        board: bundle.board,
        group: bundle.groups.find((g) => g.id === other.groupId) ?? null,
        parent: other.parentItemId ? await this.repos.items.getById(other.parentItemId) : null,
        status: statusOf(bundle.columns, values),
        ownerIds: ownersOf(bundle.columns, values),
        dueDate: dueDateOf(bundle.columns, values),
        mapping: own ? mapColumns(own.columns, bundle.columns) : { mapped: [], unmapped: [], targetOnly: [] },
      });
    }
    return views;
  }

  /** Column pairing between two boards, for the "what syncs" preview. */
  async previewMapping(boardId: EntityId, otherBoardId: EntityId): Promise<ColumnMappingReport> {
    const [a, b] = await Promise.all([this.repos.boards.listColumns(boardId), this.repos.boards.listColumns(otherBoardId)]);
    return mapColumns(a, b);
  }

  /** Items on other boards in the workspace whose name matches `query`. */
  async searchCandidates(workspaceId: EntityId, itemId: EntityId, query: string, limit = 40): Promise<LinkCandidate[]> {
    const needle = query.trim().toLowerCase();
    const item = await this.repos.items.getById(itemId);
    if (!item) return [];
    const [boards, links] = await Promise.all([this.repos.boards.listByWorkspace(workspaceId), this.repos.links.listByItem(itemId)]);
    const linkedIds = new Set(links.map((l) => otherEndOf(l, itemId)));
    const results: LinkCandidate[] = [];
    for (const board of boards) {
      if (board.archivedAt !== null || board.id === item.boardId) continue;
      const [items, columns, groups] = await Promise.all([this.repos.items.listByBoard(board.id), this.repos.boards.listColumns(board.id), this.repos.boards.listGroups(board.id)]);
      for (const candidate of items) {
        if (needle && !candidate.name.toLowerCase().includes(needle)) continue;
        const itemValues = await this.repos.items.listValuesByItem(candidate.id);
        results.push({
          item: candidate,
          board,
          group: groups.find((g) => g.id === candidate.groupId) ?? null,
          parent: candidate.parentItemId ? (items.find((i) => i.id === candidate.parentItemId) ?? null) : null,
          status: statusOf(columns, itemValues),
          linked: linkedIds.has(candidate.id),
        });
        if (results.length >= limit) return results;
      }
    }
    return results;
  }

  // ---- Link / unlink -------------------------------------------------------

  async validate(itemId: EntityId, targetId: EntityId): Promise<LinkValidation> {
    if (itemId === targetId) return { ok: false, reason: "An item cannot be linked to itself." };
    const [item, target] = await Promise.all([this.repos.items.getById(itemId), this.repos.items.getById(targetId)]);
    if (!item || !target) return { ok: false, reason: "One of the items no longer exists." };
    if (item.parentItemId === targetId || target.parentItemId === itemId)
      return {
        ok: false,
        reason: "An item cannot be linked to its own subitem.",
      };
    if (item.boardId === target.boardId)
      return {
        ok: false,
        reason: "Linked items must live on different boards.",
      };
    const [boardA, boardB] = await Promise.all([this.repos.boards.getById(item.boardId), this.repos.boards.getById(target.boardId)]);
    if (!boardA || !boardB) return { ok: false, reason: "One of the boards no longer exists." };
    if (boardA.workspaceId !== boardB.workspaceId)
      return {
        ok: false,
        reason: "Items can only be linked within the same space.",
      };
    const links = await this.repos.links.listByItem(itemId);
    if (links.some((l) => otherEndOf(l, itemId) === targetId)) return { ok: false, reason: "These items are already linked." };
    return { ok: true };
  }

  async link(itemId: EntityId, targetId: EntityId, actorId: EntityId, options: LinkOptions = { seedFrom: "item" }): Promise<ItemLink> {
    const valid = await this.validate(itemId, targetId);
    if (!valid.ok) throw new Error(valid.reason);
    const [item, target] = await Promise.all([this.getItem(itemId), this.getItem(targetId)]);
    const [boardA, boardB] = await Promise.all([this.getBoard(item.boardId), this.getBoard(target.boardId)]);

    const link = await this.repos.links.create({
      workspaceId: boardA.workspaceId,
      itemIds: [itemId, targetId],
      createdBy: actorId,
    });
    // Whoever owned the target before seeding is told their item is now mirrored.
    const targetOwners = await this.ownersOf(target);

    const [source, dest] = options.seedFrom === "item" ? [item, target] : [target, item];
    await this.fillFrom(source, dest);
    // The pair (and anything already linked to either side) now agrees; push the
    // merged state through the whole connected set.
    const merged = await this.getItem(source.id);
    await this.propagate(merged.id, { kind: "name", name: merged.name }, actorId, { silent: true });
    await this.propagate(merged.id, { kind: "description", description: merged.description }, actorId, { silent: true });
    for (const v of await this.repos.items.listValuesByItem(merged.id)) {
      await this.propagate(merged.id, { kind: "value", columnId: v.columnId, value: v.value }, actorId, { silent: true });
    }

    const users = await this.repos.users.list();
    const actorName = users.find((u) => u.id === actorId)?.firstName ?? "Someone";
    await this.repos.activities.createMany([linkActivity("ITEM_LINKED", item, boardA, target, boardB, actorId), linkActivity("ITEM_LINKED", target, boardB, item, boardA, actorId)]);
    const notifications: NotificationInput[] = targetOwners
      .filter((id) => id !== actorId)
      .map((userId) => ({
        userId,
        type: "ITEM_LINKED",
        title: `${actorName} linked ${target.name} with an item on ${boardA.name}`,
        body: `Changes to either item now stay in sync.`,
        entityType: "ITEM",
        entityId: target.id,
        boardId: boardB.id,
        actorId,
      }));
    if (notifications.length) await this.repos.notifications.createMany(notifications);
    return link;
  }

  async unlink(linkId: EntityId, actorId: EntityId): Promise<void> {
    const link = await this.repos.links.getById(linkId);
    if (!link) return;
    await this.repos.links.delete(linkId);
    const [a, b] = await Promise.all([this.repos.items.getById(link.itemAId), this.repos.items.getById(link.itemBId)]);
    if (!a || !b) return;
    const [boardA, boardB] = await Promise.all([this.repos.boards.getById(a.boardId), this.repos.boards.getById(b.boardId)]);
    if (!boardA || !boardB) return;
    await this.repos.activities.createMany([linkActivity("ITEM_UNLINKED", a, boardA, b, boardB, actorId), linkActivity("ITEM_UNLINKED", b, boardB, a, boardA, actorId)]);
  }

  // ---- Sync ----------------------------------------------------------------

  /** Every item reachable through links from `itemId`, excluding itself. */
  async connectedItemIds(itemId: EntityId): Promise<EntityId[]> {
    const seen = new Set<EntityId>([itemId]);
    const queue = [itemId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const link of await this.repos.links.listByItem(current)) {
        const other = otherEndOf(link, current);
        if (!seen.has(other)) {
          seen.add(other);
          queue.push(other);
        }
      }
    }
    seen.delete(itemId);
    return [...seen];
  }

  /**
   * Mirrors one change from `originId` onto every linked item. Returns the ids of
   * boards that received a write so callers can refresh them. `silent` suppresses
   * activity entries (used while seeding a brand-new link).
   */
  async propagate(originId: EntityId, change: LinkChange, actorId: EntityId, options: { silent?: boolean } = {}): Promise<EntityId[]> {
    const targets = await this.connectedItemIds(originId);
    if (targets.length === 0) return [];
    const origin = await this.getItem(originId);
    const boards = new Map<EntityId, BoardBundle>();
    const originBundle = await this.bundle(origin.boardId, boards);
    if (!originBundle) return [];
    const users = change.kind === "value" && !options.silent ? await this.repos.users.list() : [];
    const touched = new Set<EntityId>();
    const activities: ActivityInput[] = [];

    for (const targetId of targets) {
      const target = await this.repos.items.getById(targetId);
      if (!target) continue;
      const bundle = await this.bundle(target.boardId, boards);
      if (!bundle) continue;

      if (change.kind === "name") {
        if (target.name === change.name) continue;
        await this.repos.items.update(target.id, { name: change.name });
        touched.add(target.boardId);
        if (!options.silent) {
          activities.push({
            workspaceId: bundle.board.workspaceId,
            boardId: target.boardId,
            itemId: target.id,
            actorId,
            eventType: "ITEM_RENAMED",
            metadata: {
              from: target.name,
              to: change.name,
              itemName: change.name,
              syncedFrom: origin.name,
            },
          });
        }
        continue;
      }

      if (change.kind === "description") {
        if ((target.description ?? null) === (change.description ?? null)) continue;
        await this.repos.items.update(target.id, {
          description: change.description,
        });
        touched.add(target.boardId);
        continue;
      }

      const sourceColumn = originBundle.columns.find((c) => c.id === change.columnId);
      if (!sourceColumn) continue;
      const pair = mapColumns(originBundle.columns, bundle.columns).mapped.find((m) => m.source.id === sourceColumn.id);
      if (!pair) continue;
      const translated = translateValue(change.value, sourceColumn, pair.target);
      if (translated.kind === "skip") continue;
      const existing = (await this.repos.items.listValuesByItem(target.id)).find((v) => v.columnId === pair.target.id);
      if (valuesEqual(existing?.value, translated.value)) continue;
      await this.repos.items.setValue(target.id, pair.target.id, translated.value);
      touched.add(target.boardId);
      if (!options.silent) {
        const from = displayValue(pair.target, existing?.value ?? emptyValueFor(pair.target.type), users);
        const to = displayValue(pair.target, translated.value, users);
        if (from !== to) {
          activities.push({
            workspaceId: bundle.board.workspaceId,
            boardId: target.boardId,
            itemId: target.id,
            actorId,
            eventType: "ITEM_COLUMN_VALUE_UPDATED",
            metadata: {
              itemName: target.name,
              columnName: pair.target.name,
              columnType: pair.target.type,
              from,
              to,
              syncedFrom: origin.name,
            },
          });
        }
      }
    }

    if (activities.length) await this.repos.activities.createMany(activities);
    return [...touched];
  }

  // ---- Helpers -------------------------------------------------------------

  /**
   * Makes a freshly linked pair agree without destroying anything: `source` wins
   * wherever it has a value, and `dest` fills the gaps `source` left empty.
   */
  private async fillFrom(source: Item, dest: Item): Promise<void> {
    if (dest.name !== source.name) await this.repos.items.update(dest.id, { name: source.name });
    if (source.description && dest.description !== source.description)
      await this.repos.items.update(dest.id, {
        description: source.description,
      });
    else if (!source.description && dest.description)
      await this.repos.items.update(source.id, {
        description: dest.description,
      });

    const [sourceColumns, destColumns] = await Promise.all([this.repos.boards.listColumns(source.boardId), this.repos.boards.listColumns(dest.boardId)]);
    const [sourceValues, destValues] = await Promise.all([this.repos.items.listValuesByItem(source.id), this.repos.items.listValuesByItem(dest.id)]);
    const writes: Array<{
      itemId: EntityId;
      columnId: EntityId;
      value: ColumnValue;
    }> = [];
    for (const { source: sc, target: dc } of mapColumns(sourceColumns, destColumns).mapped) {
      const sv = sourceValues.find((v) => v.columnId === sc.id)?.value;
      const dv = destValues.find((v) => v.columnId === dc.id)?.value;
      if (!isEmptyValue(sv)) {
        const t = translateValue(sv!, sc, dc);
        if (t.kind === "value" && !valuesEqual(dv, t.value)) writes.push({ itemId: dest.id, columnId: dc.id, value: t.value });
      } else if (!isEmptyValue(dv)) {
        const t = translateValue(dv!, dc, sc);
        if (t.kind === "value" && !valuesEqual(sv, t.value)) writes.push({ itemId: source.id, columnId: sc.id, value: t.value });
      }
    }
    if (writes.length) await this.repos.items.setValues(writes);
  }

  private async bundle(boardId: EntityId, cache: Map<EntityId, BoardBundle>): Promise<BoardBundle | null> {
    const cached = cache.get(boardId);
    if (cached) return cached;
    const board = await this.repos.boards.getById(boardId);
    if (!board) return null;
    const [columns, groups] = await Promise.all([this.repos.boards.listColumns(boardId), this.repos.boards.listGroups(boardId)]);
    const bundle = { board, columns, groups };
    cache.set(boardId, bundle);
    return bundle;
  }

  private async ownersOf(item: Item): Promise<EntityId[]> {
    const columns = await this.repos.boards.listColumns(item.boardId);
    return ownersOf(columns, await this.repos.items.listValuesByItem(item.id));
  }

  private async getItem(id: EntityId): Promise<Item> {
    const item = await this.repos.items.getById(id);
    if (!item) throw new NotFoundError("Item", id);
    return item;
  }

  private async getBoard(id: EntityId): Promise<Board> {
    const board = await this.repos.boards.getById(id);
    if (!board) throw new NotFoundError("Board", id);
    return board;
  }
}

function linkActivity(eventType: "ITEM_LINKED" | "ITEM_UNLINKED", item: Item, board: Board, other: Item, otherBoard: Board, actorId: EntityId): ActivityInput {
  return {
    workspaceId: board.workspaceId,
    boardId: board.id,
    itemId: item.id,
    actorId,
    eventType,
    metadata: {
      itemName: item.name,
      linkedItemName: other.name,
      linkedBoardName: otherBoard.name,
    },
  };
}

function statusOf(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): ColumnLabel | null {
  const column = columns.find((c) => c.type === "STATUS");
  if (!column) return null;
  const v = values.find((x) => x.columnId === column.id)?.value;
  return v?.type === "STATUS" ? (columnLabels(column).find((l) => l.id === v.labelId) ?? null) : null;
}

function ownersOf(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): EntityId[] {
  const personIds = new Set(columns.filter((c) => c.type === "PERSON").map((c) => c.id));
  const ids = new Set<EntityId>();
  for (const v of values) if (personIds.has(v.columnId) && v.value.type === "PERSON") v.value.userIds.forEach((id) => ids.add(id));
  return [...ids];
}

function dueDateOf(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): string | null {
  const date = columns.find((c) => c.type === "DATE");
  const dv = date ? values.find((x) => x.columnId === date.id)?.value : undefined;
  if (dv?.type === "DATE" && dv.date) return dv.date;
  const timeline = columns.find((c) => c.type === "TIMELINE");
  const tv = timeline ? values.find((x) => x.columnId === timeline.id)?.value : undefined;
  return tv?.type === "TIMELINE" ? tv.end : null;
}

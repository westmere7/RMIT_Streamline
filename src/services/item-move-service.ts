import type { Board, BoardColumn, BoardGroup, ColumnValue, EntityId, Item, ItemColumnValue } from "@/domain";
import { isEmptyValue, RefusedError, landingGroupOf } from "@/domain";
import { NotFoundError, type Repositories } from "@/data/repositories";
import { richTextToPlain } from "@/lib/rich-text";
import type { ItemAssetService } from "./item-asset-service";
import { UNSYNCED_COLUMN_TYPES, mapColumns, translateValue } from "./item-link-sync";

/** One value that will not come across, and why: shown before the move, so nothing is lost by surprise. */
export interface MoveLoss {
  itemId: EntityId;
  itemName: string;
  /** The source column it was in. */
  columnId: EntityId;
  columnName: string;
  reason: string;
}

/** What moving a task to another board would do, worked out from both boards' columns as they are now. */
export interface MovePlan {
  /** The values that come across, already rewritten for the target's columns. */
  carried: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }>;
  /** Columns whose values come across, by the source's name → the target's. */
  kept: Array<{ from: string; to: string }>;
  /** Values that stay behind: no column to take them, or a label the target does not have. */
  lost: MoveLoss[];
  /** How many subitems move with it. */
  subitems: number;
  /** The brief, when the target has no column for it: kept at the top of the description instead. */
  briefToDescription: string | null;
  /** Source column id → the target column it pairs with, for re-pointing a link's hand pairings. */
  columnMap: Record<string, string>;
}

/** Why a board cannot take the task, or null when it can. */
export function moveTargetProblem(source: Pick<Board, "id" | "workspaceId">, target: Pick<Board, "id" | "workspaceId" | "archivedAt" | "system"> | null): string | null {
  if (!target) return "That board no longer exists.";
  if (target.id === source.id) return "The task is already on that board.";
  if (target.workspaceId !== source.workspaceId) return "Tasks move only between boards in the same workspace.";
  if (target.archivedAt) return "That board is archived.";
  if (target.system) return "Tasks cannot be moved onto a built-in board.";
  return null;
}

/**
 * Pairs the source board's columns with the target's (the same rules as linked
 * tasks: special columns by type, then by name, then a lone column of a type)
 * and rewrites every value of the task and its subitems for the column it
 * lands in. What cannot land is reported, never dropped quietly.
 */
export function planMove(input: {
  items: readonly Pick<Item, "id" | "name" | "description">[];
  values: readonly ItemColumnValue[];
  sourceColumns: readonly BoardColumn[];
  targetColumns: readonly BoardColumn[];
}): MovePlan {
  const report = mapColumns(input.sourceColumns, input.targetColumns);
  const targetOf = new Map(report.mapped.map((m) => [m.source.id, m.target] as const));
  const columnById = new Map(input.sourceColumns.map((c) => [c.id, c] as const));
  const nameOf = new Map(input.items.map((i) => [i.id, i.name] as const));
  const carried: MovePlan["carried"] = [];
  const lost: MoveLoss[] = [];
  const keptIds = new Set<string>();
  let briefCarried = false;
  const brief = input.sourceColumns.find((c) => c.type === "BRIEF") ?? null;

  for (const v of input.values) {
    const source = columnById.get(v.columnId);
    // A value with no column, or on a column worked out from others (recap, progress, last updated): nothing to carry.
    if (!source || UNSYNCED_COLUMN_TYPES.has(source.type) || isEmptyValue(v.value)) continue;
    const target = targetOf.get(source.id);
    const itemName = nameOf.get(v.itemId) ?? "A subitem";
    if (!target) {
      // The brief is kept in the description rather than lost (below).
      if (source.id !== brief?.id) lost.push({ itemId: v.itemId, itemName, columnId: source.id, columnName: source.name, reason: "No matching column on that board" });
      continue;
    }
    const translated = translateValue(v.value, source, target);
    if (translated.kind === "skip") {
      lost.push({ itemId: v.itemId, itemName, columnId: source.id, columnName: source.name, reason: translated.reason });
      continue;
    }
    carried.push({ itemId: v.itemId, columnId: target.id, value: translated.value });
    keptIds.add(source.id);
    if (source.id === brief?.id) briefCarried = true;
  }

  const parent = input.items[0];
  const briefValue = brief && parent ? input.values.find((v) => v.itemId === parent.id && v.columnId === brief.id)?.value : undefined;
  const briefText = briefValue && "text" in briefValue ? richTextToPlain(briefValue.text ?? "").trim() : "";
  return {
    carried,
    kept: report.mapped.filter((m) => keptIds.has(m.source.id)).map((m) => ({ from: m.source.name, to: m.target.name })),
    lost,
    subitems: Math.max(0, input.items.length - 1),
    columnMap: Object.fromEntries(report.mapped.map((m) => [m.source.id, m.target.id])),
    briefToDescription: briefText && !briefCarried && !(parent?.description ?? "").includes(briefText) ? briefText : null,
  };
}

/**
 * Moves a task, with its subitems, values, deliverables, updates and links, to
 * another board in the workspace.
 *
 * Rights are the database's: moving a row needs the right to edit both boards
 * (items_update checks the row before and after), so the task row moves first
 * and a refusal stops everything before any value is touched. In local mode
 * the board picker only offers boards the reader can edit.
 */
export class ItemMoveService {
  constructor(
    private readonly repos: Repositories,
    private readonly assets: ItemAssetService,
  ) {}

  /** The plan for moving `itemId` to `targetBoardId`, without moving anything. */
  async preview(itemId: EntityId, targetBoardId: EntityId): Promise<MovePlan & { groups: BoardGroup[] }> {
    const { plan, groups } = await this.prepare(itemId, targetBoardId);
    return { ...plan, groups };
  }

  async moveToBoard(itemId: EntityId, targetBoardId: EntityId, actorId: EntityId, options: { groupId?: EntityId } = {}): Promise<{ item: Item; board: Board; plan: MovePlan }> {
    // Worked out again here, from the boards as they are now, not as the preview saw them.
    const { item, source, target, groups, plan, targetItems, movingIds, sourceColumnIds } = await this.prepare(itemId, targetBoardId);
    // The group picked in the dialog, else the board's landing group, else its top group.
    const group = (options.groupId ? groups.find((g) => g.id === options.groupId) : undefined) ?? landingGroupOf(target, groups);
    if (!group) throw new RefusedError(`${target.name} has no group to take the task. Add one first.`);

    const position = targetItems.filter((i) => i.groupId === group.id && i.parentItemId === null).length;
    const moved = await this.repos.items.moveToBoard(item.id, { boardId: target.id, groupId: group.id, position });
    // The task's own values first: the move has cleared the old board's, and a
    // task must never be left on its new board with none of them.
    if (plan.carried.length) await this.repos.items.setValues(plan.carried);
    const brief = plan.briefToDescription;
    if (brief) await this.repos.items.update(item.id, { description: item.description?.trim() ? `${brief}\n\n${item.description.trim()}` : brief });
    // Then the links' column pairs. One the mover may not rewrite (its other
    // end is on a board they can't edit) keeps its old pairs, which name
    // columns the task no longer has and so mirror nothing; the move stands.
    await this.repointLinks(movingIds, plan.columnMap, sourceColumnIds).catch((error) => console.warn("Could not re-point a moved task's links", error));
    // Deliverables are counted per board: worked out again where they landed.
    await this.assets.recompute(item.id, target.id);
    await this.repos.activities.create({
      workspaceId: source.workspaceId,
      boardId: target.id,
      itemId: item.id,
      actorId,
      eventType: "ITEM_MOVED",
      metadata: { itemName: item.name, boardName: target.name, from: source.name, to: target.name },
    });
    return { item: moved, board: target, plan };
  }

  private async prepare(itemId: EntityId, targetBoardId: EntityId) {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    if (item.parentItemId) throw new RefusedError("A subitem moves with its task. Move the task instead.");
    const [source, target] = await Promise.all([this.repos.boards.getById(item.boardId), this.repos.boards.getById(targetBoardId)]);
    if (!source) throw new NotFoundError("Board", item.boardId);
    if (source.system) throw new RefusedError("Tasks on a built-in board are allocated, not moved.");
    const problem = moveTargetProblem(source, target);
    if (problem) throw new RefusedError(problem);
    const [sourceColumns, targetColumns, groups, sourceItems, targetItems] = await Promise.all([
      this.repos.boards.listColumns(source.id),
      this.repos.boards.listColumns(target!.id),
      this.repos.boards.listGroups(target!.id).then((gs) => gs.slice().sort((a, b) => a.position - b.position)),
      this.repos.items.listByBoard(source.id, { includeArchived: true }),
      this.repos.items.listByBoard(target!.id),
    ]);
    const subitems = sourceItems.filter((i) => i.parentItemId === item.id);
    const moving = [item, ...subitems];
    // Linked tasks never share a board: the move is refused onto a board that holds
    // a task linked (directly or along a chain) to this one or one of its subitems.
    const clash = await this.linkedOnBoard(moving.map((i) => i.id), target!.id);
    if (clash) throw new RefusedError(`“${clash.name}” on ${target!.name} is linked to this task, and linked tasks can't share a board. Unlink them first.`);
    const values = await this.repos.items.listValuesByItems(moving.map((i) => i.id));
    const plan = planMove({ items: moving, values, sourceColumns, targetColumns });
    return { item, source, target: target!, groups, plan, targetItems, movingIds: moving.map((i) => i.id), sourceColumnIds: new Set(sourceColumns.map((c) => c.id)) };
  }

  /** The first task on `boardId` reachable through links from any of `itemIds`, or null. */
  private async linkedOnBoard(itemIds: readonly EntityId[], boardId: EntityId): Promise<Item | null> {
    const seen = new Set<EntityId>(itemIds);
    let frontier = [...itemIds];
    while (frontier.length) {
      const links = await this.repos.links.listByItems(frontier);
      const next: EntityId[] = [];
      for (const link of links) {
        for (const id of [link.itemAId, link.itemBId]) {
          if (seen.has(id)) continue;
          seen.add(id);
          next.push(id);
        }
      }
      for (const id of next) {
        const other = await this.repos.items.getById(id);
        if (other?.boardId === boardId) return other;
      }
      frontier = next;
    }
    return null;
  }

  /**
   * A link's hand pairings and its list of unsynced fields name columns by id,
   * and the moved tasks' columns are now the target board's: each id from the
   * board left behind becomes the column it was carried to, or is dropped.
   */
  private async repointLinks(itemIds: readonly EntityId[], columnMap: Record<string, string>, sourceColumnIds: ReadonlySet<string>): Promise<void> {
    // null: a column of the board left behind that nothing on the new board took.
    const swap = (id: string): string | null => (sourceColumnIds.has(id) ? (columnMap[id] ?? null) : id);
    for (const link of await this.repos.links.listByItems([...itemIds])) {
      const pairs = link.pairs.map(([a, b]) => [swap(a), swap(b)] as const).filter((p): p is readonly [string, string] => p[0] !== null && p[1] !== null).map(([a, b]) => [a, b] as [string, string]);
      const excluded = [...new Set(link.excluded.map(swap).filter((f): f is string => f !== null))];
      const changed = JSON.stringify(pairs) !== JSON.stringify(link.pairs) || JSON.stringify(excluded) !== JSON.stringify(link.excluded);
      if (changed) await this.repos.links.update(link.id, { pairs, excluded });
    }
  }
}

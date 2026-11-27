import type { ActivityInput, Board, BoardColumn, BoardGroup, ColumnLabel, ColumnPair, ColumnValue, EntityId, Item, ItemColumnValue, ItemLink, NotificationInput } from "@/domain";
import { BUG_TICKET_PREFIX, RefusedError, formatTicket, ticketPrefixOf, LINK_FIELD_DESCRIPTION, LINK_FIELD_NAME, LINK_FIELD_TICKET, LINK_FIELD_UPDATES, columnLabels, emptyValueFor, isEmptyValue, isStuckLabel, otherEndOf, resolveColumnRoles } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { clipActivityValue, displayValue } from "./column-display";
import { mapColumns, translateValue, valuesEqual, type ColumnMappingReport, type ValueTranslation } from "./item-link-sync";
import { newId } from "@/lib/ids";
import { NotificationService } from "./notification-service";

/** A linked item as shown in the item panel. */
export interface LinkedItemView {
  link: ItemLink;
  item: Item;
  board: Board;
  group: BoardGroup | null;
  /** Set when the linked item is a subitem. */
  parent: Item | null;
  status: ColumnLabel | null;
  /** The status means "stuck" on that board, so the chip is striped. */
  statusStuck: boolean;
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

export interface LinkSearch {
  hits: LinkCandidate[];
  /** Boards already represented in the item's chain; a second item there is not allowed. */
  blockedBoardIds: EntityId[];
}

export type LinkChange =
  | { kind: "name"; name: string }
  | { kind: "description"; description: string | null }
  | { kind: "ticket"; ticket: string | null }
  | { kind: "value"; columnId: EntityId; value: ColumnValue };

export type LinkValidation = { ok: true } | { ok: false; reason: string };

export interface LinkOptions {
  /** Which side's values fill in the other's when the link is created. */
  seedFrom: "item" | "target";
  /** Fields that must not sync across this link: "name", "description", "ticket" or column ids from either board. */
  excluded?: string[];
  pairs?: ColumnPair[];
}

interface BoardBundle {
  board: Board;
  columns: BoardColumn[];
  groups: BoardGroup[];
}

/**
 * Reads shared across one sync run. Seeding a new link pushes the name, the
 * description and every value through the chain, and each of those used to
 * re-read the same links, items, boards and values — dozens of round-trips
 * against a remote database. They are read once here and reused.
 */
interface SyncCache {
  items: Map<EntityId, Item | null>;
  links: Map<EntityId, ItemLink[]>;
  bundles: Map<EntityId, BoardBundle>;
  values: Map<EntityId, ItemColumnValue[]>;
}

function newSyncCache(): SyncCache {
  return { items: new Map(), links: new Map(), bundles: new Map(), values: new Map() };
}

/** Linked tasks a change could not reach, by their boards' names. */
export interface SkippedSync {
  boardNames: string[];
  /** A field's change, or an update posted to linked tasks too. */
  what: "change" | "update";
}

/**
 * Task Linking. Links are symmetric and transitive: a change to any item in a
 * connected set is mirrored to every other item it can reach, one write per item,
 * so there is no fan-out loop. Each link can switch individual fields off, which
 * also stops that field travelling further along the chain. Subitems of a linked
 * item are never touched, and a chain never holds two items from the same board.
 */
export class ItemLinkService {
  constructor(
    private readonly repos: Repositories,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Who hears about linked tasks a change could not reach: the person may edit
   * this task but not the one it is linked to on another board. Their change
   * stands; the page says which board was not updated.
   */
  private skippedListeners = new Set<(skipped: SkippedSync) => void>();

  onSyncSkipped(listener: (skipped: SkippedSync) => void): () => void {
    this.skippedListeners.add(listener);
    return () => {
      this.skippedListeners.delete(listener);
    };
  }

  /** Tells the page about linked tasks left behind, one message per change. */
  reportSkipped(boards: readonly Board[], what: SkippedSync["what"]): void {
    const unique = [...new Map(boards.map((b) => [b.id, b])).values()];
    if (unique.length === 0) return;
    for (const listener of this.skippedListeners) listener({ boardNames: unique.map((b) => b.name), what });
  }

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
        statusStuck: stuckStatus(bundle.columns, values),
        ownerIds: ownersOf(bundle.columns, values),
        dueDate: dueDateOf(bundle.columns, values),
        mapping: own ? mapColumns(own.columns, bundle.columns, link.pairs) : { mapped: [], unmapped: [], targetOnly: [] },
      });
    }
    return views;
  }

  /** Column pairing between two boards, for the "what syncs" preview. */
  async previewMapping(boardId: EntityId, otherBoardId: EntityId): Promise<ColumnMappingReport> {
    const [a, b] = await Promise.all([this.repos.boards.listColumns(boardId), this.repos.boards.listColumns(otherBoardId)]);
    return mapColumns(a, b);
  }

  /**
   * Items on other boards whose name matches `query`. With `boardId` the whole
   * board is returned in group-then-position order for browsing; without it the
   * first `limit` hits across all boards. Boards already in the item's chain are
   * left out (and reported) because a chain may only hold one item per board.
   */
  async searchCandidates(workspaceId: EntityId, itemId: EntityId, query: string, options: { boardId?: string | null; limit?: number } = {}): Promise<LinkSearch> {
    const needle = query.trim().toLowerCase();
    const limit = options.limit ?? (options.boardId ? 500 : 40);
    const item = await this.repos.items.getById(itemId);
    if (!item) return { hits: [], blockedBoardIds: [] };
    const [boards, links, chain] = await Promise.all([this.repos.boards.listByWorkspace(workspaceId), this.repos.links.listByItem(itemId), this.chainItems(itemId)]);
    const linkedIds = new Set(links.map((l) => otherEndOf(l, itemId)));
    const blockedBoardIds = [...new Set(chain.map((i) => i.boardId))];
    const blocked = new Set(blockedBoardIds);
    const hits: LinkCandidate[] = [];
    for (const board of boards) {
      if (board.archivedAt !== null || blocked.has(board.id)) continue;
      // The allocation queue is never a link target. What sits there is a
      // request waiting for a team, and `validate` refuses it either way
      // round — offering it here would only be a list of errors in waiting.
      if (board.system === "TASK_ALLOCATION") continue;
      if (options.boardId && board.id !== options.boardId) continue;
      // Names first: a board with nothing matching costs one read, not four.
      const items = await this.repos.items.listByBoard(board.id);
      const hasMatch = needle ? items.some((c) => c.name.toLowerCase().includes(needle)) : items.length > 0;
      if (!hasMatch) continue;

      const [columns, groups] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.boards.listGroups(board.id)]);
      const groupOrder = new Map(groups.map((g) => [g.id, g.position]));
      const ordered = [...items].sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) || a.position - b.position);
      const matches = needle ? ordered.filter((c) => c.name.toLowerCase().includes(needle)) : ordered;

      // One read for the board's values rather than one per candidate: this runs
      // on every keystroke in the link dialog, and again when linking invalidates
      // the query, so a per-item read turns into hundreds of round-trips.
      const byItem = new Map<EntityId, ItemColumnValue[]>();
      for (const value of await this.repos.items.listValuesByBoard(board.id)) {
        const list = byItem.get(value.itemId);
        if (list) list.push(value);
        else byItem.set(value.itemId, [value]);
      }

      for (const candidate of matches) {
        hits.push({
          item: candidate,
          board,
          group: groups.find((g) => g.id === candidate.groupId) ?? null,
          parent: candidate.parentItemId ? (items.find((i) => i.id === candidate.parentItemId) ?? null) : null,
          status: statusOf(columns, byItem.get(candidate.id) ?? []),
          linked: linkedIds.has(candidate.id),
        });
        if (hits.length >= limit) return { hits, blockedBoardIds };
      }
    }
    return { hits, blockedBoardIds };
  }

  // ---- Link / unlink -------------------------------------------------------

  async validate(itemId: EntityId, targetId: EntityId): Promise<LinkValidation> {
    if (itemId === targetId) return { ok: false, reason: "An item cannot be linked to itself." };
    const [item, target] = await Promise.all([this.repos.items.getById(itemId), this.repos.items.getById(targetId)]);
    if (!item || !target) return { ok: false, reason: "One of the items no longer exists." };
    if (item.parentItemId === targetId || target.parentItemId === itemId) return { ok: false, reason: "An item cannot be linked to its own subitem." };
    if (item.boardId === target.boardId) return { ok: false, reason: "Linked items must live on different boards." };
    const [boardA, boardB] = await Promise.all([this.repos.boards.getById(item.boardId), this.repos.boards.getById(target.boardId)]);
    if (!boardA || !boardB) return { ok: false, reason: "One of the boards no longer exists." };
    if (boardA.workspaceId !== boardB.workspaceId) return { ok: false, reason: "Items can only be linked within the same space." };
    // A request waiting in the allocation queue is not work yet — it is a
    // question about who should do it. Linking it would mirror it onto a
    // team's board while it still sits here, which is the copy allocation
    // exists to avoid: allocating *moves* the request, and a link would leave
    // a second one behind, kept in step for ever. Allocate it first.
    const queued = boardA.system === "TASK_ALLOCATION" ? item : boardB.system === "TASK_ALLOCATION" ? target : null;
    if (queued) return { ok: false, reason: `“${queued.name}” is still waiting to be allocated. Place it with a team first, then link it.` };
    const links = await this.repos.links.listByItem(itemId);
    if (links.some((l) => otherEndOf(l, itemId) === targetId)) return { ok: false, reason: "These items are already linked." };

    // Joining the two chains must not put two items on one board — they would
    // just be duplicates of each other kept in lock-step.
    // Both sides at once: each walk is a couple of round-trips and they are independent.
    const chain = (await Promise.all([this.chainItems(itemId), this.chainItems(targetId)])).flat();
    const seen = new Map<EntityId, Item>();
    for (const member of chain) {
      const clash = seen.get(member.boardId);
      if (clash && clash.id !== member.id) {
        const board = await this.repos.boards.getById(member.boardId);
        return { ok: false, reason: `This would put two linked items on ${board?.name ?? "the same board"} (${clash.name} and ${member.name}).` };
      }
      seen.set(member.boardId, member);
    }
    return { ok: true };
  }

  async link(itemId: EntityId, targetId: EntityId, actorId: EntityId, options: LinkOptions = { seedFrom: "item" }): Promise<ItemLink> {
    // Validation and the link itself need the same rows; read them once, in parallel.
    const [valid, item, target, existingLinks] = await Promise.all([
      this.validate(itemId, targetId),
      this.getItem(itemId),
      this.getItem(targetId),
      this.repos.links.listByItems([itemId, targetId]),
    ]);
    if (!valid.ok) throw new Error(valid.reason);
    const [boardA, boardB] = await Promise.all([this.getBoard(item.boardId), this.getBoard(target.boardId)]);
    /** With no links on either side, the new pair is the whole chain. */
    const isolatedPair = existingLinks.length === 0;

    const link = await this.repos.links.create({
      workspaceId: boardA.workspaceId,
      itemIds: [itemId, targetId],
      createdBy: actorId,
      excluded: options.excluded ?? [],
      pairs: options.pairs ?? [],
    });
    // Whoever owned the target before seeding is told their item is now mirrored.
    const targetOwners = await this.ownersOf(target);

    const [source, dest] = options.seedFrom === "item" ? [item, target] : [target, item];
    await this.fillFrom(source, dest, new Set(link.excluded), link.pairs);
    // fillFrom already made these two agree. Only when one side was part of a
    // longer chain does the merged state have to travel further.
    if (!isolatedPair) await this.resyncFrom(source.id, actorId);

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
    if (notifications.length) await this.notifications.deliver(notifications);
    return link;
  }

  /**
   * Changes which fields a link carries. Fields switched back on are filled in
   * from `fromItemId`'s side (non-destructively) so the pair agrees again.
   */
  async setExcluded(linkId: EntityId, excluded: string[], fromItemId: EntityId, actorId: EntityId): Promise<ItemLink> {
    const before = await this.repos.links.getById(linkId);
    if (!before) throw new NotFoundError("ItemLink", linkId);
    const link = await this.repos.links.update(linkId, { excluded: [...new Set(excluded)] });
    const reenabled = before.excluded.filter((f) => !link.excluded.includes(f));
    if (reenabled.length > 0) {
      const source = await this.getItem(fromItemId);
      const dest = await this.getItem(otherEndOf(link, fromItemId));
      // Fill only the fields that just came back: everything still excluded stays put.
      await this.fillFrom(source, dest, new Set(link.excluded), link.pairs);
      await this.resyncFrom(source.id, actorId);
    }
    return link;
  }

  /**
   * Sets the hand-made column pairings for a link, and fills in whatever they
   * just connected from `fromItemId`'s side.
   *
   * A pairing is only worth making because the two columns should already have
   * been agreeing, so the fill is not optional: without it the pair would be
   * joined and still showing two different values until somebody edited one.
   */
  async setPairs(linkId: EntityId, pairs: ColumnPair[], fromItemId: EntityId, actorId: EntityId): Promise<ItemLink> {
    const before = await this.repos.links.getById(linkId);
    if (!before) throw new NotFoundError("ItemLink", linkId);
    const key = (p: ColumnPair) => [...p].sort().join(":");
    const had = new Set(before.pairs.map(key));
    const link = await this.repos.links.update(linkId, { pairs });
    if (link.pairs.some((p) => !had.has(key(p)))) {
      const source = await this.getItem(fromItemId);
      const dest = await this.getItem(otherEndOf(link, fromItemId));
      await this.fillFrom(source, dest, new Set(link.excluded), link.pairs);
      await this.resyncFrom(source.id, actorId);
    }
    return link;
  }

  async unlink(linkId: EntityId, actorId: EntityId): Promise<void> {
    const link = await this.repos.links.getById(linkId);
    if (!link) return;
    await this.repos.links.delete(linkId);
    // Removing a link takes the right to edit both tasks; a refusal deletes nothing and says nothing.
    if (await this.repos.links.getById(linkId)) throw new RefusedError("Only someone who can edit both tasks can unlink them.");
    const [a, b] = await Promise.all([this.repos.items.getById(link.itemAId), this.repos.items.getById(link.itemBId)]);
    if (!a || !b) return;
    const [boardA, boardB] = await Promise.all([this.repos.boards.getById(a.boardId), this.repos.boards.getById(b.boardId)]);
    if (!boardA || !boardB) return;
    await this.repos.activities.createMany([linkActivity("ITEM_UNLINKED", a, boardA, b, boardB, actorId), linkActivity("ITEM_UNLINKED", b, boardB, a, boardA, actorId)]);
    // The older task keeps the ticket; the pair is stored in id order, so which end is "a" says nothing.
    const [keeper, other, otherBoard] = Date.parse(b.createdAt) < Date.parse(a.createdAt) ? [b, a, boardA] : [a, b, boardB];
    // The link is already gone; a ticket that could not be split is not a failed unlink.
    await this.splitTicket(keeper, other, otherBoard).catch((error: unknown) => console.error("Could not give the unlinked task its own ticket", error));
  }

  /**
   * One ticket is one piece of work (TicketService). A link that carried it is
   * gone, so unless the two are still joined some other way, the newer side
   * (and whatever is still linked to it on that ticket) takes the next ticket
   * in the series and the older task keeps its own.
   */
  private async splitTicket(keeper: Item, other: Item, otherBoard: Board): Promise<void> {
    if (!keeper.ticket || keeper.ticket !== other.ticket) return;
    if ((await this.ticketChainIds(keeper.id)).includes(other.id)) return;
    const holders = [other.id, ...(await this.ticketChainIds(other.id))];
    // All of them or none: tasks still linked to each other must not end up on two tickets.
    if (!(await Promise.all(holders.map((id) => this.repos.items.canEdit(id)))).every(Boolean)) return;
    const workspace = await this.repos.workspaces.getById(otherBoard.workspaceId);
    if (!workspace) return;
    const ticket =
      otherBoard.system === "APP_DEVELOPMENT"
        ? formatTicket(BUG_TICKET_PREFIX, await this.repos.workspaces.allocateBugTicketNumbers(workspace.id, 1))
        : formatTicket(ticketPrefixOf(workspace.ticketPrefix), await this.repos.workspaces.allocateTicketNumbers(workspace.id, 1));
    for (const id of holders) {
      const item = await this.repos.items.getById(id);
      if (item?.ticket === keeper.ticket) await this.repos.items.update(id, { ticket });
    }
  }

  // ---- Sync ----------------------------------------------------------------

  /** Every item reachable through links from `itemId`, excluding itself. */
  async connectedItemIds(itemId: EntityId): Promise<EntityId[]> {
    return (await this.chainItems(itemId)).filter((i) => i.id !== itemId).map((i) => i.id);
  }

  /**
   * Items that share their Updates thread with this one. An edge that switched
   * updates off is not crossed, so the thread stops there for anything beyond it —
   * the same rule the field sync follows.
   */
  async updatesChainIds(itemId: EntityId): Promise<EntityId[]> {
    const seen = new Set<EntityId>([itemId]);
    const queue = [itemId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const link of await this.repos.links.listByItem(current)) {
        if (link.excluded.includes(LINK_FIELD_UPDATES)) continue;
        const other = otherEndOf(link, current);
        if (seen.has(other)) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    seen.delete(itemId);
    return [...seen];
  }

  /**
   * Items entitled to hold the same ticket as this one.
   *
   * The same walk the Updates thread does, across links that carry the ticket:
   * those tasks are one piece of work seen from several boards and answering to
   * one code is the point. A link told not to carry it is not crossed, and
   * whatever lies beyond is a different task that must have a ticket of its own.
   */
  async ticketChainIds(itemId: EntityId): Promise<EntityId[]> {
    const seen = new Set<EntityId>([itemId]);
    const queue = [itemId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const link of await this.repos.links.listByItem(current)) {
        if (link.excluded.includes(LINK_FIELD_TICKET)) continue;
        const other = otherEndOf(link, current);
        if (seen.has(other)) continue;
        seen.add(other);
        queue.push(other);
      }
    }
    seen.delete(itemId);
    return [...seen];
  }

  /**
   * The item plus everything reachable through links, regardless of field
   * exclusions. Each round reads the links of a whole level at once: chains are
   * short but every round-trip costs real time against a remote database.
   */
  private async chainItems(itemId: EntityId): Promise<Item[]> {
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
    return this.repos.items.listByIds([...seen]);
  }

  /** Pushes every field of `itemId` through its links without recording activity (used after linking). */
  private async resyncFrom(itemId: EntityId, actorId: EntityId): Promise<void> {
    const item = await this.getItem(itemId);
    const cache = newSyncCache();
    const collect: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> = [];
    const options = { silent: true, cache, collect };
    await this.propagate(item.id, { kind: "name", name: item.name }, actorId, options);
    await this.propagate(item.id, { kind: "description", description: item.description }, actorId, options);
    await this.propagate(item.id, { kind: "ticket", ticket: item.ticket ?? null }, actorId, options);
    for (const v of await this.valuesOf(item.id, cache)) {
      await this.propagate(item.id, { kind: "value", columnId: v.columnId, value: v.value }, actorId, options);
    }
    if (collect.length) await this.repos.items.setValues(collect);
  }

  /**
   * Mirrors one change from `originId` onto every linked item it can reach.
   * Links are walked edge by edge: an edge that excludes the changed field is not
   * crossed, so the field also stops there for anything beyond it. Returns the
   * boards that received a write. `silent` suppresses activity entries.
   */
  async propagate(
    originId: EntityId,
    change: LinkChange,
    actorId: EntityId,
    options: { silent?: boolean; cache?: SyncCache; collect?: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> } = {},
  ): Promise<EntityId[]> {
    const cache = options.cache ?? newSyncCache();
    const origin = await this.getItem(originId);
    const boards = cache.bundles;
    const originBundle = await this.bundle(origin.boardId, boards);
    if (!originBundle) return [];
    const originColumn = change.kind === "value" ? (originBundle.columns.find((c) => c.id === change.columnId) ?? null) : null;
    if (change.kind === "value" && !originColumn) return [];

    const users = change.kind === "value" && !options.silent ? await this.repos.users.list() : [];
    const touched = new Set<EntityId>();
    const activities: ActivityInput[] = [];
    const skipped: Board[] = [];

    // Breadth-first over links, remembering which column the change lives in at each hop.
    const visited = new Set<EntityId>([origin.id]);
    const queue: Array<{ item: Item; bundle: BoardBundle; column: BoardColumn | null }> = [{ item: origin, bundle: originBundle, column: originColumn }];

    while (queue.length) {
      const node = queue.shift()!;
      for (const link of await this.linksOf(node.item.id, cache)) {
        const nextId = otherEndOf(link, node.item.id);
        if (visited.has(nextId)) continue;
        const excluded = new Set(link.excluded);
        if (change.kind === "name" && excluded.has(LINK_FIELD_NAME)) continue;
        if (change.kind === "description" && excluded.has(LINK_FIELD_DESCRIPTION)) continue;
        if (change.kind === "ticket" && excluded.has(LINK_FIELD_TICKET)) continue;

        const next = await this.itemOf(nextId, cache);
        if (!next) continue;
        const bundle = await this.bundle(next.boardId, boards);
        if (!bundle) continue;

        let nextColumn: BoardColumn | null = null;
        if (change.kind === "value") {
          const pair = node.column ? mapColumns(node.bundle.columns, bundle.columns, link.pairs).mapped.find((m) => m.source.id === node.column!.id) : undefined;
          if (!pair || excluded.has(pair.source.id) || excluded.has(pair.target.id)) continue;
          nextColumn = pair.target;
        }

        visited.add(nextId);
        queue.push({ item: next, bundle, column: nextColumn });
        // A linked task the person may not edit (it is on a board they only
        // view): their own change stands, this one is left as it was.
        const attempt = async (write: () => Promise<unknown>): Promise<boolean> => {
          try {
            await write();
            return true;
          } catch (error) {
            console.warn("A linked task was not updated", error);
            skipped.push(bundle.board);
            return false;
          }
        };

        if (change.kind === "name") {
          if (next.name === change.name) continue;
          if (!(await attempt(() => this.repos.items.update(next.id, { name: change.name })))) continue;
          touched.add(next.boardId);
          if (!options.silent) {
            activities.push({
              workspaceId: bundle.board.workspaceId,
              boardId: next.boardId,
              itemId: next.id,
              actorId,
              eventType: "ITEM_RENAMED",
              metadata: { from: next.name, to: change.name, itemName: change.name, syncedFrom: origin.name },
            });
          }
          continue;
        }

        if (change.kind === "description") {
          if ((next.description ?? null) === (change.description ?? null)) continue;
          if (!(await attempt(() => this.repos.items.update(next.id, { description: change.description })))) continue;
          touched.add(next.boardId);
          continue;
        }

        if (change.kind === "ticket") {
          if (!change.ticket || (next.ticket ?? null) === change.ticket) continue;
          if (!(await attempt(() => this.repos.items.update(next.id, { ticket: change.ticket })))) continue;
          touched.add(next.boardId);
          continue;
        }

        const translated = await this.translateCarryingLabel(change.value, originColumn!, nextColumn!);
        if (translated.kind === "skip") continue;
        const existingValues = await this.valuesOf(next.id, cache);
        const existing = existingValues.find((v) => v.columnId === nextColumn!.id);
        if (valuesEqual(existing?.value, translated.value)) continue;
        if (options.collect) {
          // Seeding a link pushes every value at once; the caller writes them in
          // one statement instead of one round-trip per value.
          options.collect.push({ itemId: next.id, columnId: nextColumn!.id, value: translated.value });
        } else if (!(await attempt(() => this.repos.items.setValue(next.id, nextColumn!.id, translated.value)))) {
          continue;
        }
        // Keep the cache honest for the rest of the run.
        cache.values.set(next.id, [
          ...existingValues.filter((v) => v.columnId !== nextColumn!.id),
          { id: existing?.id ?? "", itemId: next.id, columnId: nextColumn!.id, value: translated.value, updatedAt: new Date().toISOString() },
        ]);
        touched.add(next.boardId);
        if (!options.silent) {
          // In full to tell a change from a non-change, short to record it.
          const before = displayValue(nextColumn!, existing?.value ?? emptyValueFor(nextColumn!.type), users);
          const after = displayValue(nextColumn!, translated.value, users);
          const from = clipActivityValue(before);
          const to = clipActivityValue(after);
          if (before !== after) {
            activities.push({
              workspaceId: bundle.board.workspaceId,
              boardId: next.boardId,
              itemId: next.id,
              actorId,
              eventType: "ITEM_COLUMN_VALUE_UPDATED",
              metadata: { itemName: next.name, columnName: nextColumn!.name, columnType: nextColumn!.type, from, to, syncedFrom: origin.name },
            });
          }
        }
      }
    }

    // Recorded where the person may record it; the writes themselves have landed.
    if (activities.length) await this.repos.activities.createMany(activities).catch((error) => console.warn("A linked task's history entry was not written", error));
    if (!options.silent) this.reportSkipped(skipped, "change");
    return [...touched];
  }

  // ---- Helpers -------------------------------------------------------------

  /**
   * Makes a freshly linked pair agree without destroying anything: `source` wins
   * wherever it has a value, and `dest` fills the gaps `source` left empty.
   * Excluded fields are left exactly as they are on both sides.
   */
  private async fillFrom(source: Item, dest: Item, excluded: ReadonlySet<string>, pairs: readonly ColumnPair[] = []): Promise<void> {
    if (!excluded.has(LINK_FIELD_NAME) && dest.name !== source.name) await this.repos.items.update(dest.id, { name: source.name });
    if (!excluded.has(LINK_FIELD_TICKET)) {
      // The code travels the way a name does — the source wins — but an empty
      // source never wipes a code the other task already answers to.
      if (source.ticket && dest.ticket !== source.ticket) await this.repos.items.update(dest.id, { ticket: source.ticket });
      else if (!source.ticket && dest.ticket) await this.repos.items.update(source.id, { ticket: dest.ticket });
    }
    if (!excluded.has(LINK_FIELD_DESCRIPTION)) {
      if (source.description && dest.description !== source.description) await this.repos.items.update(dest.id, { description: source.description });
      else if (!source.description && dest.description) await this.repos.items.update(source.id, { description: dest.description });
    }

    const [sourceColumns, destColumns] = await Promise.all([this.repos.boards.listColumns(source.boardId), this.repos.boards.listColumns(dest.boardId)]);
    const [sourceValues, destValues] = await Promise.all([this.repos.items.listValuesByItem(source.id), this.repos.items.listValuesByItem(dest.id)]);
    const writes: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> = [];
    for (const { source: sc, target: dc } of mapColumns(sourceColumns, destColumns, pairs).mapped) {
      if (excluded.has(sc.id) || excluded.has(dc.id)) continue;
      const sv = sourceValues.find((v) => v.columnId === sc.id)?.value;
      const dv = destValues.find((v) => v.columnId === dc.id)?.value;
      if (!isEmptyValue(sv)) {
        const t = await this.translateCarryingLabel(sv!, sc, dc);
        if (t.kind === "value" && !valuesEqual(dv, t.value)) writes.push({ itemId: dest.id, columnId: dc.id, value: t.value });
      } else if (!isEmptyValue(dv)) {
        const t = await this.translateCarryingLabel(dv!, dc, sc);
        if (t.kind === "value" && !valuesEqual(sv, t.value)) writes.push({ itemId: source.id, columnId: sc.id, value: t.value });
      }
    }
    if (writes.length) await this.repos.items.setValues(writes);
  }

  /**
   * translateValue, except that a status or dropdown label the paired column
   * does not have yet is added to it first, with the same name and colour, so
   * the value lands instead of being skipped: two boards linked after they
   * were set up seldom have the same labels (a Format of "Photo essay" on one,
   * "Speaker card" on the other). The column object is updated in place, so
   * the rest of a sync run sees the new label. Someone who may not edit that
   * board cannot add to its column either: then the value is skipped, as before.
   */
  private async translateCarryingLabel(value: ColumnValue, source: BoardColumn, target: BoardColumn): Promise<ValueTranslation> {
    const first = translateValue(value, source, target);
    if (first.kind === "value") return first;
    if ((value.type !== "STATUS" && value.type !== "DROPDOWN") || !value.labelId) return first;
    if ((target.settings.kind !== "status" && target.settings.kind !== "dropdown") || target.type !== source.type) return first;
    const label = columnLabels(source).find((l) => l.id === value.labelId);
    if (!label) return first;
    const added: ColumnLabel = { id: newId(), name: label.name, color: label.color };
    try {
      const updated = await this.repos.boards.updateColumn(target.id, { settings: { ...target.settings, labels: [...target.settings.labels, added] } });
      Object.assign(target, updated);
    } catch (error) {
      console.warn("A label could not be added to a linked board's column", error);
      return first;
    }
    return translateValue(value, source, target);
  }

  /** Links touching an item, read once per sync run. */
  private async linksOf(itemId: EntityId, cache: SyncCache): Promise<ItemLink[]> {
    const hit = cache.links.get(itemId);
    if (hit) return hit;
    const links = await this.repos.links.listByItem(itemId);
    cache.links.set(itemId, links);
    return links;
  }

  /** Pre-loads the links of a whole chain in one read, so later lookups are free. */
  private async warmLinks(itemIds: readonly EntityId[], cache: SyncCache): Promise<void> {
    const missing = itemIds.filter((id) => !cache.links.has(id));
    if (missing.length === 0) return;
    const links = await this.repos.links.listByItems(missing);
    for (const id of missing) {
      cache.links.set(
        id,
        links.filter((l) => l.itemAId === id || l.itemBId === id),
      );
    }
  }

  private async itemOf(itemId: EntityId, cache: SyncCache): Promise<Item | null> {
    if (cache.items.has(itemId)) return cache.items.get(itemId) ?? null;
    const item = await this.repos.items.getById(itemId);
    cache.items.set(itemId, item);
    return item;
  }

  private async valuesOf(itemId: EntityId, cache: SyncCache): Promise<ItemColumnValue[]> {
    const hit = cache.values.get(itemId);
    if (hit) return hit;
    const values = await this.repos.items.listValuesByItem(itemId);
    cache.values.set(itemId, values);
    return values;
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
    metadata: { itemName: item.name, linkedItemName: other.name, linkedBoardName: otherBoard.name, linkedItemId: other.id, linkedBoardId: otherBoard.id },
  };
}

function statusOf(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): ColumnLabel | null {
  const column = columns.find((c) => c.type === "STATUS");
  if (!column) return null;
  const v = values.find((x) => x.columnId === column.id)?.value;
  return v?.type === "STATUS" ? (columnLabels(column).find((l) => l.id === v.labelId) ?? null) : null;
}

function stuckStatus(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): boolean {
  const column = columns.find((c) => c.type === "STATUS");
  const v = column ? values.find((x) => x.columnId === column.id)?.value : undefined;
  return v?.type === "STATUS" && isStuckLabel(column, v.labelId);
}

function ownersOf(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): EntityId[] {
  const personIds = new Set(columns.filter((c) => c.type === "PERSON").map((c) => c.id));
  const ids = new Set<EntityId>();
  for (const v of values) if (personIds.has(v.columnId) && v.value.type === "PERSON") v.value.userIds.forEach((id) => ids.add(id));
  return [...ids];
}

function dueDateOf(columns: readonly BoardColumn[], values: readonly ItemColumnValue[]): string | null {
  const date = resolveColumnRoles(columns).dueDate;
  const dv = date ? values.find((x) => x.columnId === date.id)?.value : undefined;
  if (dv?.type === "DATE" && dv.date) return dv.date;
  const timeline = columns.find((c) => c.type === "TIMELINE");
  const tv = timeline ? values.find((x) => x.columnId === timeline.id)?.value : undefined;
  return tv?.type === "TIMELINE" ? tv.end : null;
}

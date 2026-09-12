import type {
  ActivityInput,
  ArchiveLinkImpact,
  ArchiveLinkPolicy,
  ArchiveQuery,
  ArchiveRequest,
  Board,
  BoardColumn,
  BoardGroup,
  ColumnValue,
  EntityId,
  Item,
  ItemColumnValue,
  ItemLink,
  NotificationInput,
  User,
} from "@/domain";
import { EMPTY_ARCHIVE_LINK_IMPACT, emptyValueFor, normaliseItemReference, otherEndOf } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { clipActivityValue, displayValue } from "./column-display";
import type { ItemLinkService } from "./item-link-service";
import { NotificationService } from "./notification-service";

/**
 * One page of a board's archive, in the shape the board's own screens read.
 *
 * Everything a trimmed-down board needs is here — its groups so a row can say
 * where it would go back to, its columns so the cells render, and the values and
 * links of the rows on this page and no others. `total` is the whole filtered
 * archive, which is what the pager counts; `items` is what came back for the
 * page asked for.
 */
export interface ArchiveSnapshot extends BoardSnapshot {
  total: number;
  page: number;
  pageSize: number;
  /**
   * An item asked for by id that the page does not hold — a link followed
   * straight to an archived task. It travels in `items` so the panel can open
   * it, and is named here so the table can leave it out of the page.
   */
  focusItemId: EntityId | null;
}

export interface BoardSnapshot {
  board: Board;
  groups: BoardGroup[];
  columns: BoardColumn[];
  items: Item[];
  values: ItemColumnValue[];
  /** Task links touching any item on the board. */
  links: ItemLink[];
}

export interface CreateItemInput {
  /** Supplied by the optimistic UI so the rendered row keeps its id. */
  id?: EntityId;
  boardId: EntityId;
  groupId: EntityId;
  name: string;
  parentItemId?: EntityId | null;
  /** Insert after this item (same group). Appends when omitted. */
  afterItemId?: EntityId | null;
  /**
   * Exact position among its siblings. A caller creating several children of a
   * brand-new parent knows them up front, which saves a sibling lookup per item
   * and lets the children be written in parallel. Ignored when `afterItemId` is set.
   */
  position?: number;
  description?: string | null;
  /** The booking code (ID#). Only the booking process sets one. */
  reference?: string | null;
  /** Initial values, e.g. a status when creating from a Kanban lane. */
  values?: Array<{ columnId: EntityId; value: ColumnValue }>;
}

export interface SetValueContext {
  column: BoardColumn;
  item: Item;
  board: Board;
  /** Users, used to render names in activity/notifications. */
  users: readonly User[];
}

export interface MoveItemInput {
  boardId: EntityId;
  itemId: EntityId;
  toGroupId: EntityId;
  /** Ordered item ids (top-level, same group) after the move. */
  orderedIdsInTargetGroup: EntityId[];
  /** Ordered item ids in the source group after the move (when different). */
  orderedIdsInSourceGroup?: EntityId[];
}

/**
 * Turns the filters as the screen holds them into the filters a row store can
 * answer: which column each one applies to, and what it has to say.
 *
 * A filter whose board has no such column is dropped rather than left to match
 * nothing - the board cannot answer it either way, and a filter that silently
 * empties the list is worse than one that is not there. Status and priority
 * read the board's first column of that type, which is the column its own
 * filters read.
 */
export function resolveArchiveFilters(request: ArchiveRequest, columns: readonly BoardColumn[]): Pick<ArchiveQuery, "search" | "groupIds" | "status" | "priority" | "people" | "tags"> {
  const { filters } = request;
  const statusColumn = columns.find((c) => c.type === "STATUS") ?? null;
  const priorityColumn = columns.find((c) => c.type === "PRIORITY") ?? null;
  const personColumns = columns.filter((c) => c.type === "PERSON").map((c) => c.id);
  const tagColumns = columns.filter((c) => c.type === "TAGS").map((c) => c.id);
  return {
    search: request.search,
    groupIds: filters.groupIds,
    status: statusColumn && filters.statusIds.length > 0 ? { columnId: statusColumn.id, labelIds: filters.statusIds } : null,
    priority: priorityColumn && filters.priorityIds.length > 0 ? { columnId: priorityColumn.id, labelIds: filters.priorityIds } : null,
    people: personColumns.length > 0 && filters.personIds.length > 0 ? { columnIds: personColumns, userIds: filters.personIds } : null,
    tags: tagColumns.length > 0 && filters.tags.length > 0 ? { columnIds: tagColumns, values: filters.tags } : null,
  };
}

export class ItemService {
  constructor(
    private readonly repos: Repositories,
    /** Mirrors name, description and value changes onto linked items. */
    private readonly links: ItemLinkService,
    /** Applies each recipient's preferences to what gets written. */
    private readonly notifications: NotificationService,
  ) {}

  async loadBoardSnapshot(boardId: EntityId): Promise<BoardSnapshot> {
    const board = await this.repos.boards.getById(boardId);
    if (!board) throw new NotFoundError("Board", boardId);
    const [groups, columns, items, values] = await Promise.all([
      this.repos.boards.listGroups(boardId),
      this.repos.boards.listColumns(boardId),
      this.repos.items.listByBoard(boardId),
      this.repos.items.listValuesByBoard(boardId),
    ]);
    const links = await this.repos.links.listByItems(items.map((i) => i.id));
    return { board, groups, columns, items, values, links };
  }

  async getItem(itemId: EntityId): Promise<Item> {
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    return item;
  }

  async createItem(input: CreateItemInput, actorId: EntityId): Promise<Item> {
    const name = input.name.trim();
    if (!name) throw new Error("Item name cannot be empty");
    const board = await this.repos.boards.getById(input.boardId);
    if (!board) throw new NotFoundError("Board", input.boardId);
    let position = input.position ?? 0;
    if (input.position === undefined || input.afterItemId) {
      const siblings = (await this.repos.items.listByBoard(input.boardId)).filter(
        (i) => i.groupId === input.groupId && (i.parentItemId ?? null) === (input.parentItemId ?? null),
      );
      // After the last sibling by position, not by count: positions go sparse
      // once items are deleted or moved, and a count would land the new row mid-list.
      position = siblings.length ? Math.max(...siblings.map((i) => i.position)) + 1 : 0;
      if (input.afterItemId) {
        const after = siblings.find((i) => i.id === input.afterItemId);
        if (after) {
          position = after.position + 1;
          const shifted = siblings.filter((i) => i.position >= position);
          await this.repos.items.updateMany(shifted.map((i) => ({ id: i.id, patch: { position: i.position + 1 } })));
        }
      }
    }

    const item = await this.repos.items.create({
      id: input.id,
      boardId: input.boardId,
      groupId: input.groupId,
      parentItemId: input.parentItemId ?? null,
      name,
      description: input.description ?? null,
      reference: normaliseItemReference(input.reference),
      createdBy: actorId,
      position,
    });

    // Default status label and any explicit initial values. Written only where
    // no value exists yet: the row is already on screen while this runs, and a
    // status the user picks in that moment must not be undone by the default
    // arriving a network round trip later.
    const columns = await this.repos.boards.listColumns(input.boardId);
    const initial: Array<{ itemId: EntityId; columnId: EntityId; value: ColumnValue }> = [];
    for (const column of columns) {
      const explicit = input.values?.find((v) => v.columnId === column.id);
      if (explicit) {
        initial.push({ itemId: item.id, columnId: column.id, value: explicit.value });
      } else if (column.settings.kind === "status" && column.settings.defaultLabelId) {
        initial.push({ itemId: item.id, columnId: column.id, value: { type: "STATUS", labelId: column.settings.defaultLabelId } });
      }
    }
    if (initial.length) await this.repos.items.setValuesIfAbsent(initial);

    const group = (await this.repos.boards.listGroups(input.boardId)).find((g) => g.id === input.groupId);
    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId: board.id,
      itemId: item.id,
      actorId,
      eventType: "ITEM_CREATED",
      metadata: { itemName: item.name, boardName: board.name, groupName: group?.name },
    });
    return item;
  }

  async renameItem(itemId: EntityId, name: string, actorId: EntityId): Promise<Item> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Item name cannot be empty");
    const before = await this.getItem(itemId);
    if (before.name === trimmed) return before;
    const item = await this.repos.items.update(itemId, { name: trimmed });
    const board = await this.repos.boards.getById(item.boardId);
    await this.repos.activities.create({
      workspaceId: board?.workspaceId ?? "",
      boardId: item.boardId,
      itemId,
      actorId,
      eventType: "ITEM_RENAMED",
      metadata: { from: before.name, to: trimmed, itemName: trimmed },
    });
    await this.links.propagate(itemId, { kind: "name", name: trimmed }, actorId);
    return item;
  }

  /** Sets or clears the cover image URL. Covers are per item and do not sync to linked items. */
  async updateCover(itemId: EntityId, coverUrl: string | null): Promise<Item> {
    return this.repos.items.update(itemId, { coverUrl });
  }

  async updateDescription(itemId: EntityId, description: string | null, actorId: EntityId): Promise<Item> {
    const next = description?.trim() || null;
    const item = await this.repos.items.update(itemId, { description: next });
    await this.links.propagate(itemId, { kind: "description", description: next }, actorId);
    return item;
  }

  /**
   * Sets the booking code by hand. Booking hands one out on its own, but a task
   * that arrived another way — or one whose code was mistyped into an email —
   * can be given the right one here. It travels the links the same way a rename
   * does, so a task and its copy keep answering to the same code.
   */
  async updateReference(itemId: EntityId, reference: string | null, actorId: EntityId): Promise<Item> {
    const next = normaliseItemReference(reference);
    const item = await this.repos.items.update(itemId, { reference: next });
    await this.links.propagate(itemId, { kind: "reference", reference: next }, actorId);
    return item;
  }

  async setValue(itemId: EntityId, columnId: EntityId, value: ColumnValue, ctx: SetValueContext, actorId: EntityId): Promise<ItemColumnValue> {
    const existing = (await this.repos.items.listValuesByItem(itemId)).find((v) => v.columnId === columnId);
    const result = await this.repos.items.setValue(itemId, columnId, value);
    await this.links.propagate(itemId, { kind: "value", columnId, value }, actorId);

    // Compared in full and quoted short: two briefs that differ in their last
    // paragraph read the same for eighty characters, and clipping before the
    // comparison would drop the edit from the record altogether.
    const before = displayValue(ctx.column, existing?.value ?? emptyValueFor(ctx.column.type), ctx.users);
    const after = displayValue(ctx.column, value, ctx.users);
    if (before === after) return result;
    const from = clipActivityValue(before);
    const to = clipActivityValue(after);

    const activity: ActivityInput = {
      workspaceId: ctx.board.workspaceId,
      boardId: ctx.board.id,
      itemId,
      actorId,
      eventType: "ITEM_COLUMN_VALUE_UPDATED",
      metadata: { itemName: ctx.item.name, columnName: ctx.column.name, columnType: ctx.column.type, from, to },
    };

    const notifications: NotificationInput[] = [];
    const actor = ctx.users.find((u) => u.id === actorId);
    const actorName = actor?.firstName ?? "Someone";

    if (value.type === "PERSON") {
      const beforeIds = existing?.value.type === "PERSON" ? existing.value.userIds : [];
      const added = value.userIds.filter((id) => !beforeIds.includes(id));
      const removed = beforeIds.filter((id) => !value.userIds.includes(id));
      activity.metadata = { ...activity.metadata, addedUserIds: added, removedUserIds: removed };
      for (const userId of added) {
        if (userId === actorId) continue;
        notifications.push({
          userId,
          type: "ASSIGNED",
          title: `${actorName} assigned you to ${ctx.item.name}`,
          body: ctx.board.name,
          entityType: "ITEM",
          entityId: itemId,
          boardId: ctx.board.id,
          actorId,
        });
      }
    } else {
      // Notify owners (excluding actor) about status and due date changes.
      const owners = await this.ownersOf(itemId, ctx.board.id);
      const recipients = owners.filter((id) => id !== actorId);
      if (value.type === "STATUS" && recipients.length) {
        for (const userId of recipients) {
          notifications.push({
            userId,
            type: "STATUS_CHANGED",
            title: `${ctx.item.name} is now ${to ?? "unset"}`,
            body: `${actorName} changed the status${from ? ` from ${from}` : ""}`,
            entityType: "ITEM",
            entityId: itemId,
            boardId: ctx.board.id,
            actorId,
          });
        }
      }
      if ((value.type === "DATE" || value.type === "TIMELINE") && recipients.length) {
        for (const userId of recipients) {
          notifications.push({
            userId,
            type: "DUE_DATE_CHANGED",
            title: `${ctx.column.name} changed for ${ctx.item.name}`,
            body: `${actorName} changed it${from ? ` from ${from}` : ""} to ${to ?? "none"}`,
            entityType: "ITEM",
            entityId: itemId,
            boardId: ctx.board.id,
            actorId,
          });
        }
      }
    }

    await this.repos.activities.create(activity);
    if (notifications.length) await this.notifications.deliver(notifications);
    return result;
  }

  private async ownersOf(itemId: EntityId, boardId: EntityId): Promise<EntityId[]> {
    const columns = await this.repos.boards.listColumns(boardId);
    const personColumns = new Set(columns.filter((c) => c.type === "PERSON").map((c) => c.id));
    const values = await this.repos.items.listValuesByItem(itemId);
    const ids = new Set<EntityId>();
    for (const v of values) {
      if (personColumns.has(v.columnId) && v.value.type === "PERSON") v.value.userIds.forEach((id) => ids.add(id));
    }
    return [...ids];
  }

  async moveItem(input: MoveItemInput, actorId: EntityId): Promise<void> {
    const item = await this.getItem(input.itemId);
    const groups = await this.repos.boards.listGroups(input.boardId);
    const fromGroup = groups.find((g) => g.id === item.groupId);
    const toGroup = groups.find((g) => g.id === input.toGroupId);

    const patches: Array<{ id: EntityId; patch: Partial<Item> }> = input.orderedIdsInTargetGroup.map((id, index) => ({
      id,
      patch: { position: index, groupId: input.toGroupId },
    }));
    if (input.orderedIdsInSourceGroup) {
      for (const [index, id] of input.orderedIdsInSourceGroup.entries()) patches.push({ id, patch: { position: index } });
    }
    await this.repos.items.updateMany(patches);

    // Move subitems along with their parent.
    if (item.groupId !== input.toGroupId) {
      const children = (await this.repos.items.listByBoard(input.boardId)).filter((i) => i.parentItemId === item.id);
      if (children.length) {
        await this.repos.items.updateMany(children.map((c) => ({ id: c.id, patch: { groupId: input.toGroupId } })));
      }
      const board = await this.repos.boards.getById(input.boardId);
      await this.repos.activities.create({
        workspaceId: board?.workspaceId ?? "",
        boardId: input.boardId,
        itemId: item.id,
        actorId,
        eventType: "ITEM_MOVED",
        metadata: { itemName: item.name, fromGroupName: fromGroup?.name, toGroupName: toGroup?.name },
      });
    }
  }

  async moveItemsToGroup(boardId: EntityId, itemIds: EntityId[], toGroupId: EntityId, actorId: EntityId): Promise<void> {
    const all = await this.repos.items.listByBoard(boardId);
    const groups = await this.repos.boards.listGroups(boardId);
    const toGroup = groups.find((g) => g.id === toGroupId);
    const target = all.filter((i) => i.groupId === toGroupId && i.parentItemId === null);
    let next = target.reduce((max, i) => Math.max(max, i.position), -1) + 1;
    const patches: Array<{ id: EntityId; patch: Partial<Item> }> = [];
    const activities: ActivityInput[] = [];
    const board = await this.repos.boards.getById(boardId);
    for (const id of itemIds) {
      const item = all.find((i) => i.id === id);
      if (!item || item.groupId === toGroupId) continue;
      const fromGroup = groups.find((g) => g.id === item.groupId);
      patches.push({ id, patch: { groupId: toGroupId, position: next++ } });
      for (const child of all.filter((i) => i.parentItemId === id)) patches.push({ id: child.id, patch: { groupId: toGroupId } });
      activities.push({
        workspaceId: board?.workspaceId ?? "",
        boardId,
        itemId: id,
        actorId,
        eventType: "ITEM_MOVED",
        metadata: { itemName: item.name, fromGroupName: fromGroup?.name, toGroupName: toGroup?.name },
      });
    }
    await this.repos.items.updateMany(patches);
    await this.repos.activities.createMany(activities);
  }

  async reorderSubitems(orderedIds: EntityId[]): Promise<void> {
    await this.repos.items.updateMany(orderedIds.map((id, index) => ({ id, patch: { position: index } })));
  }

  /**
   * One page of a board's archive, with everything the archive screen renders.
   *
   * The filters are resolved against the board's columns here - which column
   * holds the status is a question about this board, not about rows - and the
   * page itself is cut by the database. Values and links are then read for the
   * rows that came back and for nothing else, which is what keeps an archive of
   * any size the same size to open.
   */
  async loadArchivePage(boardId: EntityId, request: ArchiveRequest, options: { focusItemId?: EntityId | null } = {}): Promise<ArchiveSnapshot> {
    const board = await this.repos.boards.getById(boardId);
    if (!board) throw new NotFoundError("Board", boardId);
    const [groups, columns] = await Promise.all([this.repos.boards.listGroups(boardId), this.repos.boards.listColumns(boardId)]);

    const pageSize = request.pageSize;
    const page = Math.max(1, request.page);
    const { rows, total } = await this.repos.items.listArchivedPage({
      ...resolveArchiveFilters(request, columns),
      boardId,
      sort: request.sort,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    // A task reached by a link may be on any page, or on none of them once a
    // filter is on. It is what the reader asked for, so it is fetched by id and
    // travels with the page rather than being lost to the pager.
    const onPage = new Set(rows.map((i) => i.id));
    const focus = options.focusItemId && !onPage.has(options.focusItemId) ? await this.repos.items.getById(options.focusItemId) : null;
    const focusItem = focus && focus.boardId === boardId ? focus : null;
    const items = focusItem ? [...rows, focusItem] : rows;

    const [values, links] = await Promise.all([
      this.repos.items.listValuesByItems(items.map((i) => i.id)),
      this.repos.links.listByItems(items.map((i) => i.id)),
    ]);
    return { board, groups, columns, items, values, links, total, page, pageSize, focusItemId: focusItem?.id ?? null };
  }

  /** How many items a board has in its archive. For the count beside the board's Archive entry. */
  countArchived(boardId: EntityId): Promise<number> {
    return this.repos.items.countArchived(boardId);
  }

  /**
   * What archiving these items would do to the links they carry.
   *
   * A linked task is kept in step with its twin on another board. Archiving one
   * side and leaving the other is a decision, not a detail, so the screen asks -
   * and this is what it has to ask about.
   */
  async archiveLinkImpact(itemIds: EntityId[]): Promise<ArchiveLinkImpact> {
    const selected = new Set(itemIds);
    const linkedItemIds: EntityId[] = [];
    const connected = new Set<EntityId>();
    for (const itemId of itemIds) {
      const links = await this.repos.links.listByItem(itemId);
      if (links.length === 0) continue;
      linkedItemIds.push(itemId);
      for (const link of links) {
        const other = otherEndOf(link, itemId);
        if (!selected.has(other)) connected.add(other);
      }
    }
    const others = await this.repos.items.listByIds([...connected]);
    return {
      linkedItemIds,
      connectedItemIds: others.map((i) => i.id),
      connectedBoardIds: [...new Set(others.map((i) => i.boardId))],
    };
  }

  /**
   * Archives items, and settles what happens to anything linked to them.
   *
   * `cascade` puts the tasks on the other boards away too, so a set of mirrored
   * tasks leaves the boards together. `break` unlinks first, so the twins stay
   * where they are and stop following a task nobody can see. Without a policy
   * the links are left alone, which is what archiving did before there was
   * anywhere to see the result.
   */
  async archiveItems(boardId: EntityId, itemIds: EntityId[], actorId: EntityId, options: { links?: ArchiveLinkPolicy } = {}): Promise<void> {
    // Gathered before anything is archived so a chain is followed through the
    // items being put away rather than around them.
    const impact = options.links ? await this.archiveLinkImpact(itemIds) : EMPTY_ARCHIVE_LINK_IMPACT;

    if (options.links === "break") {
      for (const itemId of itemIds) {
        for (const link of await this.repos.links.listByItem(itemId)) await this.links.unlink(link.id, actorId);
      }
    }

    await this.archiveOnBoard(boardId, itemIds, actorId);

    if (options.links === "cascade") {
      const connected = await this.repos.items.listByIds(impact.connectedItemIds);
      const byBoard = new Map<EntityId, EntityId[]>();
      for (const item of connected) {
        if (item.archivedAt !== null) continue;
        byBoard.set(item.boardId, [...(byBoard.get(item.boardId) ?? []), item.id]);
      }
      for (const [otherBoardId, ids] of byBoard) await this.archiveOnBoard(otherBoardId, ids, actorId);
    }
  }

  /** Marks items archived on one board and writes that board's activity. */
  private async archiveOnBoard(boardId: EntityId, itemIds: EntityId[], actorId: EntityId): Promise<void> {
    if (itemIds.length === 0) return;
    const now = new Date().toISOString();
    const items = await this.repos.items.listByIds(itemIds);
    await this.repos.items.updateMany(itemIds.map((id) => ({ id, patch: { archivedAt: now } })));
    const board = await this.repos.boards.getById(boardId);
    await this.repos.activities.createMany(
      items.map((item) => ({
        workspaceId: board?.workspaceId ?? "",
        boardId,
        itemId: item.id,
        actorId,
        eventType: "ITEM_ARCHIVED" as const,
        metadata: { itemName: item.name },
      })),
    );
  }

  /**
   * Puts items back where they were.
   *
   * Nothing moved while they were away: an archived item keeps its group and
   * its position, and a group cannot outlive its items, so clearing the date is
   * the whole restore. Where the board has filled in around it, the position it
   * kept puts it back among the same neighbours.
   */
  async restoreItems(itemIds: EntityId[], actorId?: EntityId): Promise<void> {
    if (itemIds.length === 0) return;
    const items = await this.repos.items.listByIds(itemIds);
    await this.repos.items.updateMany(itemIds.map((id) => ({ id, patch: { archivedAt: null } })));
    if (!actorId) return;
    const boards = new Map<EntityId, Board | null>();
    for (const item of items) if (!boards.has(item.boardId)) boards.set(item.boardId, await this.repos.boards.getById(item.boardId));
    await this.repos.activities.createMany(
      items.map((item) => ({
        workspaceId: boards.get(item.boardId)?.workspaceId ?? "",
        boardId: item.boardId,
        itemId: item.id,
        actorId,
        eventType: "ITEM_RESTORED" as const,
        metadata: { itemName: item.name },
      })),
    );
  }

  async deleteItems(boardId: EntityId, itemIds: EntityId[], actorId: EntityId): Promise<void> {
    const items = await this.repos.items.listByIds(itemIds);
    const board = await this.repos.boards.getById(boardId);
    await this.repos.items.deleteMany(itemIds);
    await this.repos.activities.createMany(
      items.map((item) => ({
        workspaceId: board?.workspaceId ?? "",
        boardId,
        itemId: null,
        actorId,
        eventType: "ITEM_DELETED" as const,
        metadata: { itemName: item.name },
      })),
    );
  }

  async duplicateItem(itemId: EntityId, actorId: EntityId): Promise<Item> {
    const source = await this.getItem(itemId);
    const siblings = (await this.repos.items.listByBoard(source.boardId)).filter(
      (i) => i.groupId === source.groupId && i.parentItemId === source.parentItemId,
    );
    const position = source.position + 1;
    await this.repos.items.updateMany(
      siblings.filter((i) => i.position >= position).map((i) => ({ id: i.id, patch: { position: i.position + 1 } })),
    );
    const copy = await this.repos.items.create({
      boardId: source.boardId,
      groupId: source.groupId,
      parentItemId: source.parentItemId,
      name: `${source.name} (copy)`,
      description: source.description,
      createdBy: actorId,
      position,
    });
    const values = await this.repos.items.listValuesByItem(itemId);
    await this.repos.items.setValues(values.map((v) => ({ itemId: copy.id, columnId: v.columnId, value: v.value })));

    const children = (await this.repos.items.listByBoard(source.boardId)).filter((i) => i.parentItemId === itemId);
    for (const child of children) {
      const childCopy = await this.repos.items.create({
        boardId: child.boardId,
        groupId: copy.groupId,
        parentItemId: copy.id,
        name: child.name,
        description: child.description,
        createdBy: actorId,
        position: child.position,
      });
      const childValues = await this.repos.items.listValuesByItem(child.id);
      await this.repos.items.setValues(childValues.map((v) => ({ itemId: childCopy.id, columnId: v.columnId, value: v.value })));
    }

    const board = await this.repos.boards.getById(source.boardId);
    await this.repos.activities.create({
      workspaceId: board?.workspaceId ?? "",
      boardId: source.boardId,
      itemId: copy.id,
      actorId,
      eventType: "ITEM_CREATED",
      metadata: { itemName: copy.name, boardName: board?.name },
    });
    return copy;
  }
}

import type {
  ActivityInput,
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
import { emptyValueFor } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { displayValue } from "./column-display";
import type { ItemLinkService } from "./item-link-service";

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

export class ItemService {
  constructor(
    private readonly repos: Repositories,
    /** Mirrors name, description and value changes onto linked items. */
    private readonly links: ItemLinkService,
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
    const siblings = (await this.repos.items.listByBoard(input.boardId)).filter(
      (i) => i.groupId === input.groupId && (i.parentItemId ?? null) === (input.parentItemId ?? null),
    );

    let position = siblings.length;
    if (input.afterItemId) {
      const after = siblings.find((i) => i.id === input.afterItemId);
      if (after) {
        position = after.position + 1;
        const shifted = siblings.filter((i) => i.position >= position);
        await this.repos.items.updateMany(shifted.map((i) => ({ id: i.id, patch: { position: i.position + 1 } })));
      }
    }

    const item = await this.repos.items.create({
      id: input.id,
      boardId: input.boardId,
      groupId: input.groupId,
      parentItemId: input.parentItemId ?? null,
      name,
      createdBy: actorId,
      position,
    });

    // Default status label and any explicit initial values.
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
    if (initial.length) await this.repos.items.setValues(initial);

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

  async updateDescription(itemId: EntityId, description: string | null, actorId: EntityId): Promise<Item> {
    const next = description?.trim() || null;
    const item = await this.repos.items.update(itemId, { description: next });
    await this.links.propagate(itemId, { kind: "description", description: next }, actorId);
    return item;
  }

  async setValue(itemId: EntityId, columnId: EntityId, value: ColumnValue, ctx: SetValueContext, actorId: EntityId): Promise<ItemColumnValue> {
    const existing = (await this.repos.items.listValuesByItem(itemId)).find((v) => v.columnId === columnId);
    const result = await this.repos.items.setValue(itemId, columnId, value);
    await this.links.propagate(itemId, { kind: "value", columnId, value }, actorId);

    const from = displayValue(ctx.column, existing?.value ?? emptyValueFor(ctx.column.type), ctx.users);
    const to = displayValue(ctx.column, value, ctx.users);
    if (from === to) return result;

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
    if (notifications.length) await this.repos.notifications.createMany(notifications);
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

  async archiveItems(boardId: EntityId, itemIds: EntityId[], actorId: EntityId): Promise<void> {
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

  async restoreItems(itemIds: EntityId[]): Promise<void> {
    await this.repos.items.updateMany(itemIds.map((id) => ({ id, patch: { archivedAt: null } })));
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

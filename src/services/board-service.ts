import type {
  Board,
  BoardColumn,
  BoardColumnInput,
  BoardGroup,
  BoardInput,
  BoardRole,
  ColorToken,
  ColumnSettings,
  EntityId,
} from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { BOARD_TEMPLATES, type BoardTemplateId } from "@/features/boards/templates";
import { slugify, uniqueSlug } from "@/lib/slug";

export interface CreateBoardInput {
  workspaceId: EntityId;
  name: string;
  description?: string | null;
  teamId: EntityId | null;
  visibility: Board["visibility"];
  templateId: BoardTemplateId;
  color?: ColorToken;
  icon?: string;
}

export interface BoardBundle {
  board: Board;
  groups: BoardGroup[];
  columns: BoardColumn[];
}

const GROUP_COLORS: ColorToken[] = ["blue", "orange", "violet", "green", "sky", "amber", "teal", "pink", "gray"];

export class BoardService {
  constructor(private readonly repos: Repositories) {}

  async listBoards(workspaceId: EntityId): Promise<Board[]> {
    return this.repos.boards.listByWorkspace(workspaceId);
  }

  async getBoard(boardId: EntityId): Promise<Board> {
    const board = await this.repos.boards.getById(boardId);
    if (!board) throw new NotFoundError("Board", boardId);
    return board;
  }

  async getBoardBySlug(workspaceId: EntityId, slug: string): Promise<Board | null> {
    return this.repos.boards.getBySlug(workspaceId, slug);
  }

  async createBoard(input: CreateBoardInput, actorId: EntityId): Promise<BoardBundle> {
    const template = BOARD_TEMPLATES[input.templateId];
    const existing = await this.repos.boards.listByWorkspace(input.workspaceId);
    const slug = uniqueSlug(slugify(input.name), existing.map((b) => b.slug));

    const boardInput: BoardInput & { slug: string } = {
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      type: input.visibility === "PRIVATE" ? "PRIVATE" : "MAIN",
      visibility: input.visibility,
      ownerId: actorId,
      color: input.color ?? "blue",
      icon: input.icon ?? "layout-grid",
    };
    const board = await this.repos.boards.create(boardInput);
    await this.repos.boards.setMember(board.id, actorId, "OWNER");

    const groups: BoardGroup[] = [];
    for (const [index, group] of template.groups.entries()) {
      groups.push(
        await this.repos.boards.createGroup({
          boardId: board.id,
          name: group.name,
          color: group.color,
          position: index,
          collapsed: false,
        }),
      );
    }
    const columns: BoardColumn[] = [];
    for (const [index, column] of template.columns.entries()) {
      columns.push(
        await this.repos.boards.createColumn({ boardId: board.id, name: column.name, type: column.type, position: index }),
      );
    }

    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId: board.id,
      itemId: null,
      actorId,
      eventType: "BOARD_CREATED",
      metadata: { boardName: board.name },
    });

    return { board, groups, columns };
  }

  async updateBoard(
    boardId: EntityId,
    patch: Partial<Pick<Board, "name" | "description" | "teamId" | "visibility" | "color" | "icon">>,
    actorId: EntityId,
  ): Promise<Board> {
    const before = await this.getBoard(boardId);
    const next: typeof patch = { ...patch };
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new Error("Board name cannot be empty");
      next.name = trimmed;
      if (trimmed !== before.name) {
        const siblings = (await this.repos.boards.listByWorkspace(before.workspaceId)).filter((b) => b.id !== boardId);
        const slug = uniqueSlug(slugify(trimmed), siblings.map((b) => b.slug));
        const updated = await this.repos.boards.update(boardId, { ...next, slug });
        await this.repos.activities.create({
          workspaceId: before.workspaceId,
          boardId,
          itemId: null,
          actorId,
          eventType: "BOARD_RENAMED",
          metadata: { from: before.name, to: trimmed, boardName: trimmed },
        });
        return updated;
      }
    }
    if (patch.visibility && patch.visibility === "PRIVATE") {
      return this.repos.boards.update(boardId, { ...next, type: "PRIVATE" });
    }
    if (patch.visibility && before.type === "PRIVATE") {
      return this.repos.boards.update(boardId, { ...next, type: "MAIN" });
    }
    return this.repos.boards.update(boardId, next);
  }

  async archiveBoard(boardId: EntityId, actorId: EntityId): Promise<Board> {
    const board = await this.repos.boards.update(boardId, { archivedAt: new Date().toISOString() });
    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId,
      itemId: null,
      actorId,
      eventType: "BOARD_ARCHIVED",
      metadata: { boardName: board.name },
    });
    return board;
  }

  async restoreBoard(boardId: EntityId): Promise<Board> {
    return this.repos.boards.update(boardId, { archivedAt: null });
  }

  async deleteBoard(boardId: EntityId): Promise<void> {
    await this.repos.boards.delete(boardId);
  }

  /** Copies board, groups, columns, items and values. Comments and activity are not copied. */
  async duplicateBoard(boardId: EntityId, actorId: EntityId): Promise<Board> {
    const source = await this.getBoard(boardId);
    const existing = await this.repos.boards.listByWorkspace(source.workspaceId);
    const name = `${source.name} (copy)`;
    const board = await this.repos.boards.create({
      workspaceId: source.workspaceId,
      teamId: source.teamId,
      name,
      slug: uniqueSlug(slugify(name), existing.map((b) => b.slug)),
      description: source.description,
      type: source.type,
      visibility: source.visibility,
      ownerId: actorId,
      color: source.color,
      icon: source.icon,
    });
    await this.repos.boards.setMember(board.id, actorId, "OWNER");

    const groupMap = new Map<EntityId, EntityId>();
    for (const group of await this.repos.boards.listGroups(boardId)) {
      const copy = await this.repos.boards.createGroup({
        boardId: board.id,
        name: group.name,
        color: group.color,
        position: group.position,
        collapsed: false,
      });
      groupMap.set(group.id, copy.id);
    }
    const columnMap = new Map<EntityId, EntityId>();
    for (const column of await this.repos.boards.listColumns(boardId)) {
      const copy = await this.repos.boards.createColumn({
        boardId: board.id,
        name: column.name,
        type: column.type,
        settings: column.settings,
        width: column.width,
        hidden: column.hidden,
        position: column.position,
      });
      columnMap.set(column.id, copy.id);
    }

    const items = await this.repos.items.listByBoard(boardId);
    const values = await this.repos.items.listValuesByBoard(boardId);
    const itemMap = new Map<EntityId, EntityId>();
    // Parents first so subitems can reference them.
    const ordered = [...items].sort((a, b) => Number(a.parentItemId !== null) - Number(b.parentItemId !== null));
    for (const item of ordered) {
      const groupId = groupMap.get(item.groupId);
      if (!groupId) continue;
      const copy = await this.repos.items.create({
        boardId: board.id,
        groupId,
        parentItemId: item.parentItemId ? (itemMap.get(item.parentItemId) ?? null) : null,
        name: item.name,
        description: item.description,
        createdBy: actorId,
        position: item.position,
      });
      itemMap.set(item.id, copy.id);
    }
    const copiedValues = values.flatMap((v) => {
      const itemId = itemMap.get(v.itemId);
      const columnId = columnMap.get(v.columnId);
      if (!itemId || !columnId) return [];
      const value =
        v.value.type === "DEPENDENCY"
          ? { ...v.value, itemIds: v.value.itemIds.flatMap((id) => itemMap.get(id) ?? []) }
          : v.value;
      return [{ itemId, columnId, value }];
    });
    await this.repos.items.setValues(copiedValues);

    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId: board.id,
      itemId: null,
      actorId,
      eventType: "BOARD_CREATED",
      metadata: { boardName: board.name },
    });
    return board;
  }

  // ---- Favourites ----------------------------------------------------------

  async setFavourite(boardId: EntityId, userId: EntityId, favourite: boolean): Promise<void> {
    if (favourite) await this.repos.boards.addFavourite(boardId, userId);
    else await this.repos.boards.removeFavourite(boardId, userId);
  }

  // ---- Members -------------------------------------------------------------

  async setMember(boardId: EntityId, userId: EntityId, role: BoardRole, actorId: EntityId, memberName: string): Promise<void> {
    const before = await this.repos.boards.listMembers(boardId);
    const existed = before.some((m) => m.userId === userId);
    await this.repos.boards.setMember(boardId, userId, role);
    if (!existed) {
      const board = await this.getBoard(boardId);
      await this.repos.activities.create({
        workspaceId: board.workspaceId,
        boardId,
        itemId: null,
        actorId,
        eventType: "MEMBER_ADDED",
        metadata: { boardName: board.name, memberName },
      });
      if (userId !== actorId) {
        await this.repos.notifications.create({
          userId,
          type: "BOARD_INVITE",
          title: `You were added to ${board.name}`,
          body: `Role: ${role.toLowerCase()}`,
          entityType: "BOARD",
          entityId: boardId,
          boardId,
          actorId,
        });
      }
    }
  }

  async removeMember(boardId: EntityId, userId: EntityId, actorId: EntityId, memberName: string): Promise<void> {
    await this.repos.boards.removeMember(boardId, userId);
    const board = await this.getBoard(boardId);
    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId,
      itemId: null,
      actorId,
      eventType: "MEMBER_REMOVED",
      metadata: { boardName: board.name, memberName },
    });
  }

  // ---- Groups --------------------------------------------------------------

  async createGroup(boardId: EntityId, name: string, actorId: EntityId, position?: number, id?: EntityId): Promise<BoardGroup> {
    const groups = await this.repos.boards.listGroups(boardId);
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length] ?? "blue";
    const group = await this.repos.boards.createGroup({
      id,
      boardId,
      name: name.trim() || "New group",
      color,
      position: position ?? groups.length,
      collapsed: false,
    });
    if (position !== undefined) {
      const ordered = [...groups.map((g) => g.id)];
      ordered.splice(position, 0, group.id);
      await this.repos.boards.reorderGroups(boardId, ordered);
    }
    const board = await this.getBoard(boardId);
    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId,
      itemId: null,
      actorId,
      eventType: "GROUP_CREATED",
      metadata: { groupName: group.name, boardName: board.name },
    });
    return group;
  }

  async updateGroup(
    groupId: EntityId,
    patch: Partial<Pick<BoardGroup, "name" | "color" | "collapsed">>,
    actorId: EntityId,
  ): Promise<BoardGroup> {
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim();
      if (!trimmed) throw new Error("Group name cannot be empty");
      const groupsBefore = await this.repos.boards.updateGroup(groupId, { ...patch, name: trimmed });
      const board = await this.getBoard(groupsBefore.boardId);
      await this.repos.activities.create({
        workspaceId: board.workspaceId,
        boardId: board.id,
        itemId: null,
        actorId,
        eventType: "GROUP_RENAMED",
        metadata: { groupName: trimmed, boardName: board.name },
      });
      return groupsBefore;
    }
    return this.repos.boards.updateGroup(groupId, patch);
  }

  async reorderGroups(boardId: EntityId, orderedIds: EntityId[]): Promise<BoardGroup[]> {
    return this.repos.boards.reorderGroups(boardId, orderedIds);
  }

  async duplicateGroup(groupId: EntityId, actorId: EntityId): Promise<BoardGroup> {
    const groups = await this.repos.boards.listGroups((await this.findGroup(groupId)).boardId);
    const source = groups.find((g) => g.id === groupId);
    if (!source) throw new NotFoundError("BoardGroup", groupId);
    const copy = await this.repos.boards.createGroup({
      boardId: source.boardId,
      name: `${source.name} (copy)`,
      color: source.color,
      position: source.position + 1,
      collapsed: false,
    });
    const ordered = groups.map((g) => g.id);
    ordered.splice(source.position + 1, 0, copy.id);
    await this.repos.boards.reorderGroups(source.boardId, ordered);

    const items = (await this.repos.items.listByBoard(source.boardId)).filter((i) => i.groupId === groupId);
    const values = await this.repos.items.listValuesByBoard(source.boardId);
    const itemMap = new Map<EntityId, EntityId>();
    const orderedItems = [...items].sort((a, b) => Number(a.parentItemId !== null) - Number(b.parentItemId !== null));
    for (const item of orderedItems) {
      const created = await this.repos.items.create({
        boardId: source.boardId,
        groupId: copy.id,
        parentItemId: item.parentItemId ? (itemMap.get(item.parentItemId) ?? null) : null,
        name: item.name,
        description: item.description,
        createdBy: actorId,
        position: item.position,
      });
      itemMap.set(item.id, created.id);
    }
    await this.repos.items.setValues(
      values.flatMap((v) => {
        const itemId = itemMap.get(v.itemId);
        return itemId ? [{ itemId, columnId: v.columnId, value: v.value }] : [];
      }),
    );
    return copy;
  }

  async deleteGroup(groupId: EntityId, actorId: EntityId): Promise<void> {
    const group = await this.findGroup(groupId);
    const board = await this.getBoard(group.boardId);
    await this.repos.boards.deleteGroup(groupId);
    await this.repos.activities.create({
      workspaceId: board.workspaceId,
      boardId: board.id,
      itemId: null,
      actorId,
      eventType: "GROUP_DELETED",
      metadata: { groupName: group.name, boardName: board.name },
    });
  }

  private async findGroup(groupId: EntityId): Promise<BoardGroup> {
    const group = await this.repos.boards.getGroup(groupId);
    if (!group) throw new NotFoundError("BoardGroup", groupId);
    return group;
  }

  // ---- Columns -------------------------------------------------------------

  async addColumn(input: BoardColumnInput & { id?: EntityId; position?: number }): Promise<BoardColumn> {
    return this.repos.boards.createColumn({ ...input, name: input.name.trim() || "New column" });
  }

  async updateColumn(
    columnId: EntityId,
    patch: Partial<Pick<BoardColumn, "name" | "width" | "hidden">> & { settings?: ColumnSettings },
  ): Promise<BoardColumn> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Column name cannot be empty");
    return this.repos.boards.updateColumn(columnId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
  }

  async reorderColumns(boardId: EntityId, orderedIds: EntityId[]): Promise<BoardColumn[]> {
    return this.repos.boards.reorderColumns(boardId, orderedIds);
  }

  async deleteColumn(columnId: EntityId): Promise<void> {
    await this.repos.boards.deleteColumn(columnId);
  }
}

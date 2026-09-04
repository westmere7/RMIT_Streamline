import type {
  Board,
  BoardColumn,
  BoardColumnInput,
  BoardFavourite,
  BoardGroup,
  BoardInput,
  BoardMember,
  BoardRole,
} from "@/domain";
import { DEFAULT_COLUMN_WIDTHS, defaultSettingsFor } from "@/domain";
import type { BoardRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import { sortByPosition } from "@/lib/utils";
import type { LocalConnection } from "../connection";
import type { StreamlineDatabase } from "../database";

/** Deletes items (and their subitems), values and comments for the given item ids inside a transaction. */
export async function deleteItemsCascade(db: StreamlineDatabase, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const tx = db.transaction(["items", "itemColumnValues", "comments", "itemLinks"], "readwrite");
  const items = tx.objectStore("items");
  const values = tx.objectStore("itemColumnValues");
  const comments = tx.objectStore("comments");
  const links = tx.objectStore("itemLinks");

  const toDelete = new Set(itemIds);
  for (const id of itemIds) {
    const children = await items.index("byParent").getAllKeys(id);
    for (const child of children) toDelete.add(child);
  }

  for (const id of toDelete) {
    const valueKeys = await values.index("byItem").getAllKeys(id);
    await Promise.all(valueKeys.map((k) => values.delete(k)));
    const commentKeys = await comments.index("byItem").getAllKeys(id);
    await Promise.all(commentKeys.map((k) => comments.delete(k)));
    const linkKeys = [...(await links.index("byItemA").getAllKeys(id)), ...(await links.index("byItemB").getAllKeys(id))];
    await Promise.all(linkKeys.map((k) => links.delete(k)));
    await items.delete(id);
  }
  await tx.done;
}

export class LocalBoardRepository implements BoardRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<Board[]> {
    const db = await this.conn.getDb();
    const boards = await db.getAllFromIndex("boards", "byWorkspace", workspaceId);
    return boards.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<Board | null> {
    const db = await this.conn.getDb();
    return (await db.get("boards", id)) ?? null;
  }

  async getBySlug(workspaceId: string, slug: string): Promise<Board | null> {
    const db = await this.conn.getDb();
    const boards = await db.getAllFromIndex("boards", "byWorkspace", workspaceId);
    return boards.find((b) => b.slug === slug) ?? null;
  }

  async create(input: BoardInput & { slug: string }): Promise<Board> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const board: Board = { ...input, id: newId(), archivedAt: null, createdAt: now, updatedAt: now };
    await db.put("boards", board);
    return board;
  }

  async update(id: string, patch: Partial<Omit<Board, "id" | "createdAt">>): Promise<Board> {
    const db = await this.conn.getDb();
    const existing = await db.get("boards", id);
    if (!existing) throw new NotFoundError("Board", id);
    const updated: Board = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("boards", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const itemIds = await db.getAllKeysFromIndex("items", "byBoard", id);
    await deleteItemsCascade(db, itemIds);

    const tx = db.transaction(
      ["boards", "boardMembers", "boardFavourites", "boardGroups", "boardColumns", "boardVisits"],
      "readwrite",
    );
    const memberKeys = await tx.objectStore("boardMembers").index("byBoard").getAllKeys(id);
    const favKeys = await tx.objectStore("boardFavourites").index("byBoard").getAllKeys(id);
    const groupKeys = await tx.objectStore("boardGroups").index("byBoard").getAllKeys(id);
    const columnKeys = await tx.objectStore("boardColumns").index("byBoard").getAllKeys(id);
    const visits = (await tx.objectStore("boardVisits").getAll()).filter((v) => v.boardId === id);
    await Promise.all([
      ...memberKeys.map((k) => tx.objectStore("boardMembers").delete(k)),
      ...favKeys.map((k) => tx.objectStore("boardFavourites").delete(k)),
      ...groupKeys.map((k) => tx.objectStore("boardGroups").delete(k)),
      ...columnKeys.map((k) => tx.objectStore("boardColumns").delete(k)),
      ...visits.map((v) => tx.objectStore("boardVisits").delete(v.id)),
      tx.objectStore("boards").delete(id),
    ]);
    await tx.done;
  }

  // ---- Members -------------------------------------------------------------

  async listMembers(boardId: string): Promise<BoardMember[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("boardMembers", "byBoard", boardId);
  }

  async listMembersByWorkspace(workspaceId: string): Promise<BoardMember[]> {
    const db = await this.conn.getDb();
    const boardIds = new Set(await db.getAllKeysFromIndex("boards", "byWorkspace", workspaceId));
    const all = await db.getAll("boardMembers");
    return all.filter((m) => boardIds.has(m.boardId));
  }

  async setMember(boardId: string, userId: string, role: BoardRole): Promise<BoardMember> {
    const db = await this.conn.getDb();
    const existing = (await db.getAllFromIndex("boardMembers", "byBoard", boardId)).find((m) => m.userId === userId);
    const member: BoardMember = existing ? { ...existing, role } : { id: newId(), boardId, userId, role };
    await db.put("boardMembers", member);
    return member;
  }

  async removeMember(boardId: string, userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const members = await db.getAllFromIndex("boardMembers", "byBoard", boardId);
    await Promise.all(members.filter((m) => m.userId === userId).map((m) => db.delete("boardMembers", m.id)));
  }

  // ---- Favourites ----------------------------------------------------------

  async listFavourites(userId: string): Promise<BoardFavourite[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("boardFavourites", "byUser", userId);
  }

  async addFavourite(boardId: string, userId: string): Promise<BoardFavourite> {
    const db = await this.conn.getDb();
    const existing = (await db.getAllFromIndex("boardFavourites", "byUser", userId)).find(
      (f) => f.boardId === boardId,
    );
    if (existing) return existing;
    const fav: BoardFavourite = { id: newId(), boardId, userId, createdAt: nowIso() };
    await db.put("boardFavourites", fav);
    return fav;
  }

  async removeFavourite(boardId: string, userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const favs = await db.getAllFromIndex("boardFavourites", "byUser", userId);
    await Promise.all(favs.filter((f) => f.boardId === boardId).map((f) => db.delete("boardFavourites", f.id)));
  }

  // ---- Groups --------------------------------------------------------------

  async listGroups(boardId: string): Promise<BoardGroup[]> {
    const db = await this.conn.getDb();
    return sortByPosition(await db.getAllFromIndex("boardGroups", "byBoard", boardId));
  }

  async getGroup(id: string): Promise<BoardGroup | null> {
    const db = await this.conn.getDb();
    return (await db.get("boardGroups", id)) ?? null;
  }

  async createGroup(input: Omit<BoardGroup, "id" | "createdAt"> & { id?: string }): Promise<BoardGroup> {
    const db = await this.conn.getDb();
    const group: BoardGroup = { ...input, id: input.id ?? newId(), createdAt: nowIso() };
    await db.put("boardGroups", group);
    return group;
  }

  async updateGroup(id: string, patch: Partial<Omit<BoardGroup, "id" | "boardId" | "createdAt">>): Promise<BoardGroup> {
    const db = await this.conn.getDb();
    const existing = await db.get("boardGroups", id);
    if (!existing) throw new NotFoundError("BoardGroup", id);
    const updated: BoardGroup = { ...existing, ...patch, id };
    await db.put("boardGroups", updated);
    return updated;
  }

  async deleteGroup(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const itemIds = await db.getAllKeysFromIndex("items", "byGroup", id);
    await deleteItemsCascade(db, itemIds);
    await db.delete("boardGroups", id);
  }

  async reorderGroups(boardId: string, orderedIds: string[]): Promise<BoardGroup[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("boardGroups", "readwrite");
    const groups = await tx.store.index("byBoard").getAll(boardId);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const updated = groups.map((g) => ({ ...g, position: order.get(g.id) ?? g.position + orderedIds.length }));
    await Promise.all(updated.map((g) => tx.store.put(g)));
    await tx.done;
    return sortByPosition(updated);
  }

  // ---- Columns -------------------------------------------------------------

  async listColumns(boardId: string): Promise<BoardColumn[]> {
    const db = await this.conn.getDb();
    return sortByPosition(await db.getAllFromIndex("boardColumns", "byBoard", boardId));
  }

  async createColumn(input: BoardColumnInput & { position?: number; id?: string }): Promise<BoardColumn> {
    const db = await this.conn.getDb();
    const existing = await db.getAllFromIndex("boardColumns", "byBoard", input.boardId);
    const maxPosition = existing.reduce((max, c) => Math.max(max, c.position), -1);
    const column: BoardColumn = {
      id: input.id ?? newId(),
      boardId: input.boardId,
      name: input.name,
      type: input.type,
      settings: input.settings ?? defaultSettingsFor(input.type),
      position: input.position ?? maxPosition + 1,
      width: input.width ?? DEFAULT_COLUMN_WIDTHS[input.type],
      hidden: input.hidden ?? false,
      createdAt: nowIso(),
    };
    await db.put("boardColumns", column);
    return column;
  }

  async updateColumn(
    id: string,
    patch: Partial<Omit<BoardColumn, "id" | "boardId" | "createdAt">>,
  ): Promise<BoardColumn> {
    const db = await this.conn.getDb();
    const existing = await db.get("boardColumns", id);
    if (!existing) throw new NotFoundError("BoardColumn", id);
    const updated: BoardColumn = { ...existing, ...patch, id };
    await db.put("boardColumns", updated);
    return updated;
  }

  async deleteColumn(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction(["boardColumns", "itemColumnValues"], "readwrite");
    const valueKeys = await tx.objectStore("itemColumnValues").index("byColumn").getAllKeys(id);
    await Promise.all(valueKeys.map((k) => tx.objectStore("itemColumnValues").delete(k)));
    await tx.objectStore("boardColumns").delete(id);
    await tx.done;
  }

  async reorderColumns(boardId: string, orderedIds: string[]): Promise<BoardColumn[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("boardColumns", "readwrite");
    const columns = await tx.store.index("byBoard").getAll(boardId);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const updated = columns.map((c) => ({ ...c, position: order.get(c.id) ?? c.position + orderedIds.length }));
    await Promise.all(updated.map((c) => tx.store.put(c)));
    await tx.done;
    return sortByPosition(updated);
  }
}

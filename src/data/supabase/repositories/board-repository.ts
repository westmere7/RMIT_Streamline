import type { Board, BoardColumn, BoardColumnInput, BoardFavourite, BoardGroup, BoardInput, BoardMember, BoardRole } from "@/domain";
import { DEFAULT_COLUMN_WIDTHS, defaultSettingsFor } from "@/domain";
import type { BoardRepository } from "@/data/repositories";
import { sortByPosition } from "@/lib/utils";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import {
  fromBoardColumnPatch,
  fromBoardGroupPatch,
  fromBoardPatch,
  toBoard,
  toBoardColumn,
  toBoardFavourite,
  toBoardGroup,
  toBoardMember,
  type BoardColumnRow,
  type BoardFavouriteRow,
  type BoardGroupRow,
  type BoardMemberRow,
  type BoardRow,
} from "../rows";

const BOARD =
  "id, workspace_id, team_id, name, slug, description, type, visibility, owner_id, color, icon, archived_at, created_at, updated_at";
const MEMBER = "id, board_id, user_id, role";
const FAVOURITE = "id, board_id, user_id, created_at";
const GROUP = "id, board_id, name, color, position, collapsed, created_at";
const COLUMN = "id, board_id, name, type, settings, position, width, hidden, created_at";

/**
 * Boards and everything under them. Deletes rely on `on delete cascade` in
 * supabase/migrations/0001_initial_schema.sql, so removing a parent row is enough.
 */
export class SupabaseBoardRepository implements BoardRepository {
  async listByWorkspace(workspaceId: string): Promise<Board[]> {
    const result = await db().from("boards").select(BOARD).eq("workspace_id", workspaceId).order("name", { ascending: true });
    return unwrapList<BoardRow>(result, "boards.listByWorkspace").map(toBoard);
  }

  async getById(id: string): Promise<Board | null> {
    const result = await db().from("boards").select(BOARD).eq("id", id).maybeSingle();
    const row = unwrapMaybe<BoardRow>(result, "boards.getById");
    return row ? toBoard(row) : null;
  }

  async getBySlug(workspaceId: string, slug: string): Promise<Board | null> {
    const result = await db().from("boards").select(BOARD).eq("workspace_id", workspaceId).eq("slug", slug).maybeSingle();
    const row = unwrapMaybe<BoardRow>(result, "boards.getBySlug");
    return row ? toBoard(row) : null;
  }

  async create(input: BoardInput & { slug: string }): Promise<Board> {
    const payload = {
      workspace_id: input.workspaceId,
      team_id: input.teamId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      type: input.type,
      visibility: input.visibility,
      owner_id: input.ownerId,
      color: input.color,
      icon: input.icon,
    };
    const result = await db().from("boards").insert(payload).select(BOARD).single();
    return toBoard(unwrap<BoardRow>(result, "boards.create"));
  }

  async update(id: string, patch: Partial<Omit<Board, "id" | "createdAt">>): Promise<Board> {
    const result = await db().from("boards").update(fromBoardPatch(patch)).eq("id", id).select(BOARD).single();
    return toBoard(unwrap<BoardRow>(result, "boards.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("boards").delete().eq("id", id), "boards.delete");
  }

  // ---- Members -------------------------------------------------------------

  async listMembers(boardId: string): Promise<BoardMember[]> {
    const result = await db().from("board_members").select(MEMBER).eq("board_id", boardId);
    return unwrapList<BoardMemberRow>(result, "board_members.listMembers").map(toBoardMember);
  }

  async listMembersByWorkspace(workspaceId: string): Promise<BoardMember[]> {
    const boards = await db().from("boards").select("id").eq("workspace_id", workspaceId);
    const ids = unwrapList<{ id: string }>(boards, "board_members.listMembersByWorkspace.boards").map((b) => b.id);
    if (ids.length === 0) return [];
    const result = await db().from("board_members").select(MEMBER).in("board_id", ids);
    return unwrapList<BoardMemberRow>(result, "board_members.listMembersByWorkspace").map(toBoardMember);
  }

  async setMember(boardId: string, userId: string, role: BoardRole): Promise<BoardMember> {
    const result = await db()
      .from("board_members")
      .upsert({ board_id: boardId, user_id: userId, role }, { onConflict: "board_id,user_id" })
      .select(MEMBER)
      .single();
    return toBoardMember(unwrap<BoardMemberRow>(result, "board_members.setMember"));
  }

  async removeMember(boardId: string, userId: string): Promise<void> {
    assertOk(
      await db().from("board_members").delete().eq("board_id", boardId).eq("user_id", userId),
      "board_members.removeMember",
    );
  }

  // ---- Favourites ----------------------------------------------------------

  async listFavourites(userId: string): Promise<BoardFavourite[]> {
    const result = await db().from("board_favourites").select(FAVOURITE).eq("user_id", userId);
    return unwrapList<BoardFavouriteRow>(result, "board_favourites.listFavourites").map(toBoardFavourite);
  }

  async addFavourite(boardId: string, userId: string): Promise<BoardFavourite> {
    const result = await db()
      .from("board_favourites")
      .upsert({ board_id: boardId, user_id: userId }, { onConflict: "board_id,user_id" })
      .select(FAVOURITE)
      .single();
    return toBoardFavourite(unwrap<BoardFavouriteRow>(result, "board_favourites.addFavourite"));
  }

  async removeFavourite(boardId: string, userId: string): Promise<void> {
    assertOk(
      await db().from("board_favourites").delete().eq("board_id", boardId).eq("user_id", userId),
      "board_favourites.removeFavourite",
    );
  }

  // ---- Groups --------------------------------------------------------------

  async listGroups(boardId: string): Promise<BoardGroup[]> {
    const result = await db().from("board_groups").select(GROUP).eq("board_id", boardId).order("position", { ascending: true });
    return unwrapList<BoardGroupRow>(result, "board_groups.listGroups").map(toBoardGroup);
  }

  async getGroup(id: string): Promise<BoardGroup | null> {
    const result = await db().from("board_groups").select(GROUP).eq("id", id).maybeSingle();
    const row = unwrapMaybe<BoardGroupRow>(result, "board_groups.getGroup");
    return row ? toBoardGroup(row) : null;
  }

  async createGroup(input: Omit<BoardGroup, "id" | "createdAt"> & { id?: string }): Promise<BoardGroup> {
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      board_id: input.boardId,
      name: input.name,
      color: input.color,
      position: input.position,
      collapsed: input.collapsed,
    };
    const result = await db().from("board_groups").insert(payload).select(GROUP).single();
    return toBoardGroup(unwrap<BoardGroupRow>(result, "board_groups.createGroup"));
  }

  async updateGroup(id: string, patch: Partial<Omit<BoardGroup, "id" | "boardId" | "createdAt">>): Promise<BoardGroup> {
    const result = await db().from("board_groups").update(fromBoardGroupPatch(patch)).eq("id", id).select(GROUP).single();
    return toBoardGroup(unwrap<BoardGroupRow>(result, "board_groups.updateGroup"));
  }

  /** Items in the group cascade with it. */
  async deleteGroup(id: string): Promise<void> {
    assertOk(await db().from("board_groups").delete().eq("id", id), "board_groups.deleteGroup");
  }

  async reorderGroups(boardId: string, orderedIds: string[]): Promise<BoardGroup[]> {
    const groups = await this.listGroups(boardId);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const updated = groups.map((g) => ({ ...g, position: order.get(g.id) ?? g.position + orderedIds.length }));
    await Promise.all(
      updated
        .filter((g, index) => g.position !== groups[index]?.position)
        .map((g) => db().from("board_groups").update({ position: g.position }).eq("id", g.id)),
    );
    return sortByPosition(updated);
  }

  // ---- Columns -------------------------------------------------------------

  async listColumns(boardId: string): Promise<BoardColumn[]> {
    const result = await db().from("board_columns").select(COLUMN).eq("board_id", boardId).order("position", { ascending: true });
    return unwrapList<BoardColumnRow>(result, "board_columns.listColumns").map(toBoardColumn);
  }

  async createColumn(input: BoardColumnInput & { position?: number; id?: string }): Promise<BoardColumn> {
    let position = input.position;
    if (position === undefined) {
      const existing = await db()
        .from("board_columns")
        .select("position")
        .eq("board_id", input.boardId)
        .order("position", { ascending: false })
        .limit(1);
      const rows = unwrapList<{ position: number }>(existing, "board_columns.createColumn.position");
      position = (rows[0]?.position ?? -1) + 1;
    }
    const payload = {
      ...(input.id ? { id: input.id } : {}),
      board_id: input.boardId,
      name: input.name,
      type: input.type,
      settings: input.settings ?? defaultSettingsFor(input.type),
      position,
      width: input.width ?? DEFAULT_COLUMN_WIDTHS[input.type],
      hidden: input.hidden ?? false,
    };
    const result = await db().from("board_columns").insert(payload).select(COLUMN).single();
    return toBoardColumn(unwrap<BoardColumnRow>(result, "board_columns.createColumn"));
  }

  async updateColumn(id: string, patch: Partial<Omit<BoardColumn, "id" | "boardId" | "createdAt">>): Promise<BoardColumn> {
    const result = await db().from("board_columns").update(fromBoardColumnPatch(patch)).eq("id", id).select(COLUMN).single();
    return toBoardColumn(unwrap<BoardColumnRow>(result, "board_columns.updateColumn"));
  }

  /** Values stored against the column cascade with it. */
  async deleteColumn(id: string): Promise<void> {
    assertOk(await db().from("board_columns").delete().eq("id", id), "board_columns.deleteColumn");
  }

  async reorderColumns(boardId: string, orderedIds: string[]): Promise<BoardColumn[]> {
    const columns = await this.listColumns(boardId);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const updated = columns.map((c) => ({ ...c, position: order.get(c.id) ?? c.position + orderedIds.length }));
    await Promise.all(
      updated
        .filter((c, index) => c.position !== columns[index]?.position)
        .map((c) => db().from("board_columns").update({ position: c.position }).eq("id", c.id)),
    );
    return sortByPosition(updated);
  }
}

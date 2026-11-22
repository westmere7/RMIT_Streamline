import type { BoardShare, BoardShareInput } from "@/domain";
import type { BoardShareRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

const SHARE = "id, board_id, token, enabled, expires_at, password_hash, access, created_by, created_at, updated_at";

interface BoardShareRow {
  id: string;
  board_id: string;
  token: string;
  enabled: boolean;
  expires_at: string | null;
  password_hash: string | null;
  access: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toBoardShare(row: BoardShareRow): BoardShare {
  return {
    id: row.id,
    boardId: row.board_id,
    token: row.token,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    passwordHash: row.password_hash,
    access: row.access === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface BoardShareStateRow extends Omit<BoardShareRow, "token" | "password_hash"> {
  has_password: boolean;
}

/**
 * Public links to a board. The `board_shares_*` policies let the board's
 * managers read and change a link (policies/0033); anyone else on the board
 * learns only that it exists, through board_share_state(), with no token and
 * no password hash. A visitor's read goes through the service role in
 * src/server/share.ts instead, because there is no session for a policy to judge.
 */
export class SupabaseBoardShareRepository implements BoardShareRepository {
  async getByBoard(boardId: string): Promise<BoardShare | null> {
    const result = await db().from("board_shares").select(SHARE).eq("board_id", boardId).maybeSingle();
    const row = unwrapMaybe<BoardShareRow>(result, "board_shares.getByBoard");
    if (row) return toBoardShare(row);
    const state = unwrapList<BoardShareStateRow>(await db().rpc("board_share_state", { p_board_id: boardId }), "board_shares.state")[0];
    // Not a manager: the link without its secrets. An empty token has no address to copy.
    return state ? toBoardShare({ ...state, token: "", password_hash: null }) : null;
  }

  async getByToken(token: string): Promise<BoardShare | null> {
    const result = await db().from("board_shares").select(SHARE).eq("token", token).maybeSingle();
    const row = unwrapMaybe<BoardShareRow>(result, "board_shares.getByToken");
    return row ? toBoardShare(row) : null;
  }

  async create(input: BoardShareInput): Promise<BoardShare> {
    const payload = {
      board_id: input.boardId,
      token: input.token,
      enabled: input.enabled,
      expires_at: input.expiresAt,
      password_hash: input.passwordHash,
      access: input.access,
      created_by: input.createdBy,
    };
    const result = await db().from("board_shares").insert(payload).select(SHARE).single();
    return toBoardShare(unwrap<BoardShareRow>(result, "board_shares.create"));
  }

  async update(id: string, patch: Partial<Pick<BoardShare, "token" | "enabled" | "expiresAt" | "passwordHash" | "access">>): Promise<BoardShare> {
    const payload = pruneUndefined({ token: patch.token, enabled: patch.enabled, expires_at: patch.expiresAt, password_hash: patch.passwordHash, access: patch.access });
    const result = await db().from("board_shares").update(payload).eq("id", id).select(SHARE).single();
    return toBoardShare(unwrap<BoardShareRow>(result, "board_shares.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("board_shares").delete().eq("id", id), "board_shares.delete");
  }
}

import type { BoardShare, BoardShareInput } from "@/domain";
import type { BoardShareRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/** One share per board, found either by the board it opens or by the token in the link. */
export class LocalBoardShareRepository implements BoardShareRepository {
  constructor(private readonly conn: LocalConnection) {}

  async getByBoard(boardId: string): Promise<BoardShare | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("boardShares", "byBoard", boardId)) ?? null;
  }

  async getByToken(token: string): Promise<BoardShare | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("boardShares", "byToken", token)) ?? null;
  }

  async create(input: BoardShareInput): Promise<BoardShare> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const share: BoardShare = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("boardShares", share);
    return share;
  }

  async update(id: string, patch: Partial<Pick<BoardShare, "token" | "enabled" | "expiresAt" | "passwordHash">>): Promise<BoardShare> {
    const db = await this.conn.getDb();
    const existing = await db.get("boardShares", id);
    if (!existing) throw new NotFoundError("BoardShare", id);
    const updated: BoardShare = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("boardShares", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("boardShares", id);
  }
}

import type { SavedBoardView, SavedBoardViewInput, SavedBoardViewPatch } from "@/domain";
import type { SavedViewRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalSavedViewRepository implements SavedViewRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByBoard(boardId: string, userId: string): Promise<SavedBoardView[]> {
    const db = await this.conn.getDb();
    const views = await db.getAllFromIndex("savedViews", "byBoard", boardId);
    return views
      .map((v) => ({ ...v, isDefault: v.isDefault === true }))
      .filter((v) => v.shared || v.createdBy === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: SavedBoardViewInput): Promise<SavedBoardView> {
    const db = await this.conn.getDb();
    if (input.isDefault && (await db.getAllFromIndex("savedViews", "byBoard", input.boardId)).some((v) => v.isDefault)) {
      throw new Error("This board's default view is already saved.");
    }
    const now = nowIso();
    const view: SavedBoardView = { ...input, shared: input.shared || input.isDefault, id: newId(), createdAt: now, updatedAt: now };
    await db.put("savedViews", view);
    return view;
  }

  async update(id: string, patch: SavedBoardViewPatch): Promise<SavedBoardView> {
    const db = await this.conn.getDb();
    const existing = await db.get("savedViews", id);
    if (!existing) throw new NotFoundError("SavedView", id);
    const updated: SavedBoardView = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("savedViews", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("savedViews", id);
  }
}

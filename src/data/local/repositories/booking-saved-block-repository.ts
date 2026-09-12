import type { BookingSavedBlock, BookingSavedBlockInput } from "@/domain";
import type { BookingSavedBlockRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalBookingSavedBlockRepository implements BookingSavedBlockRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<BookingSavedBlock[]> {
    const db = await this.conn.getDb();
    const blocks = await db.getAllFromIndex("bookingSavedBlocks", "byWorkspace", workspaceId);
    return blocks.sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: BookingSavedBlockInput): Promise<BookingSavedBlock> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const saved: BookingSavedBlock = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("bookingSavedBlocks", saved);
    return saved;
  }

  async update(id: string, patch: Partial<Pick<BookingSavedBlock, "name" | "block">>): Promise<BookingSavedBlock> {
    const db = await this.conn.getDb();
    const existing = await db.get("bookingSavedBlocks", id);
    if (!existing) throw new NotFoundError("BookingSavedBlock", id);
    const updated: BookingSavedBlock = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("bookingSavedBlocks", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("bookingSavedBlocks", id);
  }
}

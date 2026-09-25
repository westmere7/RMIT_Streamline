import type { SavedBoardTemplate, SavedBoardTemplateInput } from "@/domain";
import type { BoardTemplateRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalBoardTemplateRepository implements BoardTemplateRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<SavedBoardTemplate[]> {
    const db = await this.conn.getDb();
    const templates = await db.getAllFromIndex("boardTemplates", "byWorkspace", workspaceId);
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<SavedBoardTemplate | null> {
    const db = await this.conn.getDb();
    return (await db.get("boardTemplates", id)) ?? null;
  }

  async create(input: SavedBoardTemplateInput): Promise<SavedBoardTemplate> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const template: SavedBoardTemplate = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("boardTemplates", template);
    return template;
  }

  async update(id: string, patch: Partial<Pick<SavedBoardTemplate, "name" | "description" | "spec">>): Promise<SavedBoardTemplate> {
    const db = await this.conn.getDb();
    const existing = await db.get("boardTemplates", id);
    if (!existing) throw new NotFoundError("BoardTemplate", id);
    const updated: SavedBoardTemplate = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("boardTemplates", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("boardTemplates", id);
  }
}

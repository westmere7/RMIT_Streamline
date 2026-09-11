import type { BookingTemplate, BookingTemplateInput } from "@/domain";
import type { BookingTemplateRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalBookingTemplateRepository implements BookingTemplateRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<BookingTemplate[]> {
    const db = await this.conn.getDb();
    const templates = await db.getAllFromIndex("bookingTemplates", "byWorkspace", workspaceId);
    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<BookingTemplate | null> {
    const db = await this.conn.getDb();
    return (await db.get("bookingTemplates", id)) ?? null;
  }

  async create(input: BookingTemplateInput): Promise<BookingTemplate> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const template: BookingTemplate = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("bookingTemplates", template);
    return template;
  }

  async update(id: string, patch: Partial<Pick<BookingTemplate, "name" | "description" | "template">>): Promise<BookingTemplate> {
    const db = await this.conn.getDb();
    const existing = await db.get("bookingTemplates", id);
    if (!existing) throw new NotFoundError("BookingTemplate", id);
    const updated: BookingTemplate = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("bookingTemplates", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("bookingTemplates", id);
  }
}

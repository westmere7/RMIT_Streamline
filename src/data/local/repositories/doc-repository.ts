import type { Doc, DocInput, DocPatch, DocSummary } from "@/domain";
import type { DocRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

const summary = ({ content: _content, ...rest }: Doc): DocSummary => rest;

export class LocalDocRepository implements DocRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<DocSummary[]> {
    const db = await this.conn.getDb();
    const docs = await db.getAllFromIndex("docs", "byWorkspace", workspaceId);
    return docs.map(summary).sort((a, b) => a.title.localeCompare(b.title));
  }

  async getById(id: string): Promise<Doc | null> {
    const db = await this.conn.getDb();
    return (await db.get("docs", id)) ?? null;
  }

  async create(input: DocInput): Promise<Doc> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const doc: Doc = {
      id: input.id ?? newId(),
      workspaceId: input.workspaceId,
      teamId: input.teamId,
      title: input.title,
      icon: input.icon ?? null,
      kind: input.kind,
      content: input.content ?? null,
      filePath: input.filePath ?? null,
      fileName: input.fileName ?? null,
      fileSize: input.fileSize ?? null,
      createdBy: input.createdBy,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.put("docs", doc);
    return doc;
  }

  async update(id: string, patch: DocPatch): Promise<Doc> {
    const db = await this.conn.getDb();
    const existing = await db.get("docs", id);
    if (!existing) throw new NotFoundError("Doc", id);
    const updated: Doc = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("docs", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("docs", id);
  }
}

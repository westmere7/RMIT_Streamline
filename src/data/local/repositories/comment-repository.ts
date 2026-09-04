import type { Comment, CommentInput } from "@/domain";
import type { CommentRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalCommentRepository implements CommentRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByItem(itemId: string): Promise<Comment[]> {
    const db = await this.conn.getDb();
    const comments = await db.getAllFromIndex("comments", "byItem", itemId);
    return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: CommentInput): Promise<Comment> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const comment: Comment = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("comments", comment);
    return comment;
  }

  async update(id: string, patch: Pick<Comment, "body" | "mentionUserIds">): Promise<Comment> {
    const db = await this.conn.getDb();
    const existing = await db.get("comments", id);
    if (!existing) throw new NotFoundError("Comment", id);
    const updated: Comment = { ...existing, ...patch, updatedAt: nowIso() };
    await db.put("comments", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("comments", id);
  }
}

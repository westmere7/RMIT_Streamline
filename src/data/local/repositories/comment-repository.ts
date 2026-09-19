import type { Comment, CommentInput } from "@/domain";
import type { CommentRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import type { LocalAutomationRepository } from "./automation-repository";

export class LocalCommentRepository implements CommentRepository {
  /** @param automations The queue this write announces itself to; see the item repository. */
  constructor(
    private readonly conn: LocalConnection,
    private readonly automations?: LocalAutomationRepository,
  ) {}

  async listByItem(itemId: string): Promise<Comment[]> {
    const db = await this.conn.getDb();
    const comments = await db.getAllFromIndex("comments", "byItem", itemId);
    return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listByItems(itemIds: string[]): Promise<Comment[]> {
    const db = await this.conn.getDb();
    const lists = await Promise.all(itemIds.map((itemId) => db.getAllFromIndex("comments", "byItem", itemId)));
    return lists.flat().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listBySharedId(sharedId: string): Promise<Comment[]> {
    const db = await this.conn.getDb();
    const all = await db.getAll("comments");
    return all.filter((comment) => comment.sharedId === sharedId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: CommentInput): Promise<Comment> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const comment: Comment = { sharedId: null, ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("comments", comment);
    const item = await db.get("items", comment.itemId);
    if (item) {
      await this.automations?.raise({
        boardId: item.boardId,
        itemId: item.id,
        kind: "comment_added",
        columnId: null,
        actorId: comment.authorId,
        payload: { commentId: comment.id, body: comment.body },
        depth: 0,
      });
    }
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

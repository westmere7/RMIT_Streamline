import { withCheck, withReaction, type Comment, type CommentInput, type CommentPinState } from "@/domain";
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
    const comment: Comment = { sharedId: null, parentId: null, ...input, id: newId(), createdAt: now, updatedAt: now };
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

  // Kept on the comment record itself: nothing here needs them apart.
  async setReaction(comment: Pick<Comment, "id" | "itemId">, userId: string, emoji: string, on: boolean): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction("comments", "readwrite");
    const existing = await tx.store.get(comment.id);
    if (!existing) throw new NotFoundError("Comment", comment.id);
    await tx.store.put({ ...existing, reactions: withReaction(existing.reactions, userId, emoji, on, nowIso()) });
    await tx.done;
  }

  async setCheck(comment: Pick<Comment, "id" | "itemId">, key: string, userId: string, on: boolean): Promise<void> {
    // Read and written in one transaction: ticks saved close together each
    // rewrite the whole update, and apart the later write could undo the earlier tick.
    const db = await this.conn.getDb();
    const tx = db.transaction("comments", "readwrite");
    const existing = await tx.store.get(comment.id);
    if (!existing) throw new NotFoundError("Comment", comment.id);
    await tx.store.put({ ...existing, checks: withCheck(existing.checks, key, userId, on, nowIso()) });
    await tx.done;
  }

  async setPin(comment: Pick<Comment, "id" | "itemId">, userId: string, state: CommentPinState): Promise<void> {
    const db = await this.conn.getDb();
    const existing = await db.get("comments", comment.id);
    if (!existing) throw new NotFoundError("Comment", comment.id);
    if (state === "overview") {
      // One overview pin per task: the one there now stays pinned, off the overview.
      for (const other of await db.getAllFromIndex("comments", "byItem", comment.itemId)) {
        if (other.id !== comment.id && other.pin?.overview) await db.put("comments", { ...other, pin: { ...other.pin, overview: false } });
      }
    }
    const pin = state === "none" ? null : { overview: state === "overview", pinnedBy: userId, pinnedAt: existing.pin?.pinnedAt ?? nowIso() };
    await db.put("comments", { ...existing, pin });
  }
}

import type { Comment, EntityId, User } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { truncate } from "@/lib/utils";

/** Finds `@Full Name` mentions for known users. */
export function extractMentions(body: string, users: readonly User[]): EntityId[] {
  const ids: EntityId[] = [];
  for (const user of users) {
    if (body.includes(`@${user.displayName}`) && !ids.includes(user.id)) ids.push(user.id);
  }
  return ids;
}

export class CommentService {
  constructor(private readonly repos: Repositories) {}

  listByItem(itemId: EntityId): Promise<Comment[]> {
    return this.repos.comments.listByItem(itemId);
  }

  async addComment(itemId: EntityId, body: string, actorId: EntityId, users: readonly User[]): Promise<Comment> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment cannot be empty");
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const board = await this.repos.boards.getById(item.boardId);
    const mentionUserIds = extractMentions(trimmed, users);
    const comment = await this.repos.comments.create({ itemId, authorId: actorId, body: trimmed, mentionUserIds });

    await this.repos.activities.create({
      workspaceId: board?.workspaceId ?? "",
      boardId: item.boardId,
      itemId,
      actorId,
      eventType: "COMMENT_ADDED",
      metadata: { itemName: item.name },
    });

    const actor = users.find((u) => u.id === actorId);
    const actorName = actor?.firstName ?? "Someone";
    const recipients = mentionUserIds.filter((id) => id !== actorId);
    if (recipients.length) {
      await this.repos.notifications.createMany(
        recipients.map((userId) => ({
          userId,
          type: "MENTION" as const,
          title: `${actorName} mentioned you in ${item.name}`,
          body: truncate(trimmed, 140),
          entityType: "ITEM" as const,
          entityId: itemId,
          boardId: item.boardId,
          actorId,
        })),
      );
    }
    return comment;
  }

  async editComment(commentId: EntityId, body: string, users: readonly User[]): Promise<Comment> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment cannot be empty");
    return this.repos.comments.update(commentId, { body: trimmed, mentionUserIds: extractMentions(trimmed, users) });
  }

  deleteComment(commentId: EntityId): Promise<void> {
    return this.repos.comments.delete(commentId);
  }
}

import type { Comment, EntityId, User } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { truncate } from "@/lib/utils";
import type { ItemLinkService } from "./item-link-service";
import { NotificationService } from "./notification-service";


/** Finds `@Full Name` mentions for known users. */
export function extractMentions(body: string, users: readonly User[]): EntityId[] {
  const ids: EntityId[] = [];
  for (const user of users) {
    if (body.includes(`@${user.displayName}`) && !ids.includes(user.id)) ids.push(user.id);
  }
  return ids;
}

export class CommentService {
  constructor(
    private readonly repos: Repositories,
    private readonly notifications: NotificationService,
    private readonly links?: ItemLinkService,
  ) {}

  listByItem(itemId: EntityId): Promise<Comment[]> {
    return this.repos.comments.listByItem(itemId);
  }


  /**
   * Posts an update. With `alsoLinked`, the same update is written to every item
   * this one is linked to, so a conversation started on one board is visible on
   * the other. Each copy is an ordinary comment on its own item — editing or
   * deleting one leaves the others alone.
   */
  async addComment(
    itemId: EntityId,
    body: string,
    actorId: EntityId,
    users: readonly User[],
    options: { alsoLinked?: boolean } = {},
  ): Promise<Comment> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment cannot be empty");
    const item = await this.repos.items.getById(itemId);
    if (!item) throw new NotFoundError("Item", itemId);
    const board = await this.repos.boards.getById(item.boardId);
    const mentionUserIds = extractMentions(trimmed, users);
    const comment = await this.repos.comments.create({ itemId, authorId: actorId, body: trimmed, mentionUserIds });

    const activities = [
      {
        workspaceId: board?.workspaceId ?? "",
        boardId: item.boardId,
        itemId,
        actorId,
        eventType: "COMMENT_ADDED" as const,
        metadata: { itemName: item.name },
      },
    ];

    if (options.alsoLinked && this.links) {
      const linkedIds = await this.links.connectedItemIds(itemId);
      for (const linked of await this.repos.items.listByIds(linkedIds)) {
        await this.repos.comments.create({ itemId: linked.id, authorId: actorId, body: trimmed, mentionUserIds });
        activities.push({
          workspaceId: board?.workspaceId ?? "",
          boardId: linked.boardId,
          itemId: linked.id,
          actorId,
          eventType: "COMMENT_ADDED" as const,
          metadata: { itemName: linked.name },
        });
      }
    }

    await this.repos.activities.createMany(activities);

    // One notification per mention, no matter how many copies were written.
    const actor = users.find((u) => u.id === actorId);
    const actorName = actor?.firstName ?? "Someone";
    const recipients = mentionUserIds.filter((id) => id !== actorId);
    if (recipients.length) {
      await this.notifications.deliver(
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

import { COMMENT_REACTIONS, RefusedError, type Comment, type CommentPinState, type EntityId, type NotificationType, type User } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId } from "@/lib/ids";
import { richTextToPlain } from "@/lib/rich-text";
import { truncate } from "@/lib/utils";
import type { ItemLinkService } from "./item-link-service";
import { NotificationService } from "./notification-service";


/** Finds `@Full Name` mentions for known users. */
export function extractMentions(body: string, users: readonly User[]): EntityId[] {
  const ids: EntityId[] = [];
  // Longest names first, each "@" claimed once, and a name must end where a
  // word does: "@Ann" is not a mention of Ann inside "@Anna Lee", nor is "@Ann
  // Lee" also a mention of Ann.
  const claimed = new Set<number>();
  const byLength = users.filter((u) => u.displayName.trim()).slice().sort((a, b) => b.displayName.length - a.displayName.length);
  for (const user of byLength) {
    const needle = `@${user.displayName}`;
    for (let at = body.indexOf(needle); at !== -1; at = body.indexOf(needle, at + 1)) {
      if (claimed.has(at) || /[\p{L}\p{N}]/u.test(body.charAt(at + needle.length))) continue;
      claimed.add(at);
      if (!ids.includes(user.id)) ids.push(user.id);
    }
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

  /** Gives or takes back the actor's emoji on an update or a reply. Only the offered set is accepted. */
  async setReaction(comment: Pick<Comment, "id" | "itemId">, emoji: string, actorId: EntityId, on: boolean): Promise<void> {
    if (!(COMMENT_REACTIONS as readonly string[]).includes(emoji)) throw new Error("That reaction is not one on offer");
    await this.repos.comments.setReaction(comment, actorId, emoji, on);
  }

  /**
   * Ticks or unticks one checklist box. An update posted to linked tasks is one
   * list, so the copies follow — where the actor may work on them; a copy on a
   * board they cannot edit keeps its own ticks rather than failing this one.
   */
  /**
   * Pins an update to the top of its task's updates, or to the task's overview
   * too (one per task: the one there before stays pinned below), or unpins it.
   * Replies are never pinned: a pin is a whole update, read on its own.
   */
  async setPin(comment: Pick<Comment, "id" | "itemId" | "parentId">, actorId: EntityId, state: CommentPinState): Promise<void> {
    if (comment.parentId) throw new RefusedError("A reply can't be pinned. Pin the update it answers.");
    await this.repos.comments.setPin(comment, actorId, state);
  }

  async setCheck(comment: Pick<Comment, "id" | "itemId" | "sharedId">, key: string, actorId: EntityId, on: boolean): Promise<void> {
    await this.repos.comments.setCheck(comment, key, actorId, on);
    if (!comment.sharedId) return;
    const copies = (await this.repos.comments.listBySharedId(comment.sharedId)).filter((copy) => copy.id !== comment.id);
    await Promise.allSettled(copies.map((copy) => this.repos.comments.setCheck(copy, key, actorId, on)));
  }


  /**
   * Posts an update. With `alsoLinked`, the same update is written to every item
   * this one is linked to, so a conversation started on one board is visible on
   * the other. Each copy is an ordinary comment on its own item; editing or
   * deleting any one of them applies to all of them (see below).
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
    // Only people active in this task's workspace can be mentioned. Callers
    // with the service role hand over every profile there is, and with several
    // workspaces an "@Name" must never reach somebody in another one.
    const members = board ? await this.repos.workspaces.listMembers(board.workspaceId) : [];
    const here = new Set(members.filter((m) => m.status === "ACTIVE").map((m) => m.userId));
    const mentionUserIds = extractMentions(trimmed, users.filter((u) => here.has(u.id)));

    // Copies posted to linked items in one action share an id, which is how an
    // edit later finds them and how the update says it lives on more than one
    // task. It is only assigned when there is actually somewhere else to post.
    const linkedIds = options.alsoLinked && this.links ? await this.links.connectedItemIds(itemId) : [];
    const linkedItems = linkedIds.length ? await this.repos.items.listByIds(linkedIds) : [];
    const sharedId = linkedItems.length ? newId() : null;

    const comment = await this.repos.comments.create({ itemId, authorId: actorId, body: trimmed, mentionUserIds, sharedId });

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

    if (linkedItems.length) {
      for (const linked of linkedItems) {
        await this.repos.comments.create({ itemId: linked.id, authorId: actorId, body: trimmed, mentionUserIds, sharedId });
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
          body: truncate(richTextToPlain(trimmed), 140),
          entityType: "ITEM" as const,
          entityId: itemId,
          boardId: item.boardId,
          actorId,
        })),
      );
    }
    return comment;
  }

  /**
   * Edits an update — and every copy of it. An update posted to linked tasks is
   * one thing said once, so changing it on one task and leaving a stale copy on
   * the other would be worse than not offering the edit at all.
   */
  async editComment(commentId: EntityId, body: string, users: readonly User[], context?: { itemId: EntityId; actorId: EntityId }): Promise<Comment> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Comment cannot be empty");
    // With the task known, an "@Name" reaches only people in its workspace, and
    // anyone newly mentioned hears about it as they would on a new update.
    const item = context ? await this.repos.items.getById(context.itemId) : null;
    const board = item ? await this.repos.boards.getById(item.boardId) : null;
    const before = item ? (await this.repos.comments.listByItem(item.id)).find((c) => c.id === commentId) : undefined;
    const reachable = board ? await this.mentionable(board.workspaceId, users) : users;
    const patch = { body: trimmed, mentionUserIds: extractMentions(trimmed, reachable) };
    const updated = await this.repos.comments.update(commentId, patch);
    if (updated.sharedId) {
      const copies = await this.repos.comments.listBySharedId(updated.sharedId);
      await Promise.all(copies.filter((copy) => copy.id !== updated.id).map((copy) => this.repos.comments.update(copy.id, patch)));
    }
    if (item && context && before) {
      const added = patch.mentionUserIds.filter((id) => id !== context.actorId && !before.mentionUserIds.includes(id));
      const actorName = users.find((u) => u.id === context.actorId)?.firstName ?? "Someone";
      if (added.length) {
        await this.notifications.deliver(
          added.map((userId) => ({ userId, type: "MENTION" as const, title: `${actorName} mentioned you in ${item.name}`, body: truncate(richTextToPlain(trimmed), 140), entityType: "ITEM" as const, entityId: item.id, boardId: item.boardId, actorId: context.actorId })),
        );
      }
    }
    return updated;
  }

  /** The people an "@Name" on this workspace's tasks can reach: those active in it. */
  private async mentionable(workspaceId: EntityId, users: readonly User[]): Promise<User[]> {
    const here = new Set((await this.repos.workspaces.listMembers(workspaceId)).filter((m) => m.status === "ACTIVE").map((m) => m.userId));
    return users.filter((u) => here.has(u.id));
  }

  /**
   * Replies to an update, on this task only (a reply answers the conversation
   * here, so it is not copied to linked tasks). A reply to a reply is filed
   * under the same update: threads are one level deep. The update's author
   * hears about it, and anyone mentioned hears as they would anywhere else.
   */
  async replyToComment(itemId: EntityId, parentId: EntityId, body: string, actorId: EntityId, users: readonly User[]): Promise<Comment> {
    const trimmed = body.trim();
    if (!trimmed) throw new Error("Reply cannot be empty");
    const all = await this.repos.comments.listByItem(itemId);
    const target = all.find((c) => c.id === parentId);
    if (!target) throw new NotFoundError("Comment", parentId);
    const root = target.parentId ? (all.find((c) => c.id === target.parentId) ?? target) : target;
    const item = await this.repos.items.getById(root.itemId);
    if (!item) throw new NotFoundError("Item", root.itemId);
    const board = await this.repos.boards.getById(item.boardId);
    // As on a new update: only people active in this workspace can be mentioned.
    const mentionUserIds = extractMentions(trimmed, board ? await this.mentionable(board.workspaceId, users) : []);
    const reply = await this.repos.comments.create({ itemId: root.itemId, authorId: actorId, body: trimmed, mentionUserIds, parentId: root.id });
    await this.repos.activities.create({
      workspaceId: board?.workspaceId ?? "",
      boardId: item.boardId,
      itemId: item.id,
      actorId,
      eventType: "COMMENT_ADDED",
      metadata: { itemName: item.name },
    });

    const actorName = users.find((u) => u.id === actorId)?.firstName ?? "Someone";
    const preview = truncate(richTextToPlain(trimmed), 140);
    const mentioned = mentionUserIds.filter((id) => id !== actorId);
    const deliveries = mentioned.map((userId) => ({
      userId,
      type: "MENTION" as NotificationType,
      title: `${actorName} mentioned you in ${item.name}`,
      body: preview,
      entityType: "ITEM" as const,
      entityId: item.id,
      boardId: item.boardId,
      actorId,
    }));
    // The update's author, unless they are replying to themselves or were just mentioned.
    if (root.authorId !== actorId && !mentioned.includes(root.authorId)) {
      deliveries.push({ userId: root.authorId, type: "COMMENT", title: `${actorName} replied to your update in ${item.name}`, body: preview, entityType: "ITEM" as const, entityId: item.id, boardId: item.boardId, actorId });
    }
    if (deliveries.length) await this.notifications.deliver(deliveries);
    return reply;
  }

  /** Deletes an update and, like editing, every copy of it on linked tasks — with the replies under each. */
  async deleteComment(comment: Pick<Comment, "id" | "sharedId" | "itemId">): Promise<void> {
    const copies = comment.sharedId ? await this.repos.comments.listBySharedId(comment.sharedId) : [];
    const ids = new Set([comment.id, ...copies.map((copy) => copy.id)]);
    // Postgres cascades replies away; the browser's own store does not, so they are named here.
    const itemIds = new Set([comment.itemId, ...copies.map((copy) => copy.itemId)]);
    const siblings = itemIds.size ? await this.repos.comments.listByItems([...itemIds]) : [];
    for (const reply of siblings) if (reply.parentId && ids.has(reply.parentId)) ids.add(reply.id);
    await Promise.all([...ids].map((id) => this.repos.comments.delete(id)));
  }
}

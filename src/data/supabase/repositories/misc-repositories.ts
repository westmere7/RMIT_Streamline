import type { Activity, ActivityInput, Comment, CommentInput, Notification, NotificationInput } from "@/domain";
import type { ActivityRepository, CommentRepository, DataAdminRepository, DataExport, NotificationRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import { assertOk, db, NotSupportedError, unwrap, unwrapList } from "../client";
import { toActivity, toComment, toNotification, type ActivityRow, type CommentRow, type NotificationRow } from "../rows";

const COMMENT = "id, item_id, author_id, body, mention_user_ids, created_at, updated_at";
const ACTIVITY = "id, workspace_id, board_id, item_id, actor_id, event_type, metadata, created_at";
const NOTIFICATION = "id, user_id, type, title, body, entity_type, entity_id, board_id, actor_id, read_at, created_at";

export class SupabaseCommentRepository implements CommentRepository {
  async listByItem(itemId: string): Promise<Comment[]> {
    const result = await db().from("comments").select(COMMENT).eq("item_id", itemId).order("created_at", { ascending: true });
    return unwrapList<CommentRow>(result, "comments.listByItem").map(toComment);
  }

  async create(input: CommentInput): Promise<Comment> {
    const payload = { item_id: input.itemId, author_id: input.authorId, body: input.body, mention_user_ids: input.mentionUserIds };
    const result = await db().from("comments").insert(payload).select(COMMENT).single();
    return toComment(unwrap<CommentRow>(result, "comments.create"));
  }

  async update(id: string, patch: Pick<Comment, "body" | "mentionUserIds">): Promise<Comment> {
    const payload = { body: patch.body, mention_user_ids: patch.mentionUserIds };
    const result = await db().from("comments").update(payload).eq("id", id).select(COMMENT).single();
    return toComment(unwrap<CommentRow>(result, "comments.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("comments").delete().eq("id", id), "comments.delete");
  }
}

export class SupabaseActivityRepository implements ActivityRepository {
  async listByWorkspace(workspaceId: string, limit: number): Promise<Activity[]> {
    const result = await db()
      .from("activities")
      .select(ACTIVITY)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return unwrapList<ActivityRow>(result, "activities.listByWorkspace").map(toActivity);
  }

  async listByBoard(boardId: string, limit: number): Promise<Activity[]> {
    const result = await db()
      .from("activities")
      .select(ACTIVITY)
      .eq("board_id", boardId)
      .order("created_at", { ascending: false })
      .limit(limit);
    return unwrapList<ActivityRow>(result, "activities.listByBoard").map(toActivity);
  }

  async listByItem(itemId: string): Promise<Activity[]> {
    const result = await db().from("activities").select(ACTIVITY).eq("item_id", itemId).order("created_at", { ascending: false });
    return unwrapList<ActivityRow>(result, "activities.listByItem").map(toActivity);
  }

  async create(input: ActivityInput): Promise<Activity> {
    const [activity] = await this.createMany([input]);
    if (!activity) throw new Error("createMany produced no result");
    return activity;
  }

  async createMany(inputs: ActivityInput[]): Promise<Activity[]> {
    if (inputs.length === 0) return [];
    // Stagger timestamps by a millisecond so a batch keeps its order when read back.
    const base = Date.now();
    const payload = inputs.map((input, index) => ({
      workspace_id: input.workspaceId,
      board_id: input.boardId,
      item_id: input.itemId,
      actor_id: input.actorId,
      event_type: input.eventType,
      metadata: input.metadata,
      created_at: new Date(base + index).toISOString(),
    }));
    const result = await db().from("activities").insert(payload).select(ACTIVITY);
    return unwrapList<ActivityRow>(result, "activities.createMany").map(toActivity);
  }
}

export class SupabaseNotificationRepository implements NotificationRepository {
  async listByUser(userId: string): Promise<Notification[]> {
    const result = await db().from("notifications").select(NOTIFICATION).eq("user_id", userId).order("created_at", { ascending: false });
    return unwrapList<NotificationRow>(result, "notifications.listByUser").map(toNotification);
  }

  async create(input: NotificationInput): Promise<Notification> {
    const [notification] = await this.createMany([input]);
    if (!notification) throw new Error("createMany produced no result");
    return notification;
  }

  /**
   * A notification is written *for someone else*, and `notifications_select`
   * only exposes rows to their recipient — so asking PostgREST to return the
   * inserted rows would fail the SELECT policy ("new row violates row-level
   * security policy"). Ids are therefore generated here and the rows are
   * returned from the input instead of from the database.
   */
  async createMany(inputs: NotificationInput[]): Promise<Notification[]> {
    if (inputs.length === 0) return [];
    const created: Notification[] = inputs.map((input) => ({ ...input, id: newId(), readAt: null, createdAt: nowIso() }));
    const payload = created.map((n) => ({
      id: n.id,
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      entity_type: n.entityType,
      entity_id: n.entityId,
      board_id: n.boardId,
      actor_id: n.actorId,
      created_at: n.createdAt,
    }));
    assertOk(await db().from("notifications").insert(payload), "notifications.createMany");
    return created;
  }

  async markRead(id: string, read: boolean): Promise<Notification> {
    const result = await db()
      .from("notifications")
      .update({ read_at: read ? new Date().toISOString() : null })
      .eq("id", id)
      .select(NOTIFICATION)
      .single();
    return toNotification(unwrap<NotificationRow>(result, "notifications.markRead"));
  }

  async markAllRead(userId: string): Promise<void> {
    assertOk(
      await db().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null),
      "notifications.markAllRead",
    );
  }
}

/**
 * Only the parts that make sense against a shared database: recent boards live in
 * `board_visits`. Reset/export/import are local-store conveniences — the Settings
 * → Data panel hides them when the provider is not local.
 */
export class SupabaseAdminRepository implements DataAdminRepository {
  async resetToSeed(): Promise<void> {
    throw new NotSupportedError("Resetting to the demo seed", "Run `npm run db:seed` against the project instead.");
  }

  async recordBoardVisit(userId: string, boardId: string): Promise<void> {
    assertOk(
      await db()
        .from("board_visits")
        .upsert({ user_id: userId, board_id: boardId, visited_at: new Date().toISOString() }, { onConflict: "user_id,board_id" }),
      "board_visits.recordBoardVisit",
    );
  }

  async listRecentBoardIds(userId: string, limit: number): Promise<string[]> {
    const result = await db()
      .from("board_visits")
      .select("board_id, visited_at")
      .eq("user_id", userId)
      .order("visited_at", { ascending: false })
      .limit(limit);
    return unwrapList<{ board_id: string }>(result, "board_visits.listRecentBoardIds").map((row) => row.board_id);
  }

  async exportAll(): Promise<DataExport> {
    throw new NotSupportedError("Exporting the database", "Use a Postgres dump (`pg_dump`) or the Supabase dashboard.");
  }

  async importAll(_data: DataExport): Promise<void> {
    throw new NotSupportedError("Importing a database export", "Restore a Postgres dump or run `npm run db:seed`.");
  }
}

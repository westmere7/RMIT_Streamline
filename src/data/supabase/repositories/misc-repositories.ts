import type {
  Activity,
  ActivityInput,
  BoardViewKind,
  Comment,
  CommentInput,
  Notification,
  NotificationPreferences,
  NotificationPreferencesInput,
  StoredDelivery,
} from "@/domain";
import { BOARD_VIEWS, defaultNotificationPreferences } from "@/domain";
import type {
  ActivityRepository,
  CommentRepository,
  DataAdminRepository,
  DataExport,
  DeliverableNotification,
  ItemReadRepository,
  NotificationPreferencesRepository,
  NotificationRepository,
} from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import { assertOk, db, NotSupportedError, unwrap, unwrapList, unwrapMaybe } from "../client";
import {
  toActivity,
  toComment,
  toNotification,
  toNotificationPreferences,
  type ActivityRow,
  type CommentRow,
  type NotificationPreferencesRow,
  type NotificationRow,
} from "../rows";

const COMMENT = "id, item_id, author_id, body, mention_user_ids, shared_id, created_at, updated_at";
const ACTIVITY = "id, workspace_id, board_id, item_id, actor_id, event_type, metadata, created_at";
const NOTIFICATION = "id, user_id, type, delivery, title, body, entity_type, entity_id, board_id, actor_id, read_at, created_at";
const NOTIFICATION_PREFERENCES = "user_id, types, muted_board_ids, browser_enabled, updated_at";

export class SupabaseCommentRepository implements CommentRepository {
  async listByItem(itemId: string): Promise<Comment[]> {
    const result = await db().from("comments").select(COMMENT).eq("item_id", itemId).order("created_at", { ascending: true });
    return unwrapList<CommentRow>(result, "comments.listByItem").map(toComment);
  }

  async listByItems(itemIds: string[]): Promise<Comment[]> {
    if (itemIds.length === 0) return [];
    // Postgres is happy with long IN lists, but keep each request a sane size.
    const chunks: string[][] = [];
    for (let i = 0; i < itemIds.length; i += 200) chunks.push(itemIds.slice(i, i + 200));
    const lists = await Promise.all(
      chunks.map(async (chunk) => {
        const result = await db().from("comments").select(COMMENT).in("item_id", chunk).order("created_at", { ascending: true });
        return unwrapList<CommentRow>(result, "comments.listByItems").map(toComment);
      }),
    );
    return lists.flat();
  }

  async listBySharedId(sharedId: string): Promise<Comment[]> {
    const result = await db().from("comments").select(COMMENT).eq("shared_id", sharedId).order("created_at", { ascending: true });
    return unwrapList<CommentRow>(result, "comments.listBySharedId").map(toComment);
  }

  async create(input: CommentInput): Promise<Comment> {
    const payload = {
      item_id: input.itemId,
      author_id: input.authorId,
      body: input.body,
      mention_user_ids: input.mentionUserIds,
      shared_id: input.sharedId ?? null,
    };
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

export class SupabaseItemReadRepository implements ItemReadRepository {
  async listByUser(userId: string): Promise<Record<string, string>> {
    const result = await db().from("item_reads").select("item_id, seen_at").eq("user_id", userId);
    const rows = unwrapList<{ item_id: string; seen_at: string }>(result, "item_reads.listByUser");
    return Object.fromEntries(rows.map((row) => [row.item_id, row.seen_at]));
  }

  async markSeen(userId: string, itemId: string, seenAt: string): Promise<void> {
    assertOk(await db().from("item_reads").upsert({ user_id: userId, item_id: itemId, seen_at: seenAt }, { onConflict: "user_id,item_id" }), "item_reads.markSeen");
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

  async create(input: DeliverableNotification): Promise<Notification> {
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
  async createMany(inputs: DeliverableNotification[]): Promise<Notification[]> {
    if (inputs.length === 0) return [];
    const created: Notification[] = inputs.map((input) => ({ ...input, id: newId(), readAt: null, createdAt: nowIso() }));
    const payload = created.map((n) => ({
      id: n.id,
      user_id: n.userId,
      type: n.type,
      delivery: n.delivery,
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

  async markAllRead(userId: string, delivery?: StoredDelivery): Promise<void> {
    let query = db().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
    if (delivery) query = query.eq("delivery", delivery);
    assertOk(await query, "notifications.markAllRead");
  }

  async deleteAll(userId: string, delivery?: StoredDelivery): Promise<void> {
    // Held to the caller's own rows by notifications_delete in
    // policies/0001_rls_policies.sql; the filter here narrows it to one tab,
    // and is not what makes it safe.
    let query = db().from("notifications").delete().eq("user_id", userId);
    if (delivery) query = query.eq("delivery", delivery);
    assertOk(await query, "notifications.deleteAll");
  }
}

/**
 * A person's notification choices. The row is created on first save, so an
 * account that has never opened the settings simply has no row and gets the
 * shipped defaults.
 */
export class SupabaseNotificationPreferencesRepository implements NotificationPreferencesRepository {
  async get(userId: string): Promise<NotificationPreferences | null> {
    const result = await db().from("notification_preferences").select(NOTIFICATION_PREFERENCES).eq("user_id", userId).maybeSingle();
    const row = unwrapMaybe<NotificationPreferencesRow>(result, "notificationPreferences.get");
    return row ? toNotificationPreferences(row) : null;
  }

  async save(userId: string, patch: NotificationPreferencesInput): Promise<NotificationPreferences> {
    const current = (await this.get(userId)) ?? defaultNotificationPreferences(userId);
    const next: NotificationPreferences = {
      ...current,
      ...patch,
      types: { ...current.types, ...(patch.types ?? {}) },
      userId,
      updatedAt: nowIso(),
    };
    const result = await db()
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          types: next.types,
          muted_board_ids: next.mutedBoardIds,
          browser_enabled: next.browserEnabled,
          updated_at: next.updatedAt,
        },
        { onConflict: "user_id" },
      )
      .select(NOTIFICATION_PREFERENCES)
      .single();
    return toNotificationPreferences(unwrap<NotificationPreferencesRow>(result, "notificationPreferences.save"));
  }

  /**
   * Used when writing notifications for other people, so it reads rows the
   * caller cannot select for themselves: `notification_preferences_delivery`
   * exposes exactly the columns the decision needs to anyone in the workspace.
   */
  async getMany(userIds: readonly string[]): Promise<Map<string, NotificationPreferences>> {
    if (userIds.length === 0) return new Map();
    const result = await db().from("notification_delivery_rules").select(NOTIFICATION_PREFERENCES).in("user_id", [...new Set(userIds)]);
    const rows = unwrapList<NotificationPreferencesRow>(result, "notificationPreferences.getMany");
    return new Map(rows.map((row) => [row.user_id, toNotificationPreferences(row)] as const));
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

  async recordBoardVisit(userId: string, boardId: string, view?: BoardViewKind): Promise<void> {
    // Only the columns sent are updated on conflict, so a visit without a view keeps the remembered one.
    assertOk(
      await db()
        .from("board_visits")
        .upsert({ user_id: userId, board_id: boardId, visited_at: new Date().toISOString(), ...(view ? { view } : {}) }, { onConflict: "user_id,board_id" }),
      "board_visits.recordBoardVisit",
    );
  }

  async getBoardVisitView(userId: string, boardId: string): Promise<BoardViewKind | null> {
    const result = await db().from("board_visits").select("view").eq("user_id", userId).eq("board_id", boardId).maybeSingle();
    const row = unwrapMaybe<{ view: string | null }>(result, "board_visits.getBoardVisitView");
    return row?.view && (BOARD_VIEWS as readonly string[]).includes(row.view) ? (row.view as BoardViewKind) : null;
  }

  async getBoardViewSettings(userId: string, boardId: string): Promise<Record<string, unknown>> {
    const result = await db().from("board_visits").select("view_settings").eq("user_id", userId).eq("board_id", boardId).maybeSingle();
    const row = unwrapMaybe<{ view_settings: Record<string, unknown> | null }>(result, "board_visits.getBoardViewSettings");
    return row?.view_settings ?? {};
  }

  async saveBoardViewSettings(userId: string, boardId: string, view: BoardViewKind, settings: Record<string, unknown>): Promise<void> {
    const current = await this.getBoardViewSettings(userId, boardId);
    assertOk(
      await db()
        .from("board_visits")
        .upsert({ user_id: userId, board_id: boardId, view_settings: { ...current, [view]: settings } }, { onConflict: "user_id,board_id" }),
      "board_visits.saveBoardViewSettings",
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

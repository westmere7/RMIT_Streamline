import type { Notification, NotificationPreferences, NotificationPreferencesInput, StoredDelivery } from "@/domain";
import { defaultNotificationPreferences } from "@/domain";
import type { DeliverableNotification, NotificationPreferencesRepository, NotificationRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/**
 * Rows written before notifications had a delivery are read as the loud kind,
 * which is what they were when they were written.
 */
function withDelivery(notification: Notification): Notification {
  return notification.delivery ? notification : { ...notification, delivery: "NOTIFICATION" };
}

export class LocalNotificationRepository implements NotificationRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByUser(userId: string): Promise<Notification[]> {
    const db = await this.conn.getDb();
    const list = await db.getAllFromIndex("notifications", "byUser", userId);
    return list.map(withDelivery).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: DeliverableNotification): Promise<Notification> {
    const [n] = await this.createMany([input]);
    if (!n) throw new Error("createMany produced no result");
    return n;
  }

  async createMany(inputs: DeliverableNotification[]): Promise<Notification[]> {
    if (inputs.length === 0) return [];
    const db = await this.conn.getDb();
    const tx = db.transaction("notifications", "readwrite");
    const now = nowIso();
    const created = inputs.map<Notification>((input) => ({ ...input, id: newId(), readAt: null, createdAt: now }));
    await Promise.all(created.map((n) => tx.store.put(n)));
    await tx.done;
    return created;
  }

  async markRead(id: string, read: boolean): Promise<Notification> {
    const db = await this.conn.getDb();
    const existing = await db.get("notifications", id);
    if (!existing) throw new NotFoundError("Notification", id);
    const updated: Notification = { ...withDelivery(existing), readAt: read ? nowIso() : null };
    await db.put("notifications", updated);
    return updated;
  }

  async markAllRead(userId: string, delivery?: StoredDelivery): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction("notifications", "readwrite");
    const list = await tx.store.index("byUser").getAll(userId);
    const now = nowIso();
    await Promise.all(
      list
        .map(withDelivery)
        .filter((n) => n.readAt === null && (!delivery || n.delivery === delivery))
        .map((n) => tx.store.put({ ...n, readAt: now })),
    );
    await tx.done;
  }
}

export class LocalNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(private readonly conn: LocalConnection) {}

  async get(userId: string): Promise<NotificationPreferences | null> {
    const db = await this.conn.getDb();
    return (await db.get("notificationPreferences", userId)) ?? null;
  }

  async save(userId: string, patch: NotificationPreferencesInput): Promise<NotificationPreferences> {
    const db = await this.conn.getDb();
    const current = (await db.get("notificationPreferences", userId)) ?? defaultNotificationPreferences(userId);
    const next: NotificationPreferences = {
      ...current,
      ...patch,
      types: { ...current.types, ...(patch.types ?? {}) },
      userId,
      updatedAt: nowIso(),
    };
    await db.put("notificationPreferences", next);
    return next;
  }

  async getMany(userIds: readonly string[]): Promise<Map<string, NotificationPreferences>> {
    if (userIds.length === 0) return new Map();
    const db = await this.conn.getDb();
    const found = new Map<string, NotificationPreferences>();
    await Promise.all(
      [...new Set(userIds)].map(async (id) => {
        const row = await db.get("notificationPreferences", id);
        if (row) found.set(id, row);
      }),
    );
    return found;
  }
}

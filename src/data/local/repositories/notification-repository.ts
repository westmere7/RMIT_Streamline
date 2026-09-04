import type { Notification, NotificationInput } from "@/domain";
import type { NotificationRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalNotificationRepository implements NotificationRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByUser(userId: string): Promise<Notification[]> {
    const db = await this.conn.getDb();
    const list = await db.getAllFromIndex("notifications", "byUser", userId);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: NotificationInput): Promise<Notification> {
    const [n] = await this.createMany([input]);
    if (!n) throw new Error("createMany produced no result");
    return n;
  }

  async createMany(inputs: NotificationInput[]): Promise<Notification[]> {
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
    const updated: Notification = { ...existing, readAt: read ? nowIso() : null };
    await db.put("notifications", updated);
    return updated;
  }

  async markAllRead(userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction("notifications", "readwrite");
    const list = await tx.store.index("byUser").getAll(userId);
    const now = nowIso();
    await Promise.all(list.filter((n) => n.readAt === null).map((n) => tx.store.put({ ...n, readAt: now })));
    await tx.done;
  }
}

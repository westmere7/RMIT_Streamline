import type { Activity, ActivityInput } from "@/domain";
import type { ActivityRepository } from "@/data/repositories";
import { newId } from "@/lib/ids";
import type { LocalConnection } from "../connection";

function newestFirst(activities: Activity[]): Activity[] {
  return activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class LocalActivityRepository implements ActivityRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string, limit: number): Promise<Activity[]> {
    const db = await this.conn.getDb();
    return newestFirst(await db.getAllFromIndex("activities", "byWorkspace", workspaceId)).slice(0, limit);
  }

  async listByBoard(boardId: string, limit: number): Promise<Activity[]> {
    const db = await this.conn.getDb();
    return newestFirst(await db.getAllFromIndex("activities", "byBoard", boardId)).slice(0, limit);
  }

  async listByItem(itemId: string): Promise<Activity[]> {
    const db = await this.conn.getDb();
    return newestFirst(await db.getAllFromIndex("activities", "byItem", itemId));
  }

  async create(input: ActivityInput): Promise<Activity> {
    const [activity] = await this.createMany([input]);
    if (!activity) throw new Error("createMany produced no result");
    return activity;
  }

  async createMany(inputs: ActivityInput[]): Promise<Activity[]> {
    if (inputs.length === 0) return [];
    const db = await this.conn.getDb();
    const tx = db.transaction("activities", "readwrite");
    const created: Activity[] = [];
    // Ensure strictly increasing timestamps within a batch so ordering is stable.
    const base = Date.now();
    inputs.forEach((input, index) => {
      created.push({ ...input, id: newId(), createdAt: new Date(base + index).toISOString() });
    });
    await Promise.all(created.map((a) => tx.store.put(a)));
    await tx.done;
    return created;
  }
}


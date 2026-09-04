import type { DataAdminRepository } from "@/data/repositories";
import { seedDatabase } from "@/data/seed/apply-seed";
import { nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import { clearAllStores } from "../database";

export class LocalAdminRepository implements DataAdminRepository {
  constructor(private readonly conn: LocalConnection) {}

  async resetToSeed(): Promise<void> {
    const db = await this.conn.getDb();
    await clearAllStores(db);
    await seedDatabase(db);
  }

  async recordBoardVisit(userId: string, boardId: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.put("boardVisits", { id: `${userId}:${boardId}`, userId, boardId, visitedAt: nowIso() });
  }

  async listRecentBoardIds(userId: string, limit: number): Promise<string[]> {
    const db = await this.conn.getDb();
    const visits = await db.getAllFromIndex("boardVisits", "byUser", userId);
    return visits
      .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
      .slice(0, limit)
      .map((v) => v.boardId);
  }
}

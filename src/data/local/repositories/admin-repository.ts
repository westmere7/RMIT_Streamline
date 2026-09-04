import type { DataAdminRepository, DataExport } from "@/data/repositories";
import { seedDatabase } from "@/data/seed/apply-seed";
import { nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import { ALL_STORES, clearAllStores, type StoreName } from "../database";

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

  async exportAll(): Promise<DataExport> {
    const db = await this.conn.getDb();
    const stores: Record<string, unknown[]> = {};
    for (const name of ALL_STORES) stores[name] = await db.getAll(name);
    return { format: "streamline-export", version: 1, exportedAt: nowIso(), stores };
  }

  async importAll(data: DataExport): Promise<void> {
    const db = await this.conn.getDb();
    await clearAllStores(db);
    const tx = db.transaction(ALL_STORES, "readwrite");
    for (const name of ALL_STORES) {
      const rows = data.stores[name];
      if (!Array.isArray(rows)) continue;
      const store = tx.objectStore(name as StoreName);
      // Rows were produced by exportAll() from the same schema; keys live inside the records.
      for (const row of rows) await store.put(row as never);
    }
    await tx.done;
  }
}

import type { ItemBaseline, ItemBaselineInput } from "@/domain";
import type { BaselineRepository } from "@/data/repositories";
import { nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/**
 * A board's baseline kept in the meta store, one record a board, rather than
 * in a store of its own: it is only ever read and written whole, so it needs
 * no index and no new database version.
 */
const keyOf = (boardId: string) => `baseline:${boardId}`;

export class LocalBaselineRepository implements BaselineRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByBoard(boardId: string): Promise<ItemBaseline[]> {
    const db = await this.conn.getDb();
    const record = await db.get("meta", keyOf(boardId));
    if (!record) return [];
    try {
      return JSON.parse(record.value) as ItemBaseline[];
    } catch {
      return [];
    }
  }

  async saveForBoard(boardId: string, rows: ItemBaselineInput[]): Promise<void> {
    const db = await this.conn.getDb();
    const savedAt = nowIso();
    // One person uses a local workspace, so who saved it is not kept.
    const baseline: ItemBaseline[] = rows.map((row) => ({ ...row, savedAt, savedBy: null }));
    await db.put("meta", { key: keyOf(boardId), value: JSON.stringify(baseline) });
  }

  async clearForBoard(boardId: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("meta", keyOf(boardId));
  }
}

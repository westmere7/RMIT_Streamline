import type { ItemBaseline, ItemBaselineInput } from "@/domain";
import type { BaselineRepository } from "@/data/repositories";
import { assertOk, db, unwrapAll } from "../client";

interface BaselineRow {
  item_id: string;
  start_date: string | null;
  end_date: string | null;
  saved_at: string;
  saved_by: string | null;
}

export class SupabaseBaselineRepository implements BaselineRepository {
  async listByBoard(boardId: string): Promise<ItemBaseline[]> {
    const rows = await unwrapAll<BaselineRow>(
      (from, to) => db().from("item_baselines").select("item_id, start_date, end_date, saved_at, saved_by").eq("board_id", boardId).order("item_id").range(from, to),
      "baselines.listByBoard",
    );
    return rows.map((row) => ({ itemId: row.item_id, start: row.start_date, end: row.end_date, savedAt: row.saved_at, savedBy: row.saved_by }));
  }

  /** One statement for the whole board (save_board_baseline, migration 0105), so a board never holds half of two plans. */
  async saveForBoard(boardId: string, rows: ItemBaselineInput[]): Promise<void> {
    const payload = rows.map((row) => ({ item_id: row.itemId, start_date: row.start, end_date: row.end }));
    const result = await db().rpc("save_board_baseline", { p_board_id: boardId, p_rows: payload });
    if (result.error) throw new Error(`baselines.saveForBoard: ${result.error.message}`);
  }

  async clearForBoard(boardId: string): Promise<void> {
    assertOk(await db().from("item_baselines").delete().eq("board_id", boardId), "baselines.clearForBoard");
  }
}

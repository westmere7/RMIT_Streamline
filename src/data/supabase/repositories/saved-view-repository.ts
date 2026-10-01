import type { SavedBoardView, SavedBoardViewInput, SavedBoardViewPatch } from "@/domain";
import { normaliseViewConfig } from "@/domain";
import type { SavedViewRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList } from "../client";
import { pruneUndefined } from "../rows";

const VIEW = "id, board_id, name, shared, config, created_by, created_at, updated_at";

interface SavedViewRow {
  id: string;
  board_id: string;
  name: string;
  shared: boolean;
  config: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toView(row: SavedViewRow): SavedBoardView {
  return { id: row.id, boardId: row.board_id, name: row.name, shared: row.shared, config: normaliseViewConfig(row.config), createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

/**
 * Saved board views. The `board_saved_views_*` policies (policies/0023) show
 * the shared views and the reader's own, let anyone who sees the board save a
 * private one, and keep the shared ones to the board's editors.
 */
export class SupabaseSavedViewRepository implements SavedViewRepository {
  // The policies already leave out other people's private views.
  async listByBoard(boardId: string): Promise<SavedBoardView[]> {
    const result = await db().from("board_saved_views").select(VIEW).eq("board_id", boardId).order("created_at", { ascending: true });
    return unwrapList<SavedViewRow>(result, "board_saved_views.listByBoard").map(toView);
  }

  async create(input: SavedBoardViewInput): Promise<SavedBoardView> {
    const payload = { board_id: input.boardId, name: input.name, shared: input.shared, config: input.config, created_by: input.createdBy };
    const result = await db().from("board_saved_views").insert(payload).select(VIEW).single();
    return toView(unwrap<SavedViewRow>(result, "board_saved_views.create"));
  }

  async update(id: string, patch: SavedBoardViewPatch): Promise<SavedBoardView> {
    const payload = pruneUndefined({ name: patch.name, shared: patch.shared, config: patch.config });
    const result = await db().from("board_saved_views").update(payload).eq("id", id).select(VIEW).single();
    return toView(unwrap<SavedViewRow>(result, "board_saved_views.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("board_saved_views").delete().eq("id", id), "board_saved_views.delete");
  }
}

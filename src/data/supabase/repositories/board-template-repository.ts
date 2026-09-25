import type { BoardTemplateSpec, SavedBoardTemplate, SavedBoardTemplateInput } from "@/domain";
import type { BoardTemplateRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

const TEMPLATE = "id, workspace_id, name, description, spec, created_by, created_at, updated_at";

interface BoardTemplateRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  spec: BoardTemplateSpec;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toTemplate(row: BoardTemplateRow): SavedBoardTemplate {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description ?? null, spec: row.spec, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Saved board layouts. `board_templates_*` policies let members read and save, and the saver or an admin change them. */
export class SupabaseBoardTemplateRepository implements BoardTemplateRepository {
  async listByWorkspace(workspaceId: string): Promise<SavedBoardTemplate[]> {
    const result = await db().from("board_templates").select(TEMPLATE).eq("workspace_id", workspaceId).order("name", { ascending: true });
    return unwrapList<BoardTemplateRow>(result, "board_templates.listByWorkspace").map(toTemplate);
  }

  async getById(id: string): Promise<SavedBoardTemplate | null> {
    const result = await db().from("board_templates").select(TEMPLATE).eq("id", id).maybeSingle();
    const row = unwrapMaybe<BoardTemplateRow>(result, "board_templates.getById");
    return row ? toTemplate(row) : null;
  }

  async create(input: SavedBoardTemplateInput): Promise<SavedBoardTemplate> {
    const payload = { workspace_id: input.workspaceId, name: input.name, description: input.description, spec: input.spec, created_by: input.createdBy };
    const result = await db().from("board_templates").insert(payload).select(TEMPLATE).single();
    return toTemplate(unwrap<BoardTemplateRow>(result, "board_templates.create"));
  }

  async update(id: string, patch: Partial<Pick<SavedBoardTemplate, "name" | "description" | "spec">>): Promise<SavedBoardTemplate> {
    const payload = pruneUndefined({ name: patch.name, description: patch.description, spec: patch.spec });
    const result = await db().from("board_templates").update(payload).eq("id", id).select(TEMPLATE).single();
    return toTemplate(unwrap<BoardTemplateRow>(result, "board_templates.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("board_templates").delete().eq("id", id), "board_templates.delete");
  }
}

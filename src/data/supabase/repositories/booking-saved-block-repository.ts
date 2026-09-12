import type { BookingBlock, BookingSavedBlock, BookingSavedBlockInput } from "@/domain";
import type { BookingSavedBlockRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList } from "../client";
import { pruneUndefined } from "../rows";

const SAVED_BLOCK = "id, workspace_id, name, block, created_by, created_at, updated_at";

interface BookingSavedBlockRow {
  id: string;
  workspace_id: string;
  name: string;
  block: BookingBlock;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toSavedBlock(row: BookingSavedBlockRow): BookingSavedBlock {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, block: row.block, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Saved brief blocks. `booking_saved_blocks_*` policies let members read and admins write. */
export class SupabaseBookingSavedBlockRepository implements BookingSavedBlockRepository {
  async listByWorkspace(workspaceId: string): Promise<BookingSavedBlock[]> {
    const result = await db().from("booking_saved_blocks").select(SAVED_BLOCK).eq("workspace_id", workspaceId).order("name", { ascending: true });
    return unwrapList<BookingSavedBlockRow>(result, "booking_saved_blocks.listByWorkspace").map(toSavedBlock);
  }

  async create(input: BookingSavedBlockInput): Promise<BookingSavedBlock> {
    const payload = { workspace_id: input.workspaceId, name: input.name, block: input.block, created_by: input.createdBy };
    const result = await db().from("booking_saved_blocks").insert(payload).select(SAVED_BLOCK).single();
    return toSavedBlock(unwrap<BookingSavedBlockRow>(result, "booking_saved_blocks.create"));
  }

  async update(id: string, patch: Partial<Pick<BookingSavedBlock, "name" | "block">>): Promise<BookingSavedBlock> {
    const payload = pruneUndefined({ name: patch.name, block: patch.block });
    const result = await db().from("booking_saved_blocks").update(payload).eq("id", id).select(SAVED_BLOCK).single();
    return toSavedBlock(unwrap<BookingSavedBlockRow>(result, "booking_saved_blocks.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("booking_saved_blocks").delete().eq("id", id), "booking_saved_blocks.delete");
  }
}

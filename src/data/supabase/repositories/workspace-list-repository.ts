import type { WorkspaceListKey, WorkspaceListOption, WorkspaceListOptionInput } from "@/domain";
import { asColor } from "@/domain";
import type { WorkspaceListRepository } from "@/data/repositories";
import { assertOk, db, unwrapList } from "../client";

const LIST = "id, workspace_id, list_key, name, color, position, created_at, updated_at";

interface WorkspaceListRow {
  id: string;
  workspace_id: string;
  list_key: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

function toOption(row: WorkspaceListRow): WorkspaceListOption {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    listKey: row.list_key as WorkspaceListKey,
    name: row.name,
    color: asColor(row.color),
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The workspace's shared lists. Every member reads them; only workspace admins
 * write, which the policies enforce (policies/0011_workspace_lists_policies.sql).
 */
export class SupabaseWorkspaceListRepository implements WorkspaceListRepository {
  async listByWorkspace(workspaceId: string): Promise<WorkspaceListOption[]> {
    const result = await db().from("workspace_lists").select(LIST).eq("workspace_id", workspaceId).order("position", { ascending: true });
    return unwrapList<WorkspaceListRow>(result, "workspace_lists.listByWorkspace").map(toOption);
  }

  /** One list, written out whole: the old rows go, the new ones land in order. */
  async replace(workspaceId: string, listKey: WorkspaceListKey, options: WorkspaceListOptionInput[]): Promise<WorkspaceListOption[]> {
    assertOk(await db().from("workspace_lists").delete().eq("workspace_id", workspaceId).eq("list_key", listKey), "workspace_lists.replace.delete");
    if (options.length === 0) return [];
    const payload = options.map((option) => ({
      workspace_id: workspaceId,
      list_key: listKey,
      name: option.name,
      color: option.color,
      position: option.position,
    }));
    const result = await db().from("workspace_lists").insert(payload).select(LIST);
    return unwrapList<WorkspaceListRow>(result, "workspace_lists.replace.insert").map(toOption);
  }
}

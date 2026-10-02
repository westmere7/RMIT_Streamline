import type { Doc, DocInput, DocKind, DocPatch, DocSummary } from "@/domain";
import type { DocRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

/** Everything but the page, for lists. */
const SUMMARY = "id, workspace_id, team_id, title, icon, kind, file_path, file_name, file_size, created_by, updated_by, created_at, updated_at";
const FULL = `${SUMMARY}, content`;

interface DocRow {
  id: string;
  workspace_id: string;
  team_id: string | null;
  title: string;
  icon: string | null;
  kind: DocKind;
  content?: Record<string, unknown> | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

function toSummary(row: DocRow): DocSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    title: row.title,
    icon: row.icon,
    kind: row.kind === "pdf" ? "pdf" : "page",
    filePath: row.file_path,
    fileName: row.file_name,
    fileSize: row.file_size === null ? null : Number(row.file_size),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const toDoc = (row: DocRow): Doc => ({ ...toSummary(row), content: row.content ?? null });

export class SupabaseDocRepository implements DocRepository {
  async listByWorkspace(workspaceId: string): Promise<DocSummary[]> {
    const result = await db().from("docs").select(SUMMARY).eq("workspace_id", workspaceId).order("title", { ascending: true });
    return unwrapList<DocRow>(result, "docs.listByWorkspace").map(toSummary);
  }

  async getById(id: string): Promise<Doc | null> {
    const row = unwrapMaybe<DocRow>(await db().from("docs").select(FULL).eq("id", id).maybeSingle(), "docs.getById");
    return row ? toDoc(row) : null;
  }

  async create(input: DocInput): Promise<Doc> {
    const payload = pruneUndefined({
      id: input.id,
      workspace_id: input.workspaceId,
      team_id: input.teamId,
      title: input.title,
      icon: input.icon ?? null,
      kind: input.kind,
      content: input.content ?? null,
      file_path: input.filePath ?? null,
      file_name: input.fileName ?? null,
      file_size: input.fileSize ?? null,
      created_by: input.createdBy,
    });
    return toDoc(unwrap<DocRow>(await db().from("docs").insert(payload).select(FULL).single(), "docs.create"));
  }

  async update(id: string, patch: DocPatch): Promise<Doc> {
    const payload = pruneUndefined({ title: patch.title, icon: patch.icon, content: patch.content, team_id: patch.teamId, updated_by: patch.updatedBy });
    return toDoc(unwrap<DocRow>(await db().from("docs").update(payload).eq("id", id).select(FULL).single(), "docs.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("docs").delete().eq("id", id), "docs.delete");
  }
}

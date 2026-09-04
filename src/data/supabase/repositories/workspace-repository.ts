import type { Workspace, WorkspaceMember } from "@/domain";
import type { WorkspaceRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined, toWorkspace, toWorkspaceMember, type WorkspaceMemberRow, type WorkspaceRow } from "../rows";

const WORKSPACE = "id, name, slug, logo_url, created_at, updated_at";
const MEMBER = "id, workspace_id, user_id, role, status, joined_at";

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  async list(): Promise<Workspace[]> {
    const result = await db().from("workspaces").select(WORKSPACE).order("name", { ascending: true });
    return unwrapList<WorkspaceRow>(result, "workspaces.list").map(toWorkspace);
  }

  async getById(id: string): Promise<Workspace | null> {
    const result = await db().from("workspaces").select(WORKSPACE).eq("id", id).maybeSingle();
    const row = unwrapMaybe<WorkspaceRow>(result, "workspaces.getById");
    return row ? toWorkspace(row) : null;
  }

  async getBySlug(slug: string): Promise<Workspace | null> {
    const result = await db().from("workspaces").select(WORKSPACE).eq("slug", slug).maybeSingle();
    const row = unwrapMaybe<WorkspaceRow>(result, "workspaces.getBySlug");
    return row ? toWorkspace(row) : null;
  }

  async update(id: string, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<Workspace> {
    const payload = pruneUndefined({ name: patch.name, slug: patch.slug, logo_url: patch.logoUrl });
    const result = await db().from("workspaces").update(payload).eq("id", id).select(WORKSPACE).single();
    return toWorkspace(unwrap<WorkspaceRow>(result, "workspaces.update"));
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const result = await db().from("workspace_members").select(MEMBER).eq("workspace_id", workspaceId);
    return unwrapList<WorkspaceMemberRow>(result, "workspace_members.listMembers").map(toWorkspaceMember);
  }

  async listMembershipsForUser(userId: string): Promise<WorkspaceMember[]> {
    const result = await db().from("workspace_members").select(MEMBER).eq("user_id", userId);
    return unwrapList<WorkspaceMemberRow>(result, "workspace_members.listMembershipsForUser").map(toWorkspaceMember);
  }

  async addMember(input: Omit<WorkspaceMember, "id">): Promise<WorkspaceMember> {
    const payload = {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      role: input.role,
      status: input.status,
      joined_at: input.joinedAt,
    };
    const result = await db().from("workspace_members").insert(payload).select(MEMBER).single();
    return toWorkspaceMember(unwrap<WorkspaceMemberRow>(result, "workspace_members.addMember"));
  }

  async updateMember(id: string, patch: Partial<Omit<WorkspaceMember, "id">>): Promise<WorkspaceMember> {
    const payload = pruneUndefined({
      workspace_id: patch.workspaceId,
      user_id: patch.userId,
      role: patch.role,
      status: patch.status,
      joined_at: patch.joinedAt,
    });
    const result = await db().from("workspace_members").update(payload).eq("id", id).select(MEMBER).single();
    return toWorkspaceMember(unwrap<WorkspaceMemberRow>(result, "workspace_members.updateMember"));
  }

  async removeMember(id: string): Promise<void> {
    assertOk(await db().from("workspace_members").delete().eq("id", id), "workspace_members.removeMember");
  }
}

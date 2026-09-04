import type { Workspace, WorkspaceMember } from "@/domain";
import type { WorkspaceRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly conn: LocalConnection) {}

  async list(): Promise<Workspace[]> {
    const db = await this.conn.getDb();
    return db.getAll("workspaces");
  }

  async getById(id: string): Promise<Workspace | null> {
    const db = await this.conn.getDb();
    return (await db.get("workspaces", id)) ?? null;
  }

  async getBySlug(slug: string): Promise<Workspace | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("workspaces", "bySlug", slug)) ?? null;
  }

  async update(id: string, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<Workspace> {
    const db = await this.conn.getDb();
    const existing = await db.get("workspaces", id);
    if (!existing) throw new NotFoundError("Workspace", id);
    const updated: Workspace = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("workspaces", updated);
    return updated;
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("workspaceMembers", "byWorkspace", workspaceId);
  }

  async listMembershipsForUser(userId: string): Promise<WorkspaceMember[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("workspaceMembers", "byUser", userId);
  }

  async addMember(input: Omit<WorkspaceMember, "id">): Promise<WorkspaceMember> {
    const db = await this.conn.getDb();
    const member: WorkspaceMember = { ...input, id: newId() };
    await db.put("workspaceMembers", member);
    return member;
  }

  async updateMember(id: string, patch: Partial<Omit<WorkspaceMember, "id">>): Promise<WorkspaceMember> {
    const db = await this.conn.getDb();
    const existing = await db.get("workspaceMembers", id);
    if (!existing) throw new NotFoundError("WorkspaceMember", id);
    const updated: WorkspaceMember = { ...existing, ...patch, id };
    await db.put("workspaceMembers", updated);
    return updated;
  }

  async removeMember(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("workspaceMembers", id);
  }
}

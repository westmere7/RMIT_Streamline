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

  /** The booking counter, bumped inside one transaction like the ticket counter below. */
  async countFormBooking(workspaceId: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaces", "readwrite");
    const existing = await tx.store.get(workspaceId);
    if (existing) await tx.store.put({ ...existing, bookingFormBookings: (existing.bookingFormBookings ?? 0) + 1 });
    await tx.done;
  }

  /**
   * The same bargain as the Supabase provider, inside one IndexedDB
   * transaction: read the counter, add to it and write it back with nothing
   * able to interleave. One browser tab is the whole world here, but the rule
   * this upholds is the same one.
   */
  async allocateTicketNumbers(workspaceId: string, count = 1): Promise<number> {
    if (count < 1) throw new Error("workspaces.allocateTicketNumbers: count must be at least 1");
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaces", "readwrite");
    const existing = await tx.store.get(workspaceId);
    if (!existing) {
      await tx.done;
      throw new NotFoundError("Workspace", workspaceId);
    }
    const taken = (existing.ticketCounter ?? 0) + count;
    await tx.store.put({ ...existing, ticketCounter: taken, updatedAt: nowIso() });
    await tx.done;
    return taken - count + 1;
  }

  async allocateBugTicketNumbers(workspaceId: string, count = 1): Promise<number> {
    if (count < 1) throw new Error("workspaces.allocateBugTicketNumbers: count must be at least 1");
    const db = await this.conn.getDb();
    const tx = db.transaction("workspaces", "readwrite");
    const existing = await tx.store.get(workspaceId);
    if (!existing) {
      await tx.done;
      throw new NotFoundError("Workspace", workspaceId);
    }
    const taken = (existing.bugTicketCounter ?? 0) + count;
    await tx.store.put({ ...existing, bugTicketCounter: taken, updatedAt: nowIso() });
    await tx.done;
    return taken - count + 1;
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

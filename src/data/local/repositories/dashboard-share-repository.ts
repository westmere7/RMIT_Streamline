import type { DashboardShare, DashboardShareInput } from "@/domain";
import type { DashboardShareRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/** One dashboard link per workspace, found from the workspace (to manage it) or the token (to serve it). */
export class LocalDashboardShareRepository implements DashboardShareRepository {
  constructor(private readonly conn: LocalConnection) {}

  async getByWorkspace(workspaceId: string): Promise<DashboardShare | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("dashboardShares", "byWorkspace", workspaceId)) ?? null;
  }

  async getByToken(token: string): Promise<DashboardShare | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("dashboardShares", "byToken", token)) ?? null;
  }

  async create(input: DashboardShareInput): Promise<DashboardShare> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const share: DashboardShare = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("dashboardShares", share);
    return share;
  }

  async update(id: string, patch: Partial<Pick<DashboardShare, "token" | "enabled" | "expiresAt" | "passwordHash">>): Promise<DashboardShare> {
    const db = await this.conn.getDb();
    const existing = await db.get("dashboardShares", id);
    if (!existing) throw new NotFoundError("DashboardShare", id);
    const updated: DashboardShare = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("dashboardShares", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("dashboardShares", id);
  }
}

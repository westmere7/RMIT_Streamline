import type { DashboardShare, DashboardShareInput } from "@/domain";
import type { DashboardShareRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

const SHARE = "id, workspace_id, token, enabled, expires_at, password_hash, created_by, created_at, updated_at";

interface DashboardShareRow {
  id: string;
  workspace_id: string;
  token: string;
  enabled: boolean;
  expires_at: string | null;
  password_hash: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toDashboardShare(row: DashboardShareRow): DashboardShare {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    token: row.token,
    enabled: row.enabled,
    expiresAt: row.expires_at,
    passwordHash: row.password_hash,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * The public link of a workspace's dashboard. `dashboard_shares_*` policies let
 * members see that a link exists and admins change it; a visitor's read goes
 * through the service role in src/server/dashboard-share.ts, because there is
 * no session for a policy to judge.
 */
export class SupabaseDashboardShareRepository implements DashboardShareRepository {
  async getByWorkspace(workspaceId: string): Promise<DashboardShare | null> {
    const result = await db().from("dashboard_shares").select(SHARE).eq("workspace_id", workspaceId).maybeSingle();
    const row = unwrapMaybe<DashboardShareRow>(result, "dashboard_shares.getByWorkspace");
    return row ? toDashboardShare(row) : null;
  }

  async getByToken(token: string): Promise<DashboardShare | null> {
    const result = await db().from("dashboard_shares").select(SHARE).eq("token", token).maybeSingle();
    const row = unwrapMaybe<DashboardShareRow>(result, "dashboard_shares.getByToken");
    return row ? toDashboardShare(row) : null;
  }

  async create(input: DashboardShareInput): Promise<DashboardShare> {
    const payload = {
      workspace_id: input.workspaceId,
      token: input.token,
      enabled: input.enabled,
      expires_at: input.expiresAt,
      password_hash: input.passwordHash,
      created_by: input.createdBy,
    };
    const result = await db().from("dashboard_shares").insert(payload).select(SHARE).single();
    return toDashboardShare(unwrap<DashboardShareRow>(result, "dashboard_shares.create"));
  }

  async update(id: string, patch: Partial<Pick<DashboardShare, "token" | "enabled" | "expiresAt" | "passwordHash">>): Promise<DashboardShare> {
    const payload = pruneUndefined({ token: patch.token, enabled: patch.enabled, expires_at: patch.expiresAt, password_hash: patch.passwordHash });
    const result = await db().from("dashboard_shares").update(payload).eq("id", id).select(SHARE).single();
    return toDashboardShare(unwrap<DashboardShareRow>(result, "dashboard_shares.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("dashboard_shares").delete().eq("id", id), "dashboard_shares.delete");
  }
}

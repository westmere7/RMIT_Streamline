import { z } from "zod";
import type { DashboardShareGate, PublicDashboardResponse } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gateDashboardShare, loadSharedDashboard } from "@/services/dashboard-service";

/**
 * The shared dashboard for the Supabase provider.
 *
 * A visitor has no account, so RLS has nobody to reason about and the read runs
 * with the service role. The token is the whole of the authorisation and only
 * ever reaches loadSharedDashboard, which returns one trimmed snapshot and
 * refuses everything else. Nothing here writes.
 */

/** The password, when the link has one, and the revision the page already holds. */
export const dashboardPasswordSchema = z.object({ password: z.string().max(200).nullable().optional(), revision: z.string().max(100).nullable().optional() });

export async function loadDashboardGate(token: string): Promise<DashboardShareGate> {
  return gateDashboardShare(serviceRoleRepositories(), token);
}

export async function loadPublicDashboard(token: string, password: string | null, known: string | null): Promise<PublicDashboardResponse> {
  return loadSharedDashboard(serviceRoleRepositories(), token, password, { known, current: readWorkspaceRevision });
}

/**
 * The workspace's revision, as the number and the moment it was bumped. The
 * moment matters after a snapshot restore, which can put an old number back.
 * No row yet reads as "0"; a failed read as null, which only means the whole
 * dashboard is read, as it was before there were revisions.
 */
async function readWorkspaceRevision(workspaceId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdminClient().from("workspace_revisions").select("revision, changed_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) return null;
  return data ? `${data.revision}:${data.changed_at}` : "0";
}

function serviceRoleRepositories() {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createSupabaseRepositories();
}

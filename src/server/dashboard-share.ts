import { z } from "zod";
import type { DashboardShareGate, PublicDashboardResponse } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { gateDashboardShare, loadSharedDashboard } from "@/services/dashboard-service";
import { readWorkspaceRevision } from "./workspace-revision";

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

function serviceRoleRepositories() {
  routeRepositoriesThrough(getSupabaseAdminClient());
  return createSupabaseRepositories();
}

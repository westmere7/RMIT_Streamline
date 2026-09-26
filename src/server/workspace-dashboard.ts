import type { DashboardSnapshot } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { buildPermissionContext } from "@/lib/permissions/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadViewerDashboard } from "@/services/dashboard-service";
import { HttpError } from "./http";

/**
 * The workspace dashboard for the Supabase provider.
 *
 * A member's session cannot select the boards they cannot open, so a dashboard
 * read with it counts less for them than for an admin. The figures are the
 * workspace's, so the route reads every board with the service role and hands
 * back the snapshot trimmed for this reader (viewerDashboardSnapshot): the same
 * totals, and nothing to read on a board they could not open.
 */
export async function loadWorkspaceDashboard(request: Request, slug: string): Promise<DashboardSnapshot> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, "Sign in to see the dashboard.");
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");

  const found = await admin.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (found.error) throw new HttpError(500, `workspaces.bySlug: ${found.error.message}`);
  const workspace = found.data as { id: string } | null;
  if (!workspace) throw new HttpError(404, "That workspace does not exist.");

  routeRepositoriesThrough(admin);
  const repos = createSupabaseRepositories();
  const [members, teamMembers, boardMembers] = await Promise.all([
    repos.workspaces.listMembers(workspace.id),
    repos.teams.listMembersByWorkspace(workspace.id),
    repos.boards.listMembersByWorkspace(workspace.id),
  ]);
  const viewer = buildPermissionContext({ userId: data.user.id, workspaceMembers: members, teamMembers, boardMembers });
  if (viewer.workspaceRole === null) throw new HttpError(403, "Only members of this workspace can see its dashboard.");
  return loadViewerDashboard(repos, workspace.id, viewer);
}

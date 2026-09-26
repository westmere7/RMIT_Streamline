import { handleRoute, json } from "@/server/http";
import { loadWorkspaceDashboard } from "@/server/workspace-dashboard";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/** The workspace's dashboard for the signed-in member: every board counted, trimmed for them. */
export const GET = handleRoute(async (request: Request, { params }: Context) => {
  const { slug } = await params;
  return json(await loadWorkspaceDashboard(request, decodeURIComponent(slug)));
});

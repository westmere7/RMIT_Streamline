import { ShareAccessError } from "@/services/board-share-service";
import { handleRoute, json, readJson } from "@/server/http";
import { dashboardPasswordSchema, loadDashboardGate, loadPublicDashboard } from "@/server/dashboard-share";
import { shareErrorStatus } from "@/server/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** Whether the link is live and whether it wants a password. Says nothing about the workspace. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  return json(await loadDashboardGate(decodeURIComponent(token)));
});

/** The dashboard behind the link. A POST because the password belongs in the body, not in server logs. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = dashboardPasswordSchema.parse(await readJson(request));
  try {
    return json(await loadPublicDashboard(decodeURIComponent(token), body.password ?? null));
  } catch (error) {
    if (error instanceof ShareAccessError) return json({ error: error.message, reason: error.reason }, shareErrorStatus(error));
    throw error;
  }
});

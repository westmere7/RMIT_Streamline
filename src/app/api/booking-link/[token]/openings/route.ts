import { ShareAccessError } from "@/services/board-share-service";
import { handleRoute, json } from "@/server/http";
import { loadTaskLinkOpenings, shareErrorStatus } from "@/server/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** Where else a booking's task opens for the caller (its board, the portal), behind the link's own checks. */
export const GET = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  try {
    return json(await loadTaskLinkOpenings(decodeURIComponent(token), request));
  } catch (error) {
    if (error instanceof ShareAccessError) return json({ error: error.message, reason: error.reason }, shareErrorStatus(error));
    throw error;
  }
});

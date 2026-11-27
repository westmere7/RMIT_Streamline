import { ShareAccessError } from "@/services/board-share-service";
import { handleRoute, json } from "@/server/http";
import { portalServices } from "@/server/portal";
import { shareErrorStatus } from "@/server/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * A booking's task, read-only, by the link on its receipt (src/domain/booking/task-link.ts).
 * No session: the signature in the link is the key, checked with the server's secret.
 */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  try {
    return json(await portalServices().taskLinks.open(decodeURIComponent(token)));
  } catch (error) {
    if (error instanceof ShareAccessError) return json({ error: error.message, reason: error.reason }, shareErrorStatus(error));
    throw error;
  }
});

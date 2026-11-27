import { ShareAccessError } from "@/services/board-share-service";
import { handleRoute, json, readJson } from "@/server/http";
import { loadShareItemOpenings, shareErrorStatus, sharePasswordSchema } from "@/server/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * Where else the shared task opens for the caller: its board when their own
 * session can see it, the portal while it is open and shows the task. Behind
 * the link's own checks, password included. Asked once per visit.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = sharePasswordSchema.parse(await readJson(request));
  try {
    return json(await loadShareItemOpenings(decodeURIComponent(token), body.password ?? null, request));
  } catch (error) {
    if (error instanceof ShareAccessError) return json({ error: error.message, reason: error.reason }, shareErrorStatus(error));
    throw error;
  }
});

import { ShareAccessError } from "@/services/board-share-service";
import { handleRoute, json, readJson } from "@/server/http";
import { loadShareBoard, loadShareGate, shareErrorStatus, sharePasswordSchema } from "@/server/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** Whether the link is live and whether it wants a password. Says nothing about the board. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  return json(await loadShareGate(decodeURIComponent(token)));
});

/**
 * The board behind the link. A POST because the password belongs in the body:
 * a query string would end up in server logs and browser history.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = sharePasswordSchema.parse(await readJson(request));
  try {
    return json(await loadShareBoard(decodeURIComponent(token), body.password ?? null));
  } catch (error) {
    // The page needs the reason to know whether to ask for a password again.
    if (error instanceof ShareAccessError) return json({ error: error.message, reason: error.reason }, shareErrorStatus(error));
    throw error;
  }
});

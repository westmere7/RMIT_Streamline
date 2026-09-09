import { ShareAccessError } from "@/services/board-share-service";
import { handleRoute, json, readJson } from "@/server/http";
import { loadShareItem, loadShareItemGate, shareErrorStatus, sharePasswordSchema, shareViewer } from "@/server/share";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** Whether the link is live, whether it wants a password, and who it opens for. Says nothing about the task. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  return json(await loadShareItemGate(decodeURIComponent(token)));
});

/**
 * The task behind the link. A POST because the password belongs in the body,
 * and because a private link is read with the caller's own bearer token.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = sharePasswordSchema.parse(await readJson(request));
  try {
    return json(await loadShareItem(decodeURIComponent(token), body.password ?? null, await shareViewer(request)));
  } catch (error) {
    // The page needs the reason: ask for a password again, or ask them to sign in.
    if (error instanceof ShareAccessError) return json({ error: error.message, reason: error.reason }, shareErrorStatus(error));
    throw error;
  }
});

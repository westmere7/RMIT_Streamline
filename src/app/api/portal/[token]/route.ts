import { handleRoute, json } from "@/server/http";
import { portalServices } from "@/server/portal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * Whether the link is live and whether it wants a password.
 *
 * Says nothing a stranger could use: a closed portal and a token that names
 * nothing answer identically, so the reply cannot be used to discover which
 * departments a workspace has.
 */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  return json(await portalServices().portals.gate(decodeURIComponent(token)));
});

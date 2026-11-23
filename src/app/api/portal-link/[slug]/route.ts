import { handleRoute, json } from "@/server/http";
import { portalServices } from "@/server/portal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };

/**
 * The portal behind a workspace's short addresses (/<workspace>/portal and
 * /<workspace>/booking). Those carry no key, so this answers anyone who has the
 * address; what the portal then shows is still the gate's to decide.
 */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { slug } = await params;
  return json({ token: await portalServices().portals.tokenForWorkspace(decodeURIComponent(slug)) });
});

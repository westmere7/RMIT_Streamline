import { handleRoute, json } from "@/server/http";
import { portalServices } from "@/server/portal";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** Where an old portal link now lives: its workspace's address, for the short link. Null for a link no longer current. */
export const GET = handleRoute(async (_request: Request, { params }: Context) => {
  const { token } = await params;
  return json({ workspace: await portalServices().portals.workspaceForToken(decodeURIComponent(token)) });
});

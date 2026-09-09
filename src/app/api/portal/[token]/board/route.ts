import { admitPortal, portalGrantSchema, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * The department's requests as a board.
 *
 * The same gate and the same projection as `/tasks`, arranged so the app's own
 * views can render it. A POST for the same reason as the rest of the portal:
 * the password belongs in a body, not in a server log.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalGrantSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  const viewer = await portalViewer(request, resolved.workspaceId);
  const [payload, context] = await Promise.all([services.portals.board(resolved), services.portals.context(resolved, viewer)]);
  return json({ ...payload, context });
});

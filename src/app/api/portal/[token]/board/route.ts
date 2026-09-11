import { admitPortal, portalBoardSchema, portalScopeOf, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * The portal's requests as a board.
 *
 * The same gate and the same projection as `/tasks`, arranged so the app's own
 * views can render it. A POST for the same reason as the rest of the portal:
 * the password belongs in a body, not in a server log.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalBoardSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  const viewer = await portalViewer(request, resolved.workspaceId);
  // How much to show, as the visitor asked for it. Narrowing only: the token
  // settled what may be read before this ran.
  const scope = portalScopeOf(body);
  const [payload, context] = await Promise.all([services.portals.board(resolved, scope), services.portals.context(resolved, viewer, scope)]);
  return json({ ...payload, context });
});

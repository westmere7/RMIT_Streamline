import { admitPortal, portalBoardRevision, portalBoardSchema, portalScopeOf, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * The portal's requests as a board.
 *
 * The same gate and the same projection as `/tasks`, arranged so the app's own
 * views can render it. A POST for the same reason as the rest of the portal:
 * the password belongs in a body, not in a server log.
 *
 * The page refreshes every few seconds, so it sends the revision of the board
 * it holds. The link, the password and the viewer are checked every time; if
 * the revision still matches, the answer is `{ unchanged: true }` and nothing
 * else is read. Otherwise the board comes back with its new revision.
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
  // Read before the board, so a change committed while it is read is caught next time.
  const revision = await portalBoardRevision(resolved, viewer, scope);
  if (revision !== null && body.revision === revision) return json({ unchanged: true, revision, servedAt: new Date().toISOString() });
  const [payload, context] = await Promise.all([services.portals.board(resolved, scope), services.portals.context(resolved, viewer, scope)]);
  return json({ ...payload, context, revision });
});

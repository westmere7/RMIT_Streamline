import { admitPortal, portalServices, portalTasksSchema, portalViewer } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * A page of the department's requests, with totals over the whole set.
 *
 * A POST because the password belongs in the body: a query string ends up in
 * server logs and browser history.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalTasksSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  const viewer = await portalViewer(request, resolved.workspaceId);
  const [page, context] = await Promise.all([
    services.portals.tasks(resolved, { cursor: body.cursor ?? null, limit: body.limit, search: body.search }),
    services.portals.context(resolved, viewer),
  ]);
  return json({ ...page, context });
});

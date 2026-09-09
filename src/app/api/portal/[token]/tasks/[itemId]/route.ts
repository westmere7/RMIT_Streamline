import { admitPortal, asPortalHttpError, portalGrantSchema, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string; itemId: string }> };

/**
 * One request, opened.
 *
 * The id is checked against this department's provenance before anything is
 * read, so an id belonging to another department fails exactly as an id
 * belonging to nothing does.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token, itemId } = await params;
  const body = portalGrantSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  const viewer = await portalViewer(request, resolved.workspaceId);
  try {
    return json(await services.portals.task(resolved, decodeURIComponent(itemId), viewer));
  } catch (error) {
    asPortalHttpError(error);
  }
});

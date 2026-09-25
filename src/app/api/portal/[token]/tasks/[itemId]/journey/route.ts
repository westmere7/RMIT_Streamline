import { admitPortal, asPortalHttpError, portalGrantSchema, portalServices } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string; itemId: string }> };

/**
 * One request's Task journey: the events it is drawn from, trimmed to what it
 * shows. Behind the same check as opening the request (see `journey` in
 * src/services/stakeholder-portal-service.ts).
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token, itemId } = await params;
  const body = portalGrantSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  try {
    return json(await services.portals.journey(resolved, decodeURIComponent(itemId)));
  } catch (error) {
    asPortalHttpError(error);
  }
});

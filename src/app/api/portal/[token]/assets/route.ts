import { admitPortal, asPortalHttpError, portalAssetSchema, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, HttpError, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * A deliverable edited through the portal by a member of staff.
 *
 * The asset is verified to belong to the item the caller named, and the item to
 * this portal, before the board seat is checked — an asset id from somewhere
 * else must not ride in on a task id from here. Only four fields can be
 * touched: notes and assignees are internal, and a portal is not a way to
 * reach general board editing.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalAssetSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  const viewer = await portalViewer(request, resolved.workspaceId);

  try {
    await services.portals.task(resolved, body.itemId, viewer);
  } catch (error) {
    asPortalHttpError(error);
  }
  if (!(await services.portals.canAct(resolved, body.itemId, viewer))) {
    throw new HttpError(403, "Only someone on this task's board can change a deliverable here.");
  }

  const asset = await services.repos.itemAssets.getById(body.assetId);
  // The asset's own owner decides, not the id the caller paired it with.
  if (!asset || asset.itemId !== body.itemId) throw new HttpError(404, "That deliverable is not part of this request.");

  const updated = await services.assets.update(body.assetId, body.patch, viewer!.userId);
  return json({ id: updated.id, completedAt: updated.completedAt, name: updated.name, quantity: updated.quantity, dueDate: updated.dueDate });
});

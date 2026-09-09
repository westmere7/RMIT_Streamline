import { admitPortal, asPortalHttpError, portalCommentSchema, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, HttpError, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * An update posted through the portal by a member of staff.
 *
 * Four things are checked before a word is written, and none of them is taken
 * from the body: the portal gate, a real session, that the task belongs to this
 * portal, and that the caller holds an editor's or owner's seat on the task's
 * own board. A stakeholder with a perfectly valid link fails the last two and
 * gets a 403.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalCommentSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  const viewer = await portalViewer(request, resolved.workspaceId);

  try {
    // Throws unless the task is one of this department's, which is also what
    // stops a valid link being used to comment on somebody else's work.
    await services.portals.task(resolved, body.itemId, viewer);
  } catch (error) {
    asPortalHttpError(error);
  }
  if (!(await services.portals.canAct(resolved, body.itemId, viewer))) {
    throw new HttpError(403, "Only someone on this task's board can post an update here.");
  }

  // The ordinary service: same validation, same attribution, same mentions,
  // activity and notifications an update posted inside the app would get.
  // `alsoLinked` is deliberately not set — posting through a portal must not
  // fan an update out onto boards the caller was never checked against.
  const users = await services.repos.users.list();
  const comment = await services.comments.addComment(body.itemId, body.body, viewer!.userId, users);
  return json({ id: comment.id, createdAt: comment.createdAt });
});

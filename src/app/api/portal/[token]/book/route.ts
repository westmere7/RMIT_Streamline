import { admitPortal, asPortalHttpError, portalBookSchema, portalGrantSchema, portalServices, portalViewer } from "@/server/portal";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/**
 * A booking made from a department's portal.
 *
 * The department comes from the token and is written over whatever the body
 * said. The submission key makes a retry safe: the same key replays the first
 * receipt, and the same key with different content is refused.
 */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalBookSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  // A member who happens to be signed in is recorded as the author; a
  // stakeholder is not, and neither can choose who they are.
  const viewer = await portalViewer(request, resolved.workspaceId);
  try {
    const receipt = await services.portals.book(resolved, {
      submissionKey: body.submissionKey,
      request: body.request,
      booking: services.booking,
      memberId: viewer?.isWorkspaceMember ? viewer.userId : null,
    });
    return json(receipt);
  } catch (error) {
    // A key reused for different content, or one still being written, is a
    // conflict the caller can act on — not a server fault.
    asPortalHttpError(error);
  }
});

/**
 * The form itself, behind the same gate as everything else.
 *
 * A PUT because it takes the grant in a body and changes nothing — the form is
 * the workspace's template, and reading it must not be possible without a live
 * link, or the questions a workspace asks would be public.
 */
export const PUT = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalGrantSchema.parse(await readJson(request));
  const services = portalServices();
  const resolved = await admitPortal(services, decodeURIComponent(token), body);
  return json(await services.booking.buildForm(resolved.workspaceId));
});

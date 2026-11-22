import { handleRoute, json, readJson } from "@/server/http";
import { admitPortal, portalRequesterSchema, portalServices } from "@/server/portal";
import { formNameFor } from "@/server/requesters";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** The name the workspace has for an email, so the portal's booking form can fill it in. Behind the portal's own gate. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalRequesterSchema.parse(await readJson(request));
  const resolved = await admitPortal(portalServices(), decodeURIComponent(token), body, "booking");
  const email = body.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ name: null });
  // A stakeholder who booked before is filled in; a member of staff is not named to a portal visitor.
  return json({ name: await formNameFor(resolved.workspaceId, email, false) });
});

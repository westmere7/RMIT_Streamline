import { handleRoute, json, readJson } from "@/server/http";
import { admitPortal, portalRequesterSchema, portalServices } from "@/server/portal";
import { serverRequesterDirectory } from "@/server/requesters";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

/** The name the workspace has for an email, so the portal's booking form can fill it in. Behind the portal's own gate. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { token } = await params;
  const body = portalRequesterSchema.parse(await readJson(request));
  const resolved = await admitPortal(portalServices(), decodeURIComponent(token), body);
  const email = body.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ name: null });
  return json({ name: (await serverRequesterDirectory().find(resolved.workspaceId, email))?.name ?? null });
});

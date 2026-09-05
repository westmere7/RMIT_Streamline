import { handleRoute, json, readJson } from "@/server/http";
import { inviteMember, inviteSchema, requireWorkspaceAdmin } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/** Adds a pending member and returns the invitation link to send them. Admins only. */
export const POST = handleRoute(async (request: Request) => {
  const input = inviteSchema.parse(await readJson(request));
  const callerId = await requireWorkspaceAdmin(request, input.workspaceId);
  return json(await inviteMember(input, callerId), 201);
});

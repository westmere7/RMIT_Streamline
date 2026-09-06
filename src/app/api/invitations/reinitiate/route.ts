import { handleRoute, json, readJson } from "@/server/http";
import { memberRefSchema, reinitiateMember, requireWorkspaceAdmin } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/** Puts an existing member back through onboarding with a fresh link. Admins only. */
export const POST = handleRoute(async (request: Request) => {
  const { workspaceId, userId } = memberRefSchema.parse(await readJson(request));
  const callerId = await requireWorkspaceAdmin(request, workspaceId);
  return json(await reinitiateMember(workspaceId, userId, callerId));
});

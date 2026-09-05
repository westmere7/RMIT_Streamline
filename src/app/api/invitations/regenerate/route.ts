import { handleRoute, json, readJson } from "@/server/http";
import { memberRefSchema, regenerateInvitation, requireWorkspaceAdmin } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/** Replaces a pending member's invitation link with a fresh one. Admins only. */
export const POST = handleRoute(async (request: Request) => {
  const { workspaceId, userId } = memberRefSchema.parse(await readJson(request));
  await requireWorkspaceAdmin(request, workspaceId);
  return json(await regenerateInvitation(workspaceId, userId));
});

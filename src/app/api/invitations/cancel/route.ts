import { handleRoute, json, readJson } from "@/server/http";
import { cancelInvitation, memberRefSchema, requireWorkspaceAdmin } from "@/server/onboarding";

export const dynamic = "force-dynamic";

/** Removes a member who never finished onboarding, and their unused account. Admins only. */
export const POST = handleRoute(async (request: Request) => {
  const { workspaceId, userId } = memberRefSchema.parse(await readJson(request));
  await requireWorkspaceAdmin(request, workspaceId);
  await cancelInvitation(workspaceId, userId);
  return json({ ok: true });
});

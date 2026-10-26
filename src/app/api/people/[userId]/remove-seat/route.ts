import { z } from "zod";
import { handleRoute, json, readJson } from "@/server/http";
import { requireWorkspaceAdmin } from "@/server/onboarding";
import { removeSeat } from "@/server/people";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

const bodySchema = z.object({ workspaceId: z.uuid() });

/** Takes somebody out of one workspace, on the terms in removeSeat. Admins of the workspace. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const userId = z.uuid().parse(decodeURIComponent((await params).userId));
  const { workspaceId } = bodySchema.parse(await readJson(request));
  const callerId = await requireWorkspaceAdmin(request, workspaceId, "remove people");
  return json(await removeSeat(workspaceId, userId, callerId));
});

import { z } from "zod";
import { handleRoute, json, readJson } from "@/server/http";
import { requireWorkspaceAdmin } from "@/server/onboarding";
import { changeEmailSchema, changePersonEmail } from "@/server/people";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

/** Changes somebody's email, sign-in and profile together. Admins of the workspace, on the terms in changePersonEmail. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const userId = z.uuid().parse(decodeURIComponent((await params).userId));
  const { workspaceId, email } = changeEmailSchema.parse(await readJson(request));
  const callerId = await requireWorkspaceAdmin(request, workspaceId, "change emails");
  return json(await changePersonEmail(workspaceId, userId, callerId, email));
});

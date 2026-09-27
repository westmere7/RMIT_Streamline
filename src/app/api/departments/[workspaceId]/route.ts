import { z } from "zod";
import { changeDepartments, departmentsBodySchema } from "@/server/departments";
import { handleRoute, json, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ workspaceId: string }> };

/** Saves, removes or counts a department across every workspace. Admins of the calling workspace. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const workspaceId = z.uuid().parse(decodeURIComponent((await params).workspaceId));
  const body = departmentsBodySchema.parse(await readJson(request));
  return json(await changeDepartments(request, workspaceId, body));
});

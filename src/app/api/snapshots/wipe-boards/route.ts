import { handleRoute, json, readJson } from "@/server/http";
import { requireSnapshotAdmin, wipeBoardData, wipeBoardsSchema } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Settings → Danger zone: wipes every board and its data. Admins and owners only, and only with their password. */
export const POST = handleRoute(async (request: Request) => {
  const { workspaceId, password } = wipeBoardsSchema.parse(await readJson(request));
  const caller = await requireSnapshotAdmin(request, workspaceId);
  return json(await wipeBoardData(workspaceId, caller, password));
});

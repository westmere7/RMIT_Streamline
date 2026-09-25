import { handleRoute, json, readJson } from "@/server/http";
import { requireSnapshotAdmin, restoreSnapshot, restoreSnapshotSchema } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Puts the database back to this snapshot. Admins only, and only with their password. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { workspaceId, password } = restoreSnapshotSchema.parse(await readJson(request));
  const caller = await requireSnapshotAdmin(request, workspaceId);
  return json(await restoreSnapshot(workspaceId, id, caller, password));
});

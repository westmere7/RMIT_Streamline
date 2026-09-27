import { handleRoute, json } from "@/server/http";
import { deleteWorkspace, requireSnapshotOwner } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Deletes a workspace and everything in it, after a snapshot of the whole database. Owners only. */
export const DELETE = handleRoute(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const caller = await requireSnapshotOwner(request);
  return json(await deleteWorkspace(decodeURIComponent(id), caller));
});

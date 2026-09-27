import { handleRoute, json } from "@/server/http";
import { deleteSnapshot, requireSnapshotOwner, snapshotWorkspaceSchema } from "@/server/snapshots";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Deletes one snapshot. Owners only. */
export const DELETE = handleRoute(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { workspaceId } = snapshotWorkspaceSchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
  await requireSnapshotOwner(request);
  await deleteSnapshot(workspaceId, id);
  return json({ ok: true });
});

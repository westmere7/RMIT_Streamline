import { handleRoute, json, readJson } from "@/server/http";
import { createSnapshot, createSnapshotSchema, listSnapshots, requireSnapshotAdmin, snapshotWorkspaceSchema } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The workspace's snapshots, newest first. Admins only. */
export const GET = handleRoute(async (request: Request) => {
  const { workspaceId } = snapshotWorkspaceSchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
  await requireSnapshotAdmin(request, workspaceId);
  return json({ snapshots: await listSnapshots(workspaceId) });
});

/** Takes a snapshot of everything now. Admins only. */
export const POST = handleRoute(async (request: Request) => {
  const { workspaceId, name } = createSnapshotSchema.parse(await readJson(request));
  const caller = await requireSnapshotAdmin(request, workspaceId);
  return json({ snapshot: await createSnapshot(workspaceId, caller, name) }, 201);
});

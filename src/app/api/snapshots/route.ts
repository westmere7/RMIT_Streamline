import { HttpError, handleRoute, json, readJson } from "@/server/http";
import { CLEAR_SNAPSHOTS_WORD, clearSnapshots, createSnapshot, createSnapshotSchema, listSnapshots, requireSnapshotOwner, snapshotWorkspaceSchema } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The workspace's snapshots, newest first. Owners only. */
export const GET = handleRoute(async (request: Request) => {
  const { workspaceId } = snapshotWorkspaceSchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
  await requireSnapshotOwner(request);
  return json({ snapshots: await listSnapshots(workspaceId) });
});

/**
 * Deletes every snapshot, files and all, from the server. Owners only, and only
 * with the typed word, so a stray request cannot empty the list.
 */
export const DELETE = handleRoute(async (request: Request) => {
  const url = new URL(request.url);
  snapshotWorkspaceSchema.parse({ workspaceId: url.searchParams.get("workspaceId") });
  await requireSnapshotOwner(request);
  if (url.searchParams.get("confirm") !== CLEAR_SNAPSHOTS_WORD) throw new HttpError(400, `Type ${CLEAR_SNAPSHOTS_WORD} to delete every snapshot.`);
  return json(await clearSnapshots());
});

/** Takes a snapshot of everything now. Owners only. */
export const POST = handleRoute(async (request: Request) => {
  const { workspaceId, name } = createSnapshotSchema.parse(await readJson(request));
  const caller = await requireSnapshotOwner(request);
  return json({ snapshot: await createSnapshot(workspaceId, caller, name) }, 201);
});

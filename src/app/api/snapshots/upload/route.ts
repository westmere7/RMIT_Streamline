import { HttpError, handleRoute, json } from "@/server/http";
import { requireSnapshotAdmin, snapshotWorkspaceSchema, uploadSnapshot } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Past this a file cannot come through a serverless request anyway. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Keeps an uploaded snapshot file (the raw body) beside the others, ready to restore. Admins only. */
export const POST = handleRoute(async (request: Request) => {
  const params = new URL(request.url).searchParams;
  const { workspaceId } = snapshotWorkspaceSchema.parse({ workspaceId: params.get("workspaceId") });
  const caller = await requireSnapshotAdmin(request, workspaceId);
  const file = Buffer.from(await request.arrayBuffer());
  if (file.length === 0) throw new HttpError(400, "That file is empty.");
  if (file.length > MAX_UPLOAD_BYTES) throw new HttpError(413, "That file is too large to upload here.");
  return json({ snapshot: await uploadSnapshot(workspaceId, caller, file, params.get("name")) }, 201);
});

import { z } from "zod";
import { handleRoute, json, readJson } from "@/server/http";
import { deleteWorkspace, requireSnapshotOwner } from "@/server/snapshots";

const bodySchema = z.object({ confirmName: z.string().max(200) });

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Deletes a workspace and everything in it, after a snapshot of the whole database. Owners only. */
export const DELETE = handleRoute(async (request: Request, { params }: Context) => {
  const id = z.uuid().parse(decodeURIComponent((await params).id));
  const { confirmName } = bodySchema.parse(await readJson(request));
  const caller = await requireSnapshotOwner(request);
  return json(await deleteWorkspace(id, caller, confirmName));
});

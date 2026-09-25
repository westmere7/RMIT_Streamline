import { handleRoute } from "@/server/http";
import { requireSnapshotAdmin, snapshotFile, snapshotWorkspaceSchema } from "@/server/snapshots";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The snapshot as the gzipped JSON file it is stored as. Admins only. */
export const GET = handleRoute(async (request: Request, { params }: Context) => {
  const { id } = await params;
  const { workspaceId } = snapshotWorkspaceSchema.parse({ workspaceId: new URL(request.url).searchParams.get("workspaceId") });
  await requireSnapshotAdmin(request, workspaceId);
  const { name, createdAt, file } = await snapshotFile(workspaceId, id);
  const stamp = createdAt.slice(0, 16).replace(/[:T]/g, "-");
  const safe = name.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "snapshot";
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="streamline-${safe}-${stamp}.json.gz"`,
      "Cache-Control": "no-store",
    },
  });
});

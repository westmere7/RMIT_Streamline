import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleRoute, json, readJson } from "@/server/http";
import { requireWorkspaceAdmin } from "@/server/onboarding";
import { removePerson } from "@/server/snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ userId: string }> };

const bodySchema = z.object({ workspaceId: z.uuid(), confirmName: z.string().max(200) });

/** Removes a person completely, after a snapshot. Admins of the workspace (for their own people) and Owners. */
export const POST = handleRoute(async (request: Request, { params }: Context) => {
  const userId = z.uuid().parse(decodeURIComponent((await params).userId));
  const { workspaceId, confirmName } = bodySchema.parse(await readJson(request));
  const callerId = await requireWorkspaceAdmin(request, workspaceId, "remove people");
  const profile = await getSupabaseAdminClient().from("profiles").select("display_name, email").eq("id", callerId).maybeSingle();
  const who = (profile.data as { display_name: string | null; email: string | null } | null) ?? null;
  return json(await removePerson(workspaceId, userId, { userId: callerId, email: who?.email ?? null, name: who?.display_name ?? "An admin" }, confirmName));
});

import { z } from "zod";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices } from "@/services";
import type { ListOptionUsage } from "@/services/workspace-list-service";
import { requireWorkspaceAdmin } from "./onboarding";
import { createSnapshot } from "./snapshots";

/**
 * The departments, which every workspace shares.
 *
 * A change made in one workspace lands in all of them — the list, the
 * department registry behind the portal, and the Department cells on every
 * board — and an admin of one workspace may not write the others. So the
 * browser sends the change here, and the ordinary list service carries it out
 * with the service role. Any admin of the workspace the change was made from
 * may make it (the Owners chose that over Owners only).
 */

const option = z.object({ name: z.string().trim().min(1).max(40), color: z.string().max(40) });

export const departmentsBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), options: z.array(option).max(60), renames: z.record(z.string().max(40), z.string().max(40)).default({}) }),
  z.object({ action: z.literal("remove"), name: z.string().trim().min(1).max(40), replaceWith: z.string().trim().max(40).nullable().optional() }),
  z.object({ action: z.literal("usage"), name: z.string().trim().min(1).max(40) }),
]);

export async function changeDepartments(request: Request, workspaceId: string, body: z.infer<typeof departmentsBodySchema>): Promise<{ ok: true } | ListOptionUsage> {
  const userId = await requireWorkspaceAdmin(request, workspaceId, "change departments");
  const admin = getSupabaseAdminClient();
  routeRepositoriesThrough(admin);
  const lists = createServices(createSupabaseRepositories()).lists;
  if (body.action === "usage") return lists.usage(workspaceId, "STAKEHOLDER_GROUPS", body.name);

  // Removing or renaming a department rewrites tasks in every workspace, and
  // any admin may do it. A snapshot of everything first, so one admin's slip
  // can be put back by an Owner (Settings → Snapshots).
  const before = (await lists.lists(workspaceId)).STAKEHOLDER_GROUPS.map((o) => o.name.toLowerCase());
  const after = body.action === "save" ? new Set(body.options.map((o) => o.name.toLowerCase())) : null;
  const rewrites = body.action === "remove" || Object.entries(body.renames).some(([from, to]) => from !== to) || before.some((name) => !after!.has(name));
  if (rewrites) {
    const profile = await admin.from("profiles").select("display_name, email").eq("id", userId).maybeSingle();
    const who = (profile.data as { display_name: string | null; email: string | null } | null) ?? null;
    await createSnapshot(workspaceId, { userId, email: who?.email ?? null, name: who?.display_name ?? "An admin" }, "Before changing departments", "before_change");
  }
  if (body.action === "save") await lists.save(workspaceId, "STAKEHOLDER_GROUPS", body.options as never, body.renames);
  else await lists.remove(workspaceId, "STAKEHOLDER_GROUPS", body.name, { replaceWith: body.replaceWith });
  return { ok: true };
}

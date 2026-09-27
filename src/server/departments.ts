import { z } from "zod";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServices } from "@/services";
import type { ListOptionUsage } from "@/services/workspace-list-service";
import { requireWorkspaceAdmin } from "./onboarding";

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
  await requireWorkspaceAdmin(request, workspaceId, "change departments");
  routeRepositoriesThrough(getSupabaseAdminClient());
  const lists = createServices(createSupabaseRepositories()).lists;
  if (body.action === "usage") return lists.usage(workspaceId, "STAKEHOLDER_GROUPS", body.name);
  if (body.action === "save") await lists.save(workspaceId, "STAKEHOLDER_GROUPS", body.options as never, body.renames);
  else await lists.remove(workspaceId, "STAKEHOLDER_GROUPS", body.name, { replaceWith: body.replaceWith });
  return { ok: true };
}

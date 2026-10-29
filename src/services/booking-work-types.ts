import type { ColorToken, EntityId, Workspace } from "@/domain";
import { syncFormWorkTypes } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { readBookingTemplate } from "./booking";

/**
 * Brings every booking form of a workspace into line with its work types: the
 * published form, the draft and every saved form. A booking service offers
 * work types by name (syncFormWorkTypes), so after a rename or a removal in
 * Settings → Asset types each form is rewritten to say the same. A form that
 * already agrees is left alone. Returns how many forms changed.
 */
export async function syncBookingFormsWithWorkTypes(
  repos: Repositories,
  workspaceId: EntityId,
  workTypes: readonly { name: string; color: ColorToken }[],
  renames: ReadonlyMap<string, string> = new Map(),
): Promise<number> {
  let changed = 0;
  const workspace = await repos.workspaces.getById(workspaceId);
  if (workspace) {
    const patch: Partial<Pick<Workspace, "bookingForm" | "bookingFormDraft">> = {};
    for (const key of ["bookingForm", "bookingFormDraft"] as const) {
      const form = readBookingTemplate(workspace[key]);
      if (!form) continue;
      const next = syncFormWorkTypes(form, workTypes, renames);
      if (next !== form) patch[key] = next;
    }
    const keys = Object.keys(patch).length;
    if (keys > 0) {
      await repos.workspaces.update(workspaceId, patch);
      changed += keys;
    }
  }
  for (const saved of await repos.bookingTemplates.listByWorkspace(workspaceId)) {
    const next = syncFormWorkTypes(saved.template, workTypes, renames);
    if (next === saved.template) continue;
    await repos.bookingTemplates.update(saved.id, { template: next });
    changed += 1;
  }
  return changed;
}

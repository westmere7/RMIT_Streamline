import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * A workspace's revision (migration 0109; the portal's tables join it in 0116),
 * as the number and the moment it was bumped. The moment matters after a
 * snapshot restore, which can put an old number back.
 *
 * Read before the data it stands for, so a change that commits in between is
 * picked up on the next poll rather than missed. No row yet reads as "0"; a
 * failed read as null, which only means the whole thing is read, as it was
 * before there were revisions.
 */
export async function readWorkspaceRevision(workspaceId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdminClient().from("workspace_revisions").select("revision, changed_at").eq("workspace_id", workspaceId).maybeSingle();
  if (error) return null;
  return data ? `${data.revision}:${data.changed_at}` : "0";
}

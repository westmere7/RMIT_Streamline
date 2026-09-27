import { z } from "zod";
import { SELF_JOIN_MESSAGES, isPlausibleInvitationToken, type SelfJoinPreview } from "@/domain";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./http";
import { inviteMember } from "./onboarding";

/**
 * The workspace's join link, for the Supabase provider.
 *
 * Nobody opening it has an account, so it runs with the service role, like the
 * personal join page. It adds nothing of its own to how members are made: a new
 * email goes through inviteMember exactly as "Add member" would send it, as a
 * pending member with a personal link, and the person finishes on that link.
 * An email the database already knows is refused with what to do instead.
 */

export const selfJoinSchema = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
});

export async function previewSelfJoin(key: string): Promise<SelfJoinPreview> {
  const workspace = await workspaceByKey(key);
  return { valid: !!workspace, workspaceName: workspace?.name ?? null };
}

export async function selfJoin(key: string, input: z.infer<typeof selfJoinSchema>): Promise<{ token: string }> {
  const workspace = await workspaceByKey(key);
  if (!workspace) throw new HttpError(410, SELF_JOIN_MESSAGES.off);
  const admin = getSupabaseAdminClient();

  const profile = await admin.from("profiles").select("id").eq("email", input.email).maybeSingle();
  if (profile.error) throw new HttpError(500, `profiles.byEmail: ${profile.error.message}`);
  const known = profile.data as { id: string } | null;
  if (known) {
    const member = await admin.from("workspace_members").select("status").eq("workspace_id", workspace.id).eq("user_id", known.id).maybeSingle();
    if (member.error) throw new HttpError(500, `workspace_members.lookup: ${member.error.message}`);
    const status = (member.data as { status: string } | null)?.status ?? null;
    throw new HttpError(409, SELF_JOIN_MESSAGES[status === "ACTIVE" ? "member" : status ? "pending" : "known"]);
  }

  // Recorded as added by the workspace's owner: the link is theirs to hand out.
  const owner = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspace.id).eq("role", "OWNER").order("joined_at").limit(1).maybeSingle();
  if (owner.error) throw new HttpError(500, `workspace_members.owner: ${owner.error.message}`);
  const ownerId = (owner.data as { user_id: string } | null)?.user_id ?? null;
  if (!ownerId) throw new HttpError(500, "This workspace has no owner to add people on behalf of.");

  const result = await inviteMember({ workspaceId: workspace.id, email: input.email, firstName: input.firstName, lastName: input.lastName, jobTitle: null, role: "MEMBER", teamIds: [] }, ownerId);
  // Only a brand-new email reaches this far, and a new person always gets a link.
  if (!result.invitation) throw new HttpError(409, SELF_JOIN_MESSAGES.known);
  return { token: result.invitation.token };
}

async function workspaceByKey(key: string): Promise<{ id: string; name: string } | null> {
  if (!isPlausibleInvitationToken(key)) return null;
  const found = await getSupabaseAdminClient().from("workspaces").select("id, name").eq("join_key", key).maybeSingle();
  if (found.error) throw new HttpError(500, `workspaces.byJoinKey: ${found.error.message}`);
  return (found.data as { id: string; name: string } | null) ?? null;
}

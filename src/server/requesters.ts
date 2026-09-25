import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/server/http";
import { inviteMember } from "@/server/onboarding";
import { splitPersonName, type RequesterDirectory } from "@/services/booking-service";

/**
 * The booking's requester, found or added through the service role: a public
 * booking has no session, and adding a pending member is an admin's write.
 *
 * Someone the workspace has (any status) is that person, and the name typed on
 * the form replaces the one saved for them. Someone new is added as a pending
 * member through `inviteMember`, exactly as Members → Add member does: an
 * account with no password, an INVITED membership and a join link an admin can
 * pass on. Pending members see nothing until they onboard.
 */
export function serverRequesterDirectory(): RequesterDirectory {
  const admin = getSupabaseAdminClient();

  const profileByEmail = async (email: string) => {
    const result = await admin.from("profiles").select("id, display_name, deactivated_at").ilike("email", email).limit(1).maybeSingle();
    if (result.error) throw new HttpError(500, `profiles.byEmail: ${result.error.message}`);
    return result.data as { id: string; display_name: string; deactivated_at: string | null } | null;
  };
  const isMember = async (workspaceId: string, userId: string) => {
    const result = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (result.error) throw new HttpError(500, `workspace_members.byUser: ${result.error.message}`);
    return !!result.data;
  };
  const rename = async (userId: string, current: string, name: string) => {
    const next = splitPersonName(name);
    if (!next.displayName || next.displayName === current) return;
    const result = await admin.from("profiles").update({ display_name: next.displayName, first_name: next.firstName, last_name: next.lastName }).eq("id", userId);
    if (result.error) throw new HttpError(500, `profiles.rename: ${result.error.message}`);
  };

  return {
    async find(workspaceId, email) {
      const profile = await profileByEmail(email.trim().toLowerCase());
      if (!profile || !(await isMember(workspaceId, profile.id))) return null;
      return { userId: profile.id, name: profile.display_name };
    },
    async ensure(workspaceId, person, invitedBy) {
      const email = person.email.trim().toLowerCase();
      const profile = await profileByEmail(email);
      if (profile && (profile.deactivated_at || (await isMember(workspaceId, profile.id)))) {
        await rename(profile.id, profile.display_name, person.name);
        return profile.id;
      }
      const name = splitPersonName(person.name);
      const invited = await inviteMember({ workspaceId, email, firstName: name.firstName || email, lastName: name.lastName, jobTitle: null, role: "MEMBER", teamIds: [] }, invitedBy);
      if (profile) await rename(profile.id, profile.display_name, person.name);
      return invited.user.id;
    },
  };
}

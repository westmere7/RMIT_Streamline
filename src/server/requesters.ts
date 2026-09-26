import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/server/http";
import { inviteMember } from "@/server/onboarding";
import { splitPersonName, type RequesterDirectory } from "@/services/booking-service";

/**
 * The booking's requester, found or added through the service role: a public
 * booking has no session, and adding a pending member is an admin's write.
 *
 * Someone the workspace has (any status) is that person. Someone new is added
 * as a pending member through `inviteMember`, exactly as Members → Add member
 * does: an account with no password, an INVITED membership and a join link an
 * admin can pass on. Pending members see nothing until they onboard.
 *
 * The name typed on the form is used only for someone new. Anyone already in
 * the member list keeps the name they have, pending or joined, and so does an
 * account that belongs to someone else: the form is public and nobody's email
 * is checked, so it renames nobody.
 *
 * Emails are matched exactly (lowercased on both sides). A pattern match would
 * read `%` and `_` in an address as wildcards, which turns the lookup into a
 * way to list people's names.
 */
export function serverRequesterDirectory(): RequesterDirectory {
  const admin = getSupabaseAdminClient();

  const profileByEmail = async (email: string) => {
    const result = await admin.from("profiles").select("id, display_name, deactivated_at").eq("email", email).limit(1).maybeSingle();
    if (result.error) throw new HttpError(500, `profiles.byEmail: ${result.error.message}`);
    return result.data as { id: string; display_name: string; deactivated_at: string | null } | null;
  };
  /** The person's membership status here, or null when they have none. */
  const membershipOf = async (workspaceId: string, userId: string) => {
    const result = await admin.from("workspace_members").select("status").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
    if (result.error) throw new HttpError(500, `workspace_members.byUser: ${result.error.message}`);
    return (result.data as { status: string } | null)?.status ?? null;
  };
  return {
    async find(workspaceId, email) {
      const profile = await profileByEmail(email.trim().toLowerCase());
      if (!profile || !(await membershipOf(workspaceId, profile.id))) return null;
      return { userId: profile.id, name: profile.display_name };
    },
    async ensure(workspaceId, person, invitedBy) {
      const email = person.email.trim().toLowerCase();
      const profile = await profileByEmail(email);
      // Somebody the workspace has, whatever their status, is that person and keeps
      // their name; so is an account a public form will not pull in (deactivated).
      if (profile && ((await membershipOf(workspaceId, profile.id)) || profile.deactivated_at)) return profile.id;
      const name = splitPersonName(person.name);
      const invited = await inviteMember({ workspaceId, email, firstName: name.firstName || email, lastName: name.lastName, jobTitle: null, role: "MEMBER", teamIds: [] }, invitedBy);
      return invited.user.id;
    },
  };
}

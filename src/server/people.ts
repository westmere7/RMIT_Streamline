import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./http";

export const changeEmailSchema = z.object({
  workspaceId: z.uuid(),
  // Trimmed and lowercased before it is judged, so stray spaces or capitals are not a refusal.
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

/**
 * Changes somebody's email: the address they sign in with and the one their
 * profile shows, together, so the two never disagree.
 *
 * An admin of this workspace may, on the same terms as the rest of a person's
 * details (profiles_update_admin, migration 0111): not an Owner's unless they
 * are an Owner, and not somebody also active in a workspace they do not run.
 * Owners may change anybody's. The caller has already been checked as an
 * admin of `workspaceId` (requireWorkspaceAdmin).
 */
export async function changePersonEmail(workspaceId: string, userId: string, callerId: string, email: string): Promise<{ email: string }> {
  const admin = getSupabaseAdminClient();

  const profile = await admin.from("profiles").select("id, email, display_name").eq("id", userId).maybeSingle();
  if (profile.error) throw new Error(`profiles.lookup: ${profile.error.message}`);
  const target = profile.data as { id: string; email: string; display_name: string } | null;
  if (!target) throw new HttpError(404, "That person no longer exists.");
  if (target.email.toLowerCase() === email) return { email };

  const owners = await admin.from("app_owners").select("user_id").in("user_id", [userId, callerId]);
  if (owners.error) throw new Error(`app_owners.lookup: ${owners.error.message}`);
  const ownerIds = new Set((owners.data as Array<{ user_id: string }>).map((r) => r.user_id));
  const callerIsOwner = ownerIds.has(callerId);
  if (ownerIds.has(userId) && !callerIsOwner) throw new HttpError(403, `${target.display_name} is an Owner. Only Owners change an Owner's email.`);

  const seats = await admin.from("workspace_members").select("workspace_id, status").eq("user_id", userId);
  if (seats.error) throw new Error(`workspace_members.lookup: ${seats.error.message}`);
  const targetSeats = seats.data as Array<{ workspace_id: string; status: string }>;
  if (!targetSeats.some((s) => s.workspace_id === workspaceId)) throw new HttpError(404, "That person is not in this workspace.");
  if (!callerIsOwner) {
    const mine = await admin.from("workspace_members").select("workspace_id, role, status").eq("user_id", callerId);
    if (mine.error) throw new Error(`workspace_members.mine: ${mine.error.message}`);
    const run = new Set(
      (mine.data as Array<{ workspace_id: string; role: string; status: string }>)
        .filter((s) => s.status === "ACTIVE" && (s.role === "ADMIN" || s.role === "OWNER"))
        .map((s) => s.workspace_id),
    );
    if (targetSeats.some((s) => s.status === "ACTIVE" && !run.has(s.workspace_id))) {
      throw new HttpError(403, `${target.display_name} is also in a workspace you don't run, so an Owner has to change their email.`);
    }
  }

  const taken = await admin.from("profiles").select("id").eq("email", email).neq("id", userId).maybeSingle();
  if (taken.error) throw new Error(`profiles.byEmail: ${taken.error.message}`);
  if (taken.data) throw new HttpError(409, `${email} already belongs to someone else.`);

  // The account first: if it refuses (the address is taken there), the profile is left as it was.
  const account = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
  if (account.error) {
    if (/already|registered|exists/i.test(account.error.message)) throw new HttpError(409, `${email} already belongs to someone else.`);
    throw new Error(`auth.updateUser: ${account.error.message}`);
  }
  const updated = await admin.from("profiles").update({ email }).eq("id", userId);
  if (updated.error) {
    // Put the account back, so sign-in and the profile still agree.
    await admin.auth.admin.updateUserById(userId, { email: target.email, email_confirm: true });
    throw new Error(`profiles.update: ${updated.error.message}`);
  }
  return { email };
}

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

/**
 * Takes somebody out of one workspace and leaves the rest of them alone: their
 * seat, team places and board places here go, any live invitation here goes,
 * and boards they own here pass to the caller so the boards stay run. Their
 * tasks, people cells and history stay as they are. Refused for yourself, for
 * an Owner (seated in every workspace) and for anyone not active somewhere
 * else, who is deactivated or removed completely instead. The caller has
 * already been checked as an admin of `workspaceId` (requireWorkspaceAdmin).
 *
 * With the service role, because an admin cannot reach board places on boards
 * they are not on. The seat goes last, so a step that fails leaves them in.
 */
export async function removeSeat(workspaceId: string, userId: string, callerId: string): Promise<{ ok: true }> {
  if (userId === callerId) throw new HttpError(409, "You cannot remove yourself.");
  const admin = getSupabaseAdminClient();
  const fail = (context: string, error: { message: string } | null): never => {
    throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
  };

  const profile = await admin.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  if (profile.error) fail("profiles.lookup", profile.error);
  const name = (profile.data as { display_name: string } | null)?.display_name;
  if (!name) throw new HttpError(404, "That person no longer exists.");
  const owner = await admin.from("app_owners").select("user_id").eq("user_id", userId).maybeSingle();
  if (owner.error) fail("app_owners.lookup", owner.error);
  if (owner.data) throw new HttpError(409, "This person is an Owner. Remove them as an Owner before taking them out of a workspace.");
  const seats = await admin.from("workspace_members").select("id, workspace_id, status").eq("user_id", userId);
  if (seats.error) fail("workspace_members.lookup", seats.error);
  const all = seats.data as Array<{ id: string; workspace_id: string; status: string }>;
  const seat = all.find((s) => s.workspace_id === workspaceId);
  if (!seat) throw new HttpError(404, "That person is not in this workspace.");
  if (!all.some((s) => s.workspace_id !== workspaceId && s.status === "ACTIVE")) {
    throw new HttpError(409, `${name} is in no other workspace. Deactivate them here, or remove them completely.`);
  }

  const boards = await admin.from("boards").select("id").eq("workspace_id", workspaceId);
  if (boards.error) fail("boards.list", boards.error);
  const boardIds = (boards.data as Array<{ id: string }>).map((b) => b.id);
  const teams = await admin.from("teams").select("id").eq("workspace_id", workspaceId);
  if (teams.error) fail("teams.list", teams.error);
  const teamIds = (teams.data as Array<{ id: string }>).map((t) => t.id);

  const handed = await admin.from("boards").update({ owner_id: callerId }).eq("workspace_id", workspaceId).eq("owner_id", userId);
  if (handed.error) fail("boards.handOver", handed.error);
  if (boardIds.length) {
    const places = await admin.from("board_members").delete().eq("user_id", userId).in("board_id", boardIds);
    if (places.error) fail("board_members.delete", places.error);
  }
  if (teamIds.length) {
    const places = await admin.from("team_members").delete().eq("user_id", userId).in("team_id", teamIds);
    if (places.error) fail("team_members.delete", places.error);
  }
  const invitations = await admin.from("workspace_invitations").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  if (invitations.error) fail("workspace_invitations.delete", invitations.error);
  const removed = await admin.from("workspace_members").delete().eq("id", seat.id);
  if (removed.error) fail("workspace_members.delete", removed.error);
  return { ok: true };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  INVITATION_TTL_DAYS,
  PASSWORD_MIN_LENGTH,
  generateInvitationToken,
  invitationStatus,
  invitationStatusMessage,
  isPlausibleInvitationToken,
  type InvitationPreview,
  type WorkspaceInvitation,
} from "@/domain";
import type { InviteResult } from "@/data/repositories";
import {
  INVITATION_COLUMNS,
  PROFILE_COLUMNS,
  toUser,
  toWorkspaceInvitation,
  toWorkspaceMember,
  type ProfileRow,
  type WorkspaceInvitationRow,
  type WorkspaceMemberRow,
} from "@/data/supabase/rows";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./http";

/**
 * Onboarding for the Supabase provider.
 *
 * Every step here needs the service role: creating an Auth account for someone
 * who has never signed in, setting their password once they open their link,
 * and deleting the account again if the invitation is cancelled. The browser
 * only ever sees the results, through the route handlers under src/app/api.
 *
 * The flow mirrors src/data/local/repositories/onboarding-repository.ts exactly;
 * keep the two in step.
 */

const MEMBER_COLUMNS = "id, workspace_id, user_id, role, status, joined_at";
const DEFAULT_TIMEZONE = "Australia/Melbourne";

export const inviteSchema = z.object({
  workspaceId: z.uuid(),
  email: z.email().transform((v) => v.trim().toLowerCase()),
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  role: z.enum(["ADMIN", "MEMBER", "GUEST"]),
  teamIds: z.array(z.uuid()).max(50).default([]),
});

export const memberRefSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
});

export const completeSchema = z.object({
  password: z.string().min(PASSWORD_MIN_LENGTH, `Passwords need at least ${PASSWORD_MIN_LENGTH} characters`).max(72, "Passwords can be at most 72 characters"),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  jobTitle: z.string().trim().max(120).nullable().optional(),
});

type Admin = SupabaseClient;

function fail(context: string, error: { message: string } | null): never {
  throw new HttpError(500, `${context}: ${error?.message ?? "unknown error"}`);
}

/** Resolves the signed-in caller from the bearer token and checks they administer the workspace. */
export async function requireWorkspaceAdmin(request: Request, workspaceId: string, doing = "manage members"): Promise<string> {
  const header = request.headers.get("authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!jwt) throw new HttpError(401, `Sign in to ${doing}.`);
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Sign in again.");
  const membership = await admin.from("workspace_members").select("role, status").eq("workspace_id", workspaceId).eq("user_id", data.user.id).maybeSingle();
  if (membership.error) fail("workspace_members.lookup", membership.error);
  const row = membership.data as { role: string; status: string } | null;
  if (!row || row.status !== "ACTIVE" || (row.role !== "OWNER" && row.role !== "ADMIN")) {
    throw new HttpError(403, `Only workspace admins can ${doing}.`);
  }
  return data.user.id;
}

async function profileByEmail(admin: Admin, email: string): Promise<ProfileRow | null> {
  const result = await admin.from("profiles").select(PROFILE_COLUMNS).eq("email", email).maybeSingle();
  if (result.error) fail("profiles.byEmail", result.error);
  return (result.data as ProfileRow | null) ?? null;
}

async function profileById(admin: Admin, id: string): Promise<ProfileRow | null> {
  const result = await admin.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (result.error) fail("profiles.byId", result.error);
  return (result.data as ProfileRow | null) ?? null;
}

async function memberOf(admin: Admin, workspaceId: string, userId: string): Promise<WorkspaceMemberRow | null> {
  const result = await admin.from("workspace_members").select(MEMBER_COLUMNS).eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (result.error) fail("workspace_members.byUser", result.error);
  return (result.data as WorkspaceMemberRow | null) ?? null;
}

async function insertInvitation(admin: Admin, workspaceId: string, userId: string, createdBy: string | null): Promise<WorkspaceInvitation> {
  const now = Date.now();
  const payload = {
    workspace_id: workspaceId,
    user_id: userId,
    token: generateInvitationToken(),
    created_by: createdBy,
    expires_at: new Date(now + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  const result = await admin.from("workspace_invitations").insert(payload).select(INVITATION_COLUMNS).single();
  if (result.error || !result.data) fail("workspace_invitations.insert", result.error);
  return toWorkspaceInvitation(result.data as WorkspaceInvitationRow);
}

async function revokeLiveInvitations(admin: Admin, workspaceId: string, userId: string): Promise<void> {
  const result = await admin
    .from("workspace_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (result.error) fail("workspace_invitations.revoke", result.error);
}

/** Adds someone to the workspace as a pending member and returns the link to send them. */
export async function inviteMember(input: z.infer<typeof inviteSchema>, invitedBy: string): Promise<InviteResult> {
  const admin = getSupabaseAdminClient();
  const displayName = `${input.firstName} ${input.lastName}`.trim();

  let profile = await profileByEmail(admin, input.email);
  if (profile) {
    const existing = await addKnownAccount(admin, input, profile);
    if (existing) return existing;
  }
  if (profile?.deactivated_at) {
    throw new HttpError(409, `${profile.display_name} has a deactivated account. Reactivate it from the members list instead.`);
  }

  if (!profile) {
    // No password: until the person opens their link there is nothing to sign in with.
    const created = await admin.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
      user_metadata: { first_name: input.firstName, last_name: input.lastName, display_name: displayName, timezone: DEFAULT_TIMEZONE },
    });
    if (created.error || !created.data.user) {
      const message = created.error?.message ?? "unknown error";
      if (/already|exists|registered/i.test(message)) {
        throw new HttpError(409, `An account for ${input.email} already exists in Supabase Auth without a profile. Remove it in the Supabase dashboard or use a different email.`);
      }
      throw new HttpError(502, `Supabase Auth could not create the account: ${message}`);
    }
    // handle_new_user() runs in the same transaction as the auth insert, so the profile exists now.
    const updated = await admin
      .from("profiles")
      .update({ job_title: input.jobTitle?.trim() || null, timezone: DEFAULT_TIMEZONE, first_name: input.firstName, last_name: input.lastName, display_name: displayName })
      .eq("id", created.data.user.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();
    if (updated.error) fail("profiles.update", updated.error);
    profile = (updated.data as ProfileRow | null) ?? (await profileById(admin, created.data.user.id));
    if (!profile) throw new HttpError(500, "The account was created but its profile row did not appear. Check the handle_new_user trigger.");
  }

  if (await memberOf(admin, input.workspaceId, profile.id)) {
    throw new HttpError(409, `${profile.display_name} is already a member of this workspace`);
  }

  const member = await admin
    .from("workspace_members")
    .insert({ workspace_id: input.workspaceId, user_id: profile.id, role: input.role, status: "INVITED", joined_at: new Date().toISOString() })
    .select(MEMBER_COLUMNS)
    .single();
  if (member.error || !member.data) fail("workspace_members.insert", member.error);

  await addToTeams(admin, input.workspaceId, profile.id, input.teamIds);

  const invitation = await insertInvitation(admin, input.workspaceId, profile.id, invitedBy);
  return { user: toUser(profile), member: toWorkspaceMember(member.data as WorkspaceMemberRow), invitation };
}

/**
 * One person, one account, across every workspace. Somebody who has joined a
 * workspace before is given access to this one at once: no link, because a
 * link sets the password, and the password is theirs already. That covers a
 * pending seat here too (left by a booking, say): an admin adding them turns
 * it into access. Null for everyone else, who goes through the ordinary link;
 * somebody pending in another workspace gets a link of their own here, and
 * whichever link they finish first cancels the others.
 *
 * Admins only. A booking's requester never comes this way (requesters.ts): a
 * form anybody can fill in must not hand out access.
 */
async function addKnownAccount(admin: Admin, input: z.infer<typeof inviteSchema>, profile: ProfileRow): Promise<InviteResult | null> {
  const seats = await admin.from("workspace_members").select("workspace_id, status").eq("user_id", profile.id);
  if (seats.error) fail("workspace_members.byUser", seats.error);
  const rows = (seats.data ?? []) as Array<{ workspace_id: string; status: string }>;
  const here = rows.find((row) => row.workspace_id === input.workspaceId);
  if (here?.status === "DEACTIVATED") throw new HttpError(409, `${profile.display_name} is deactivated in this workspace. Reactivate them from the members list instead.`);
  if (here?.status === "ACTIVE") throw new HttpError(409, `${profile.display_name} is already a member of this workspace`);
  const joinedBefore = rows.some((row) => row.workspace_id !== input.workspaceId && (row.status === "ACTIVE" || row.status === "DEACTIVATED"));
  if (!joinedBefore) {
    if (here) throw new HttpError(409, `${profile.display_name} is already a member of this workspace`);
    return null;
  }
  if (profile.deactivated_at) {
    const revived = await admin.from("profiles").update({ deactivated_at: null }).eq("id", profile.id);
    if (revived.error) fail("profiles.reactivate", revived.error);
  }
  // A pending seat here becomes access, and the link it had can no longer be used.
  if (here) await revokeLiveInvitations(admin, input.workspaceId, profile.id);
  const member = here
    ? await admin.from("workspace_members").update({ role: input.role, status: "ACTIVE", joined_at: new Date().toISOString() }).eq("workspace_id", input.workspaceId).eq("user_id", profile.id).select(MEMBER_COLUMNS).single()
    : await admin
        .from("workspace_members")
        .insert({ workspace_id: input.workspaceId, user_id: profile.id, role: input.role, status: "ACTIVE", joined_at: new Date().toISOString() })
        .select(MEMBER_COLUMNS)
        .single();
  if (member.error || !member.data) fail("workspace_members.add", member.error);
  await addToTeams(admin, input.workspaceId, profile.id, input.teamIds);
  return { user: toUser({ ...profile, deactivated_at: null }), member: toWorkspaceMember(member.data as WorkspaceMemberRow), invitation: null };
}

/** Only teams of this workspace; a stray id from another workspace is dropped, not an error. */
async function addToTeams(admin: Admin, workspaceId: string, userId: string, teamIds: readonly string[]): Promise<void> {
  if (!teamIds.length) return;
  const teams = await admin.from("teams").select("id").eq("workspace_id", workspaceId).in("id", [...teamIds]);
  if (teams.error) fail("teams.lookup", teams.error);
  const rows = ((teams.data ?? []) as Array<{ id: string }>).map((t) => ({ team_id: t.id, user_id: userId, role: "MEMBER" }));
  if (!rows.length) return;
  const inserted = await admin.from("team_members").upsert(rows, { onConflict: "team_id,user_id", ignoreDuplicates: true });
  if (inserted.error) fail("team_members.insert", inserted.error);
}

/** Whether they have joined some other workspace: a seat there that is active or was once. */
async function joinedElsewhere(admin: Admin, workspaceId: string, userId: string): Promise<boolean> {
  const elsewhere = await admin.from("workspace_members").select("id").eq("user_id", userId).neq("status", "INVITED").neq("workspace_id", workspaceId).limit(1);
  if (elsewhere.error) fail("workspace_members.elsewhere", elsewhere.error);
  return (elsewhere.data ?? []).length > 0;
}

async function requirePendingMember(admin: Admin, workspaceId: string, userId: string): Promise<WorkspaceMemberRow> {
  const member = await memberOf(admin, workspaceId, userId);
  if (!member) throw new HttpError(404, "That person is not a member of this workspace.");
  if (member.status !== "INVITED") throw new HttpError(409, "Only members who have not finished onboarding have an invitation link.");
  return member;
}

/** Revokes the member's live link and issues a fresh one. */
export async function regenerateInvitation(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
  const admin = getSupabaseAdminClient();
  await requirePendingMember(admin, workspaceId, userId);
  // A link sets the password. Somebody who has joined another workspace has
  // one already; they are added, not sent a link.
  if (await joinedElsewhere(admin, workspaceId, userId)) {
    const profile = await profileById(admin, userId);
    throw new HttpError(409, `${profile?.display_name ?? "This person"} already has an account from another workspace. Add them from Add member to give them access here.`);
  }
  await revokeLiveInvitations(admin, workspaceId, userId);
  return insertInvitation(admin, workspaceId, userId, null);
}

/**
 * Sends an existing member through onboarding again. Their membership returns to
 * INVITED (so they cannot use the workspace until they open the link), any live
 * link is revoked and a fresh one issued. Completing it sets a new password.
 */
export async function reinitiateMember(workspaceId: string, userId: string, callerId: string): Promise<WorkspaceInvitation> {
  const admin = getSupabaseAdminClient();
  if (userId === callerId) throw new HttpError(409, "You cannot re-onboard yourself.");
  const member = await memberOf(admin, workspaceId, userId);
  if (!member) throw new HttpError(404, "That person is not a member of this workspace.");
  if (member.status === "INVITED") throw new HttpError(409, "This person has not finished onboarding yet; renew their existing link instead.");
  // The link sets the account's password, and the account is the same in every
  // workspace. An admin here may only reset somebody who is in no other
  // workspace; anyone else's is the Owners' to reset.
  if (await joinedElsewhere(admin, workspaceId, userId)) {
    const owner = await admin.from("app_owners").select("user_id").eq("user_id", callerId).maybeSingle();
    if (owner.error) fail("app_owners.lookup", owner.error);
    if (!owner.data) throw new HttpError(403, "This person also uses another workspace. Only an Owner can reset their account.");
  }

  await revokeLiveInvitations(admin, workspaceId, userId);
  const reset = await admin.from("workspace_members").update({ status: "INVITED" }).eq("id", member.id);
  if (reset.error) fail("workspace_members.reinitiate", reset.error);
  // A deactivated account comes back to life through the link, so lift the deactivation now.
  const revived = await admin.from("profiles").update({ deactivated_at: null }).eq("id", userId);
  if (revived.error) fail("profiles.reactivate", revived.error);
  return insertInvitation(admin, workspaceId, userId, callerId);
}

/** Removes a pending member; the account goes too when it was created only for this invitation. */
export async function cancelInvitation(workspaceId: string, userId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const member = await requirePendingMember(admin, workspaceId, userId);

  const invitations = await admin.from("workspace_invitations").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  if (invitations.error) fail("workspace_invitations.delete", invitations.error);

  const teams = await admin.from("teams").select("id").eq("workspace_id", workspaceId);
  if (teams.error) fail("teams.list", teams.error);
  const teamIds = ((teams.data ?? []) as Array<{ id: string }>).map((t) => t.id);
  if (teamIds.length) {
    const removed = await admin.from("team_members").delete().eq("user_id", userId).in("team_id", teamIds);
    if (removed.error) fail("team_members.delete", removed.error);
  }

  const membership = await admin.from("workspace_members").delete().eq("id", member.id);
  if (membership.error) fail("workspace_members.delete", membership.error);

  const others = await admin.from("workspace_members").select("id").eq("user_id", userId).limit(1);
  if (others.error) fail("workspace_members.others", others.error);
  if ((others.data ?? []).length > 0) return;

  const account = await admin.auth.admin.getUserById(userId);
  if (account.error || !account.data.user) return;
  // Never signed in means no password was ever set: the account existed only for this invitation.
  if (!account.data.user.last_sign_in_at) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw new HttpError(502, `The membership was removed but the account could not be deleted: ${deleted.error.message}`);
  }
}

interface ResolvedInvitation {
  invitation: WorkspaceInvitation;
  workspace: { id: string; name: string; slug: string };
  profile: ProfileRow;
  member: WorkspaceMemberRow;
}

/** Looks a token up and works out whether it can still be used. */
async function resolveToken(admin: Admin, token: string): Promise<{ preview: InvitationPreview; resolved: ResolvedInvitation | null }> {
  if (!isPlausibleInvitationToken(token)) return { preview: { status: "INVALID", workspaceName: null }, resolved: null };

  const found = await admin.from("workspace_invitations").select(INVITATION_COLUMNS).eq("token", token).maybeSingle();
  if (found.error) fail("workspace_invitations.byToken", found.error);
  const row = found.data as WorkspaceInvitationRow | null;
  if (!row) return { preview: { status: "INVALID", workspaceName: null }, resolved: null };
  const invitation = toWorkspaceInvitation(row);

  const workspaceResult = await admin.from("workspaces").select("id, name, slug").eq("id", invitation.workspaceId).maybeSingle();
  if (workspaceResult.error) fail("workspaces.byId", workspaceResult.error);
  const workspace = workspaceResult.data as { id: string; name: string; slug: string } | null;
  const workspaceName = workspace?.name ?? null;

  const status = invitationStatus(invitation);
  if (status !== "PENDING" || !workspace) return { preview: { status: status === "PENDING" ? "INVALID" : status, workspaceName }, resolved: null };

  const [profile, member] = await Promise.all([profileById(admin, invitation.userId), memberOf(admin, invitation.workspaceId, invitation.userId)]);
  if (!profile || !member) return { preview: { status: "INVALID", workspaceName }, resolved: null };
  if (member.status !== "INVITED") return { preview: { status: "ACCEPTED", workspaceName }, resolved: null };

  return {
    preview: {
      status: "PENDING",
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
      jobTitle: profile.job_title,
      expiresAt: invitation.expiresAt,
    },
    resolved: { invitation, workspace, profile, member },
  };
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  return (await resolveToken(getSupabaseAdminClient(), token)).preview;
}

/** Sets the password and profile, activates the membership and burns the token. */
export async function completeOnboarding(token: string, input: z.infer<typeof completeSchema>): Promise<{ email: string; userId: string }> {
  const admin = getSupabaseAdminClient();
  const { preview, resolved } = await resolveToken(admin, token);
  if (!resolved) throw new HttpError(410, invitationStatusMessage(preview.status));
  const { invitation, profile, member } = resolved;
  const displayName = `${input.firstName} ${input.lastName}`;

  const account = await admin.auth.admin.updateUserById(profile.id, {
    password: input.password,
    email_confirm: true,
    user_metadata: { first_name: input.firstName, last_name: input.lastName, display_name: displayName },
  });
  if (account.error) {
    const message = account.error.message;
    throw new HttpError(/password/i.test(message) ? 400 : 502, /password/i.test(message) ? message : `Supabase Auth could not set the password: ${message}`);
  }

  const now = new Date().toISOString();
  const updatedProfile = await admin
    .from("profiles")
    .update({ first_name: input.firstName, last_name: input.lastName, display_name: displayName, job_title: input.jobTitle?.trim() || null })
    .eq("id", profile.id);
  if (updatedProfile.error) fail("profiles.update", updatedProfile.error);

  const activated = await admin.from("workspace_members").update({ status: "ACTIVE", joined_at: now }).eq("id", member.id);
  if (activated.error) fail("workspace_members.activate", activated.error);

  const burned = await admin.from("workspace_invitations").update({ accepted_at: now }).eq("id", invitation.id);
  if (burned.error) fail("workspace_invitations.accept", burned.error);

  // The password is set now. Any other link this person still has, in any
  // workspace, would set it again, so they all stop working; and an account
  // switched off while they were pending is back on, since they have joined.
  const others = await admin.from("workspace_invitations").update({ revoked_at: now }).eq("user_id", profile.id).is("accepted_at", null).is("revoked_at", null);
  if (others.error) fail("workspace_invitations.revokeOthers", others.error);
  const revived = await admin.from("profiles").update({ deactivated_at: null }).eq("id", profile.id).not("deactivated_at", "is", null);
  if (revived.error) fail("profiles.reactivate", revived.error);

  return { email: profile.email, userId: profile.id };
}

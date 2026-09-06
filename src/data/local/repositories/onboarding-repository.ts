import {
  INVITATION_TTL_DAYS,
  PASSWORD_MIN_LENGTH,
  generateInvitationToken,
  invitationStatus,
  invitationStatusMessage,
  type CompleteOnboardingInput,
  type InvitationPreview,
  type InviteMemberInput,
  type TeamMember,
  type User,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from "@/domain";
import type { InviteResult, OnboardingRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { hashPassword, newSalt, verifyPassword } from "@/lib/auth/password-hash";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";
import type { StreamlineDatabase } from "../database";

function expiry(from: Date): string {
  return new Date(from.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function newInvitation(input: { workspaceId: string; userId: string; createdBy: string | null; token?: string; now?: Date }): WorkspaceInvitation {
  const now = input.now ?? new Date();
  return {
    id: newId(),
    workspaceId: input.workspaceId,
    userId: input.userId,
    token: input.token ?? generateInvitationToken(),
    createdBy: input.createdBy,
    createdAt: now.toISOString(),
    expiresAt: expiry(now),
    acceptedAt: null,
    revokedAt: null,
  };
}

/**
 * The browser-store version of onboarding. Everything the Supabase server does
 * with the service role happens here inside IndexedDB transactions, and the
 * password lands in the `credentials` store as a salted hash.
 */
export class LocalOnboardingRepository implements OnboardingRepository {
  constructor(private readonly conn: LocalConnection) {}

  async invite(input: InviteMemberInput): Promise<InviteResult> {
    const db = await this.conn.getDb();
    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const now = nowIso();

    let user = (await db.getFromIndex("users", "byEmail", email)) ?? null;
    if (user?.deactivatedAt) throw new Error(`${user.displayName} has a deactivated account. Reactivate it from the members list instead.`);
    const isNew = user === null;
    if (!user) {
      user = {
        id: newId(),
        email,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim() || email,
        avatarUrl: null,
        jobTitle: input.jobTitle?.trim() || null,
        department: null,
        timezone: "Australia/Melbourne",
        deactivatedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    }
    const resolved: User = user;

    const memberships = await db.getAllFromIndex("workspaceMembers", "byWorkspace", input.workspaceId);
    if (memberships.some((m) => m.userId === resolved.id)) throw new Error(`${resolved.displayName} is already a member of this workspace`);

    const member: WorkspaceMember = { id: newId(), workspaceId: input.workspaceId, userId: resolved.id, role: input.role, status: "INVITED", joinedAt: now };
    const invitation = newInvitation({ workspaceId: input.workspaceId, userId: resolved.id, createdBy: input.invitedBy });

    const tx = db.transaction(["users", "workspaceMembers", "teamMembers", "workspaceInvitations"], "readwrite");
    if (isNew) await tx.objectStore("users").put(resolved);
    await tx.objectStore("workspaceMembers").put(member);
    const existingTeams = await tx.objectStore("teamMembers").index("byUser").getAll(resolved.id);
    for (const teamId of new Set(input.teamIds)) {
      if (existingTeams.some((m) => m.teamId === teamId)) continue;
      const teamMember: TeamMember = { id: newId(), teamId, userId: resolved.id, role: "MEMBER" };
      await tx.objectStore("teamMembers").put(teamMember);
    }
    await tx.objectStore("workspaceInvitations").put(invitation);
    await tx.done;
    return { user: resolved, member, invitation };
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    const db = await this.conn.getDb();
    const rows = await db.getAllFromIndex("workspaceInvitations", "byWorkspace", workspaceId);
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async regenerate(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
    const db = await this.conn.getDb();
    const member = await pendingMember(db, workspaceId, userId);
    const now = nowIso();
    const invitation = newInvitation({ workspaceId, userId, createdBy: null });
    const tx = db.transaction(["workspaceInvitations"], "readwrite");
    const store = tx.objectStore("workspaceInvitations");
    for (const existing of await store.index("byUser").getAll(userId)) {
      if (existing.workspaceId === member.workspaceId && invitationStatus(existing) === "PENDING") {
        await store.put({ ...existing, revokedAt: now });
      }
    }
    await store.put(invitation);
    await tx.done;
    return invitation;
  }

  async reinitiate(workspaceId: string, userId: string): Promise<WorkspaceInvitation> {
    const db = await this.conn.getDb();
    const members = await db.getAllFromIndex("workspaceMembers", "byWorkspace", workspaceId);
    const member = members.find((m) => m.userId === userId);
    if (!member) throw new NotFoundError("WorkspaceMember", userId);
    if (member.status === "INVITED") throw new Error("This person has not finished onboarding yet; renew their existing link instead.");
    const user = await db.get("users", userId);
    if (!user) throw new NotFoundError("User", userId);
    const now = nowIso();
    const invitation = newInvitation({ workspaceId, userId, createdBy: null });
    const tx = db.transaction(["users", "workspaceMembers", "workspaceInvitations"], "readwrite");
    for (const existing of await tx.objectStore("workspaceInvitations").index("byUser").getAll(userId)) {
      if (existing.workspaceId === workspaceId && invitationStatus(existing) === "PENDING") await tx.objectStore("workspaceInvitations").put({ ...existing, revokedAt: now });
    }
    await tx.objectStore("workspaceInvitations").put(invitation);
    await tx.objectStore("workspaceMembers").put({ ...member, status: "INVITED" });
    // A deactivated account comes back to life through the link, so lift the deactivation now.
    if (user.deactivatedAt) await tx.objectStore("users").put({ ...user, deactivatedAt: null, updatedAt: now });
    await tx.done;
    return invitation;
  }

  async cancel(workspaceId: string, userId: string): Promise<void> {
    const db = await this.conn.getDb();
    const member = await pendingMember(db, workspaceId, userId);
    const teamsInWorkspace = new Set((await db.getAllFromIndex("teams", "byWorkspace", workspaceId)).map((t) => t.id));
    const otherMemberships = (await db.getAllFromIndex("workspaceMembers", "byUser", userId)).filter((m) => m.id !== member.id);
    const credential = await db.get("credentials", userId);

    const tx = db.transaction(["users", "workspaceMembers", "teamMembers", "workspaceInvitations"], "readwrite");
    for (const invitation of await tx.objectStore("workspaceInvitations").index("byUser").getAll(userId)) {
      if (invitation.workspaceId === workspaceId) await tx.objectStore("workspaceInvitations").delete(invitation.id);
    }
    for (const teamMember of await tx.objectStore("teamMembers").index("byUser").getAll(userId)) {
      if (teamsInWorkspace.has(teamMember.teamId)) await tx.objectStore("teamMembers").delete(teamMember.id);
    }
    await tx.objectStore("workspaceMembers").delete(member.id);
    // An account that never set a password and belongs nowhere else was created
    // only for this invitation, so it goes with it.
    if (otherMemberships.length === 0 && !credential) await tx.objectStore("users").delete(userId);
    await tx.done;
  }

  async preview(token: string): Promise<InvitationPreview> {
    const db = await this.conn.getDb();
    const invitation = (await db.getFromIndex("workspaceInvitations", "byToken", token)) ?? null;
    const workspace = invitation ? await db.get("workspaces", invitation.workspaceId) : null;
    const workspaceName = workspace?.name ?? null;
    const status = invitationStatus(invitation);
    if (!invitation || !workspace || status !== "PENDING") return { status: status === "PENDING" ? "INVALID" : status, workspaceName };

    const [user, members] = await Promise.all([db.get("users", invitation.userId), db.getAllFromIndex("workspaceMembers", "byWorkspace", invitation.workspaceId)]);
    const member = members.find((m) => m.userId === invitation.userId);
    if (!user || !member) return { status: "INVALID", workspaceName };
    if (member.status !== "INVITED") return { status: "ACCEPTED", workspaceName };
    return {
      status: "PENDING",
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      jobTitle: user.jobTitle,
      expiresAt: invitation.expiresAt,
    };
  }

  async complete(input: CompleteOnboardingInput): Promise<{ email: string; userId: string }> {
    const db = await this.conn.getDb();
    const invitation = (await db.getFromIndex("workspaceInvitations", "byToken", input.token)) ?? null;
    const status = invitationStatus(invitation);
    if (!invitation || status !== "PENDING") throw new Error(invitationStatusMessage(status));
    if (input.password.length < PASSWORD_MIN_LENGTH) throw new Error(`Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`);
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    if (!firstName || !lastName) throw new Error("First and last name are required.");

    const user = await db.get("users", invitation.userId);
    if (!user) throw new NotFoundError("User", invitation.userId);
    const members = await db.getAllFromIndex("workspaceMembers", "byWorkspace", invitation.workspaceId);
    const member = members.find((m) => m.userId === invitation.userId);
    if (!member) throw new Error(invitationStatusMessage("INVALID"));
    if (member.status !== "INVITED") throw new Error(invitationStatusMessage("ACCEPTED"));

    const now = nowIso();
    const salt = newSalt();
    const hash = await hashPassword(input.password, salt);
    const updatedUser: User = {
      ...user,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      jobTitle: input.jobTitle?.trim() || null,
      updatedAt: now,
    };

    const tx = db.transaction(["users", "workspaceMembers", "workspaceInvitations", "credentials"], "readwrite");
    await tx.objectStore("users").put(updatedUser);
    await tx.objectStore("credentials").put({ userId: user.id, salt, hash, createdAt: now });
    await tx.objectStore("workspaceMembers").put({ ...member, status: "ACTIVE", joinedAt: now });
    await tx.objectStore("workspaceInvitations").put({ ...invitation, acceptedAt: now });
    await tx.done;
    return { email: user.email, userId: user.id };
  }

  /** Used by LocalAuthProvider: whether a password set through onboarding matches. Null when none is stored. */
  async verifyPassword(userId: string, password: string): Promise<boolean | null> {
    const db = await this.conn.getDb();
    const credential = await db.get("credentials", userId);
    if (!credential) return null;
    return verifyPassword(password, credential.salt, credential.hash);
  }
}

async function pendingMember(db: StreamlineDatabase, workspaceId: string, userId: string): Promise<WorkspaceMember> {
  const members = await db.getAllFromIndex("workspaceMembers", "byWorkspace", workspaceId);
  const member = members.find((m) => m.userId === userId);
  if (!member) throw new NotFoundError("WorkspaceMember", userId);
  if (member.status !== "INVITED") throw new Error("Only members who have not finished onboarding have an invitation link.");
  return member;
}

import {
  INVITATION_TTL_DAYS,
  PASSWORD_MIN_LENGTH,
  SELF_JOIN_MESSAGES,
  generateInvitationToken,
  invitationStatus,
  invitationStatusMessage,
  type CompleteOnboardingInput,
  type InvitationPreview,
  type InviteMemberInput,
  type SelfJoinInput,
  type SelfJoinPreview,
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
    // One person, one account, across every workspace: somebody who joined a
    // workspace before is let in here at once, with no link (a link sets the
    // password, and theirs is set). The same rules as src/server/onboarding.ts.
    if (user) {
      const known: User = user;
      const seats = await db.getAllFromIndex("workspaceMembers", "byUser", known.id);
      const here = seats.find((m) => m.workspaceId === input.workspaceId);
      if (here?.status === "DEACTIVATED") throw new Error(`${known.displayName} is deactivated in this workspace. Reactivate them from the members list instead.`);
      if (here) throw new Error(`${known.displayName} is already a member of this workspace`);
      if (seats.some((m) => m.status === "ACTIVE" || m.status === "DEACTIVATED")) {
        const revived: User = known.deactivatedAt ? { ...known, deactivatedAt: null, updatedAt: now } : known;
        const member: WorkspaceMember = { id: newId(), workspaceId: input.workspaceId, userId: known.id, role: input.role, status: "ACTIVE", joinedAt: now };
        const workspaceTeams = new Set((await db.getAllFromIndex("teams", "byWorkspace", input.workspaceId)).map((t) => t.id));
        const tx = db.transaction(["users", "workspaceMembers", "teamMembers"], "readwrite");
        if (revived !== known) await tx.objectStore("users").put(revived);
        await tx.objectStore("workspaceMembers").put(member);
        const existingTeams = await tx.objectStore("teamMembers").index("byUser").getAll(known.id);
        for (const teamId of new Set(input.teamIds)) {
          if (!workspaceTeams.has(teamId) || existingTeams.some((m) => m.teamId === teamId)) continue;
          await tx.objectStore("teamMembers").put({ id: newId(), teamId, userId: known.id, role: "MEMBER" });
        }
        await tx.done;
        return { user: revived, member, invitation: null };
      }
      if (seats.some((m) => m.status === "INVITED")) throw new Error(`${known.displayName} has been added to another workspace and has not finished joining yet. Add them here once they have.`);
    }
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
    const workspaceTeams = new Set((await db.getAllFromIndex("teams", "byWorkspace", input.workspaceId)).map((t) => t.id));

    const tx = db.transaction(["users", "workspaceMembers", "teamMembers", "workspaceInvitations"], "readwrite");
    if (isNew) await tx.objectStore("users").put(resolved);
    await tx.objectStore("workspaceMembers").put(member);
    const existingTeams = await tx.objectStore("teamMembers").index("byUser").getAll(resolved.id);
    for (const teamId of new Set(input.teamIds)) {
      // Only teams of this workspace, as the server has it.
      if (!workspaceTeams.has(teamId) || existingTeams.some((m) => m.teamId === teamId)) continue;
      const teamMember: TeamMember = { id: newId(), teamId, userId: resolved.id, role: "MEMBER" };
      await tx.objectStore("teamMembers").put(teamMember);
    }
    await tx.objectStore("workspaceInvitations").put(invitation);
    await tx.done;
    return { user: resolved, member, invitation };
  }

  async previewSelfJoin(key: string): Promise<SelfJoinPreview> {
    const workspace = await this.workspaceByJoinKey(key);
    return { valid: !!workspace, workspaceName: workspace?.name ?? null };
  }

  async selfJoin(input: SelfJoinInput): Promise<{ token: string }> {
    const workspace = await this.workspaceByJoinKey(input.key);
    if (!workspace) throw new Error(SELF_JOIN_MESSAGES.off);
    const db = await this.conn.getDb();
    const email = input.email.trim().toLowerCase();
    const memberships = await db.getAllFromIndex("workspaceMembers", "byWorkspace", workspace.id);
    const known = await db.getFromIndex("users", "byEmail", email);
    if (known) {
      const member = memberships.find((m) => m.userId === known.id);
      throw new Error(SELF_JOIN_MESSAGES[member?.status === "ACTIVE" ? "member" : member ? "pending" : "known"]);
    }
    // Recorded as added by the workspace's owner: the link is theirs to hand out.
    const owner = memberships.find((m) => m.role === "OWNER" && m.status === "ACTIVE") ?? memberships.find((m) => m.role === "OWNER");
    const result = await this.invite({ workspaceId: workspace.id, invitedBy: owner?.userId ?? "", email, firstName: input.firstName, lastName: input.lastName, jobTitle: null, role: "MEMBER", teamIds: [] });
    // Only a brand-new email reaches this far, and a new person always gets a link.
    if (!result.invitation) throw new Error(SELF_JOIN_MESSAGES.known);
    return { token: result.invitation.token };
  }

  private async workspaceByJoinKey(key: string) {
    const clean = key.trim();
    if (!clean) return null;
    const db = await this.conn.getDb();
    return (await db.getAll("workspaces")).find((w) => w.joinKey === clean) ?? null;
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

  async reinitiate(workspaceId: string, userId: string, actorId?: string): Promise<WorkspaceInvitation> {
    const db = await this.conn.getDb();
    const members = await db.getAllFromIndex("workspaceMembers", "byWorkspace", workspaceId);
    const member = members.find((m) => m.userId === userId);
    if (!member) throw new NotFoundError("WorkspaceMember", userId);
    if (member.status === "INVITED") throw new Error("This person has not finished onboarding yet; renew their existing link instead.");
    // The same rule as the server: an account used in another workspace is the Owners' to reset.
    const elsewhere = (await db.getAllFromIndex("workspaceMembers", "byUser", userId)).some((m) => m.workspaceId !== workspaceId && m.status === "ACTIVE");
    if (elsewhere) {
      const owners = JSON.parse((await db.get("meta", "appOwners"))?.value ?? "[]") as string[];
      if (!actorId || !owners.includes(actorId)) throw new Error("This person also uses another workspace. Only an Owner can reset their account.");
    }
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

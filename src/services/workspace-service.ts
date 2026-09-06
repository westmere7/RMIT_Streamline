import type {
  CompleteOnboardingInput,
  EntityId,
  InvitationPreview,
  InviteMemberInput,
  Team,
  TeamInput,
  TeamMember,
  TeamRole,
  User,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMember,
  WorkspaceRole,
} from "@/domain";
import { invitationStatus } from "@/domain";
import type { InviteResult, Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";

export interface WorkspaceContext {
  workspace: Workspace;
  members: WorkspaceMember[];
  users: User[];
  teams: Team[];
  teamMembers: TeamMember[];
}

export class WorkspaceService {
  constructor(private readonly repos: Repositories) {}

  async getWorkspaceBySlug(slug: string): Promise<Workspace | null> {
    return this.repos.workspaces.getBySlug(slug);
  }

  async listWorkspacesForUser(userId: EntityId): Promise<Workspace[]> {
    const memberships = await this.repos.workspaces.listMembershipsForUser(userId);
    const workspaces = await Promise.all(memberships.map((m) => this.repos.workspaces.getById(m.workspaceId)));
    return workspaces.filter((w): w is Workspace => w !== null);
  }

  /** Everything the shell needs about people and teams, loaded once. */
  async loadContext(workspaceId: EntityId): Promise<WorkspaceContext> {
    const workspace = await this.repos.workspaces.getById(workspaceId);
    if (!workspace) throw new NotFoundError("Workspace", workspaceId);
    const [members, users, teams, teamMembers] = await Promise.all([
      this.repos.workspaces.listMembers(workspaceId),
      this.repos.users.list(),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.teams.listMembersByWorkspace(workspaceId),
    ]);
    const memberUserIds = new Set(members.map((m) => m.userId));
    return { workspace, members, users: users.filter((u) => memberUserIds.has(u.id)), teams, teamMembers };
  }

  async updateWorkspace(workspaceId: EntityId, patch: Partial<Pick<Workspace, "name">>): Promise<Workspace> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Workspace name cannot be empty");
    return this.repos.workspaces.update(workspaceId, patch.name !== undefined ? { name: patch.name.trim() } : patch);
  }

  // ---- Members -------------------------------------------------------------

  /**
   * Adds someone to the workspace. They appear in the member list at once as
   * "pending onboarding" and can do nothing until they open the returned link,
   * set a password and finish their profile. Nothing is emailed: the admin
   * passes the link on themselves.
   */
  async inviteMember(input: InviteMemberInput): Promise<InviteResult> {
    const email = input.email.trim().toLowerCase();
    if (!email) throw new Error("An email address is required");
    if (!input.firstName.trim() || !input.lastName.trim()) throw new Error("First and last name are required");
    return this.repos.onboarding.invite({ ...input, email, jobTitle: input.jobTitle?.trim() || null, teamIds: Array.from(new Set(input.teamIds)) });
  }

  /** The live (unused, unexpired, unrevoked) invitation per pending member, keyed by user id. */
  async listLiveInvitations(workspaceId: EntityId): Promise<Map<EntityId, WorkspaceInvitation>> {
    const live = new Map<EntityId, WorkspaceInvitation>();
    for (const invitation of await this.repos.onboarding.listInvitations(workspaceId)) {
      if (invitationStatus(invitation) === "PENDING" && !live.has(invitation.userId)) live.set(invitation.userId, invitation);
    }
    return live;
  }

  /** Issues a fresh link for a pending member; the previous one stops working. */
  async regenerateInvitation(workspaceId: EntityId, userId: EntityId): Promise<WorkspaceInvitation> {
    return this.repos.onboarding.regenerate(workspaceId, userId);
  }

  /** Puts an existing member back through onboarding with a fresh link; they set a new password when they open it. */
  async reinitiateMember(workspaceId: EntityId, userId: EntityId): Promise<WorkspaceInvitation> {
    return this.repos.onboarding.reinitiate(workspaceId, userId);
  }

  /** Takes a pending member out of the workspace again, before they ever signed in. */
  async cancelInvitation(workspaceId: EntityId, userId: EntityId): Promise<void> {
    return this.repos.onboarding.cancel(workspaceId, userId);
  }

  /** What the join page shows for a link. Safe while signed out. */
  async previewInvitation(token: string): Promise<InvitationPreview> {
    return this.repos.onboarding.preview(token);
  }

  /** The invited person sets their password and details; their membership becomes ACTIVE. */
  async completeOnboarding(input: CompleteOnboardingInput): Promise<{ email: string; userId: EntityId }> {
    return this.repos.onboarding.complete(input);
  }

  /** Accounts the local sign-in screen offers: active people who have finished onboarding somewhere. */
  async listSignInAccounts(): Promise<User[]> {
    const users = await this.repos.users.list();
    const results = await Promise.all(
      users
        .filter((u) => u.deactivatedAt === null)
        .map(async (u) => {
          const memberships = await this.repos.workspaces.listMembershipsForUser(u.id);
          return memberships.some((m) => m.status === "ACTIVE") ? u : null;
        }),
    );
    return results.filter((u): u is User => u !== null);
  }

  async changeMemberRole(memberId: EntityId, role: WorkspaceRole): Promise<WorkspaceMember> {
    return this.repos.workspaces.updateMember(memberId, { role });
  }

  async setMemberActive(memberId: EntityId, userId: EntityId, active: boolean): Promise<WorkspaceMember> {
    await this.repos.users.update(userId, { deactivatedAt: active ? null : new Date().toISOString() });
    return this.repos.workspaces.updateMember(memberId, { status: active ? "ACTIVE" : "DEACTIVATED" });
  }

  // ---- Teams ---------------------------------------------------------------

  async createTeam(input: TeamInput, creatorId: EntityId): Promise<Team> {
    if (!input.name.trim()) throw new Error("Team name cannot be empty");
    const team = await this.repos.teams.create({ ...input, name: input.name.trim() });
    await this.repos.teams.addMember(team.id, creatorId, "LEAD");
    return team;
  }

  async updateTeam(teamId: EntityId, patch: Partial<Pick<Team, "name" | "description" | "color" | "icon">>): Promise<Team> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Team name cannot be empty");
    return this.repos.teams.update(teamId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
  }

  async archiveTeam(teamId: EntityId, archived: boolean): Promise<Team> {
    return this.repos.teams.update(teamId, { archivedAt: archived ? new Date().toISOString() : null });
  }

  async addTeamMember(teamId: EntityId, userId: EntityId, role: TeamRole = "MEMBER"): Promise<TeamMember> {
    return this.repos.teams.addMember(teamId, userId, role);
  }

  async removeTeamMember(teamId: EntityId, userId: EntityId): Promise<void> {
    return this.repos.teams.removeMember(teamId, userId);
  }
}

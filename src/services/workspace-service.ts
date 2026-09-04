import type { EntityId, Team, TeamInput, TeamMember, TeamRole, User, Workspace, WorkspaceMember, WorkspaceRole } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";

export interface WorkspaceContext {
  workspace: Workspace;
  members: WorkspaceMember[];
  users: User[];
  teams: Team[];
  teamMembers: TeamMember[];
}

export interface InviteMemberInput {
  workspaceId: EntityId;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  role: WorkspaceRole;
  teamIds: EntityId[];
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

  async inviteMember(input: InviteMemberInput): Promise<{ user: User; member: WorkspaceMember }> {
    const email = input.email.trim().toLowerCase();
    let user = await this.repos.users.getByEmail(email);
    if (!user) {
      user = await this.repos.users.create({
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        displayName: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
        avatarUrl: null,
        jobTitle: input.jobTitle?.trim() || null,
        department: null,
        timezone: "Australia/Melbourne",
      });
    }
    const existing = (await this.repos.workspaces.listMembers(input.workspaceId)).find((m) => m.userId === user!.id);
    if (existing) throw new Error(`${user.displayName} is already a member of this workspace`);
    const member = await this.repos.workspaces.addMember({
      workspaceId: input.workspaceId,
      userId: user.id,
      role: input.role,
      status: "INVITED",
      joinedAt: new Date().toISOString(),
    });
    for (const teamId of input.teamIds) await this.repos.teams.addMember(teamId, user.id, "MEMBER");
    return { user, member };
  }

  async changeMemberRole(memberId: EntityId, role: WorkspaceRole): Promise<WorkspaceMember> {
    return this.repos.workspaces.updateMember(memberId, { role });
  }

  async setMemberActive(memberId: EntityId, userId: EntityId, active: boolean): Promise<WorkspaceMember> {
    await this.repos.users.update(userId, { deactivatedAt: active ? null : new Date().toISOString() });
    return this.repos.workspaces.updateMember(memberId, { status: active ? "ACTIVE" : "DEACTIVATED" });
  }

  async acceptInvite(memberId: EntityId): Promise<WorkspaceMember> {
    return this.repos.workspaces.updateMember(memberId, { status: "ACTIVE" });
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

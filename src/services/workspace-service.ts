import type {
  Board,
  BoardColumn,
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
import { defaultSettingsFor, generateBookingKey, invitationStatus } from "@/domain";
import type { InviteResult, Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { slugify, uniqueSlug } from "@/lib/slug";
import { taskAllocationColumns } from "./booking-service";
import { backfillAssetsRecap } from "./item-asset-service";

/** The Admin team and its Task Allocation board, as the app creates them. */
export const SYSTEM_TEAM = { name: "Admin", description: "Task allocation and workspace administration.", color: "navy", icon: "shield-check" } as const;
export const SYSTEM_BOARD = { name: "Task Allocation", description: "Every task booked by a stakeholder lands here until a manager places it with a team.", color: "red", icon: "inbox" } as const;
export const SYSTEM_BOARD_GROUPS = [
  { name: "Incoming", color: "red" },
  { name: "Allocated", color: "blue" },
  { name: "Closed", color: "gray" },
] as const;

export interface SystemEntities {
  workspace: Workspace;
  team: Team;
  board: Board;
}

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

  async updateTeam(teamId: EntityId, patch: Partial<Pick<Team, "name" | "description" | "color" | "icon" | "bookingBoardId">>): Promise<Team> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("Team name cannot be empty");
    if (patch.bookingBoardId) {
      const [team, board] = await Promise.all([this.repos.teams.getById(teamId), this.repos.boards.getById(patch.bookingBoardId)]);
      if (!team) throw new NotFoundError("Team", teamId);
      if (!board || board.workspaceId !== team.workspaceId || board.system || board.archivedAt) throw new Error("Bookings can only land on an active board of this workspace.");
    }
    return this.repos.teams.update(teamId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
  }

  async archiveTeam(teamId: EntityId, archived: boolean): Promise<Team> {
    const team = await this.repos.teams.getById(teamId);
    if (!team) throw new NotFoundError("Team", teamId);
    if (team.system && archived) throw new Error(`${team.name} is built in and cannot be archived. You can rename it instead.`);
    return this.repos.teams.update(teamId, { archivedAt: archived ? new Date().toISOString() : null });
  }

  /**
   * Removes a team for good. Its boards and trackers either go with it — items,
   * updates, the lot — or stay in the workspace with no team, which is what the
   * database does on its own when a team disappears. Built-in teams cannot be
   * removed, and a built-in board is never deleted along with one.
   */
  async deleteTeam(teamId: EntityId, options: { deleteBoards?: boolean } = {}): Promise<{ deletedBoards: number; deletedTrackers: number }> {
    const team = await this.repos.teams.getById(teamId);
    if (!team) throw new NotFoundError("Team", teamId);
    if (team.system) throw new Error(`${team.name} is built in and cannot be deleted. You can rename it instead.`);

    let deletedBoards = 0;
    let deletedTrackers = 0;
    if (options.deleteBoards) {
      const boards = (await this.repos.boards.listByWorkspace(team.workspaceId)).filter((b) => b.teamId === teamId && !b.system);
      for (const board of boards) {
        await this.repos.boards.delete(board.id);
        deletedBoards += 1;
      }
      const trackers = (await this.repos.trackers.listByWorkspace(team.workspaceId)).filter((t) => t.teamId === teamId);
      for (const tracker of trackers) {
        await this.repos.trackers.delete(tracker.id);
        deletedTrackers += 1;
      }
    }
    await this.repos.teams.delete(teamId);
    return { deletedBoards, deletedTrackers };
  }

  // ---- Built-in team and board -----------------------------------------------

  /**
   * Makes sure the workspace has its "Admin" team, its "Task Allocation" board
   * and a booking key, creating whatever is missing. Safe to call as often as
   * needed: it is run when an admin opens the workspace and before every
   * booking. The board's "Requested team" palette is topped up with any team
   * created since, and an archived system row is brought back.
   */
  /**
   * The system entities as they are, plus the workspace's teams and boards, in
   * one parallel round of reads and with no repair work. Null when anything is
   * missing, in which case the caller falls back to `ensureSystemEntities`. The
   * booking form and every booking take this path: they are read many times a
   * day, often by people outside the team, and the maintenance the full path
   * does (palette refresh, column top-up, un-archiving) only needs to happen when
   * an admin opens the workspace.
   */
  async findSystemEntities(workspaceId: EntityId): Promise<(SystemEntities & { teams: Team[]; boards: Board[] }) | null> {
    const [workspace, teams, boards] = await Promise.all([
      this.repos.workspaces.getById(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.boards.listByWorkspace(workspaceId),
    ]);
    const team = teams.find((t) => t.system === "ADMIN");
    const board = boards.find((b) => b.system === "TASK_ALLOCATION");
    if (!workspace || !workspace.bookingKey || !team || team.archivedAt || !board || board.archivedAt || board.teamId !== team.id) return null;
    return { workspace, team, board, teams, boards };
  }

  async ensureSystemEntities(workspaceId: EntityId, actorId?: EntityId): Promise<SystemEntities> {
    let workspace = await this.repos.workspaces.getById(workspaceId);
    if (!workspace) throw new NotFoundError("Workspace", workspaceId);
    const owner = actorId ?? (await this.defaultActor(workspaceId));

    let teams = await this.repos.teams.listByWorkspace(workspaceId);
    let team = teams.find((t) => t.system === "ADMIN");
    if (!team) {
      try {
        team = await this.repos.teams.create({ workspaceId, ...SYSTEM_TEAM, system: "ADMIN" });
      } catch (error) {
        // Two admins opening the workspace at once: the unique index let one through; read theirs.
        teams = await this.repos.teams.listByWorkspace(workspaceId);
        team = teams.find((t) => t.system === "ADMIN");
        if (!team) throw error;
      }
    }
    if (team.archivedAt) team = await this.repos.teams.update(team.id, { archivedAt: null });
    const members = await this.repos.teams.listMembers(team.id);
    if (actorId && !members.some((m) => m.userId === actorId)) await this.repos.teams.addMember(team.id, actorId, members.length ? "MEMBER" : "LEAD");

    const teamNames = teams
      .filter((t) => t.archivedAt === null && !t.system)
      .map((t) => t.name)
      .sort((a, b) => a.localeCompare(b));
    let boards = await this.repos.boards.listByWorkspace(workspaceId);
    let board = boards.find((b) => b.system === "TASK_ALLOCATION");
    if (!board) {
      try {
        board = await this.createSystemBoard(workspaceId, team.id, owner, boards, teamNames);
      } catch (error) {
        boards = await this.repos.boards.listByWorkspace(workspaceId);
        board = boards.find((b) => b.system === "TASK_ALLOCATION");
        if (!board) throw error;
      }
    } else {
      if (board.archivedAt || board.teamId !== team.id) board = await this.repos.boards.update(board.id, { archivedAt: null, teamId: team.id });
      await this.refreshTeamPalette(board, teamNames);
      await this.topUpColumns(board, teamNames);
    }

    if (!workspace.bookingKey) workspace = await this.repos.workspaces.update(workspaceId, { bookingKey: generateBookingKey() });
    return { workspace, team, board };
  }

  /** Replaces the public booking link; the old one stops working at once. */
  async regenerateBookingKey(workspaceId: EntityId): Promise<Workspace> {
    return this.repos.workspaces.update(workspaceId, { bookingKey: generateBookingKey() });
  }

  private async createSystemBoard(workspaceId: EntityId, teamId: EntityId, ownerId: EntityId, existing: Board[], teamNames: string[]): Promise<Board> {
    const board = await this.repos.boards.create({
      workspaceId,
      teamId,
      name: SYSTEM_BOARD.name,
      slug: uniqueSlug(slugify(SYSTEM_BOARD.name), existing.map((b) => b.slug)),
      description: SYSTEM_BOARD.description,
      type: "MAIN",
      visibility: "TEAM",
      ownerId,
      color: SYSTEM_BOARD.color,
      icon: SYSTEM_BOARD.icon,
      system: "TASK_ALLOCATION",
    });
    await this.repos.boards.setMember(board.id, ownerId, "OWNER");
    for (const [index, group] of SYSTEM_BOARD_GROUPS.entries()) {
      await this.repos.boards.createGroup({ boardId: board.id, name: group.name, color: group.color, position: index, collapsed: false });
    }
    for (const [index, column] of taskAllocationColumns(teamNames).entries()) {
      await this.repos.boards.createColumn({ boardId: board.id, name: column.name, type: column.type, settings: column.settings ?? defaultSettingsFor(column.type), position: index });
    }
    await this.repos.activities.create({ workspaceId, boardId: board.id, itemId: null, actorId: ownerId, eventType: "BOARD_CREATED", metadata: { boardName: board.name } });
    return board;
  }

  /**
   * A Task Allocation board created by an earlier version gets any column the
   * current version relies on. A column counts as present when one of the same
   * type exists whose name shares a word with it, so a renamed column is left be.
   */
  private async topUpColumns(board: Board, teamNames: string[]): Promise<void> {
    const columns = await this.repos.boards.listColumns(board.id);
    const words = (name: string) => name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
    let position = columns.length;
    for (const wanted of taskAllocationColumns(teamNames)) {
      const present = columns.some((c) => c.type === wanted.type && (c.name.toLowerCase() === wanted.name.toLowerCase() || words(c.name).some((w) => words(wanted.name).includes(w))));
      if (present) continue;
      const created = await this.repos.boards.createColumn({ boardId: board.id, name: wanted.name, type: wanted.type, settings: wanted.settings ?? defaultSettingsFor(wanted.type), position: position++ });
      if (created.type === "ASSETS_RECAP") await backfillAssetsRecap(this.repos, board.id, created.id);
    }
  }

  /** Adds newly created teams to the "Requested team" palette; never removes or recolours. */
  private async refreshTeamPalette(board: Board, teamNames: string[]): Promise<void> {
    const columns = await this.repos.boards.listColumns(board.id);
    const column: BoardColumn | undefined = columns.find((c) => c.type === "TAGS" && c.name.toLowerCase().includes("team"));
    if (!column || column.settings.kind !== "tags") return;
    const have = new Set(column.settings.options.map((o) => o.name.toLowerCase()));
    const missing = teamNames.filter((name) => !have.has(name.toLowerCase()));
    if (missing.length === 0) return;
    const palette = taskAllocationColumns(teamNames).find((c) => c.name === "Requested team")?.settings;
    const colourOf = (name: string) => (palette?.kind === "tags" ? palette.options.find((o) => o.name === name)?.color : undefined) ?? "gray";
    await this.repos.boards.updateColumn(column.id, { settings: { kind: "tags", options: [...column.settings.options, ...missing.map((name) => ({ name, color: colourOf(name) }))] } });
  }

  /** The workspace owner, for rows the app creates on nobody's behalf. */
  private async defaultActor(workspaceId: EntityId): Promise<EntityId> {
    const members = await this.repos.workspaces.listMembers(workspaceId);
    const owner = members.find((m) => m.role === "OWNER" && m.status === "ACTIVE") ?? members.find((m) => m.role === "OWNER" || m.role === "ADMIN");
    if (!owner) throw new Error("The workspace has no owner to create its built-in board as.");
    return owner.userId;
  }

  async addTeamMember(teamId: EntityId, userId: EntityId, role: TeamRole = "MEMBER"): Promise<TeamMember> {
    return this.repos.teams.addMember(teamId, userId, role);
  }

  async removeTeamMember(teamId: EntityId, userId: EntityId): Promise<void> {
    return this.repos.teams.removeMember(teamId, userId);
  }
}

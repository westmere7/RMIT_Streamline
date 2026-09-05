import type { Board, EntityId, Team, User, WorkspaceMember } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import type { MyWorkItem } from "./my-work-service";
import type { MyWorkService } from "./my-work-service";

/** How a person reaches a board, in the order the profile page shows them. */
export type BoardRelation = "owner" | "member" | "team";

export interface ProfileBoard {
  board: Board;
  relation: BoardRelation;
}

export interface ProfileView {
  user: User;
  /** Their membership of this workspace, or null for someone outside it. */
  member: WorkspaceMember | null;
  teams: Team[];
  boards: ProfileBoard[];
  /** Open items assigned to them, newest deadline first (see MyWorkService). */
  tasks: MyWorkItem[];
}

/**
 * Everything the profile page shows about one person: who they are, the teams
 * they belong to, the boards they can reach and the work assigned to them.
 */
export class ProfileService {
  constructor(
    private readonly repos: Repositories,
    private readonly myWork: MyWorkService,
  ) {}

  async load(workspaceId: EntityId, userId: EntityId): Promise<ProfileView> {
    const user = await this.repos.users.getById(userId);
    if (!user) throw new NotFoundError("User", userId);

    const [members, teams, teamMembers, boards, boardMembers, tasks] = await Promise.all([
      this.repos.workspaces.listMembers(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.teams.listMembersByWorkspace(workspaceId),
      this.repos.boards.listByWorkspace(workspaceId),
      this.repos.boards.listMembersByWorkspace(workspaceId),
      this.myWork.listAssigned(workspaceId, userId),
    ]);

    const theirTeamIds = new Set(teamMembers.filter((m) => m.userId === userId).map((m) => m.teamId));
    const theirBoardIds = new Set(boardMembers.filter((m) => m.userId === userId).map((m) => m.boardId));

    const visible = boards.filter((b) => b.archivedAt === null);
    const profileBoards: ProfileBoard[] = [];
    for (const board of visible) {
      if (board.ownerId === userId) profileBoards.push({ board, relation: "owner" });
      else if (theirBoardIds.has(board.id)) profileBoards.push({ board, relation: "member" });
      else if (board.teamId && theirTeamIds.has(board.teamId)) profileBoards.push({ board, relation: "team" });
    }

    return {
      user,
      member: members.find((m) => m.userId === userId) ?? null,
      teams: teams.filter((t) => theirTeamIds.has(t.id) && t.archivedAt === null),
      boards: profileBoards,
      tasks,
    };
  }

  /**
   * Edits someone's details. Row-level security is the real gate: you may edit
   * yourself, and a workspace admin may edit anyone in their workspace
   * (supabase/migrations/0005_direct_messages.sql).
   */
  async updateProfile(
    userId: EntityId,
    patch: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "jobTitle" | "department" | "timezone" | "avatarUrl">>,
  ): Promise<User> {
    const cleaned = { ...patch };
    if (cleaned.firstName !== undefined) cleaned.firstName = cleaned.firstName.trim();
    if (cleaned.lastName !== undefined) cleaned.lastName = cleaned.lastName.trim();
    if (cleaned.displayName !== undefined) {
      const name = cleaned.displayName.trim();
      if (!name) throw new Error("Display name cannot be empty");
      cleaned.displayName = name;
    }
    if (cleaned.jobTitle !== undefined) cleaned.jobTitle = cleaned.jobTitle?.trim() || null;
    if (cleaned.department !== undefined) cleaned.department = cleaned.department?.trim() || null;
    return this.repos.users.update(userId, cleaned);
  }
}

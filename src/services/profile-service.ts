import type { Activity, Board, EntityId, ItemAsset, Team, User, WorkspaceMember } from "@/domain";
import { assetCount } from "@/domain";
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

/** The deliverables with this person's name on them, and what they add up to. */
export interface ProfileAssets {
  /** Outstanding first, then the most recently finished. */
  lines: ItemAsset[];
  /** How many lines in total, done or not. */
  total: number;
  done: number;
  /** Units across every line, a line without a quantity counting as one. */
  units: number;
  overdue: number;
}

export interface ProfileView {
  user: User;
  /** Their membership of this workspace, or null for someone outside it. */
  member: WorkspaceMember | null;
  /** When they joined this workspace, or when the account was made if they never did. */
  joinedAt: string;
  teams: Team[];
  boards: ProfileBoard[];
  /** Open items assigned to them, newest deadline first (see MyWorkService). */
  tasks: MyWorkItem[];
  /** The deliverables they are in charge of. */
  assets: ProfileAssets;
  /** What they have done lately, newest first. */
  activity: Activity[];
}

/** Enough of the workspace's recent activity to find this person's last few moves in. */
const ACTIVITY_WINDOW = 300;
const ACTIVITY_SHOWN = 12;
/** A person's asset list can be long; the page shows the head of it. */
const ASSETS_SHOWN = 12;

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

    const [members, teams, teamMembers, boards, boardMembers, tasks, recent] = await Promise.all([
      this.repos.workspaces.listMembers(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.teams.listMembersByWorkspace(workspaceId),
      this.repos.boards.listByWorkspace(workspaceId),
      this.repos.boards.listMembersByWorkspace(workspaceId),
      this.myWork.listAssigned(workspaceId, userId),
      this.repos.activities.listByWorkspace(workspaceId, ACTIVITY_WINDOW),
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

    const member = members.find((m) => m.userId === userId) ?? null;
    return {
      user,
      member,
      joinedAt: member?.joinedAt ?? user.createdAt,
      teams: teams.filter((t) => theirTeamIds.has(t.id) && t.archivedAt === null),
      boards: profileBoards,
      tasks,
      assets: await this.assetsFor(visible, userId),
      activity: recent.filter((a) => a.actorId === userId).slice(0, ACTIVITY_SHOWN),
    };
  }

  /** Every deliverable across the workspace's live boards that names this person. */
  private async assetsFor(boards: readonly Board[], userId: EntityId): Promise<ProfileAssets> {
    const perBoard = await Promise.all(boards.map((board) => this.repos.itemAssets.listByBoard(board.id)));
    const today = new Date().toISOString().slice(0, 10);
    const theirs = perBoard.flat().filter((asset) => asset.assigneeIds.includes(userId));
    const done = theirs.filter((a) => a.completedAt !== null).length;
    return {
      // What is still to do comes first, and the finished ones trail it newest first.
      lines: theirs
        .slice()
        .sort((a, b) => {
          const open = Number(a.completedAt !== null) - Number(b.completedAt !== null);
          if (open !== 0) return open;
          if (a.completedAt && b.completedAt) return b.completedAt.localeCompare(a.completedAt);
          return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
        })
        .slice(0, ASSETS_SHOWN),
      total: theirs.length,
      done,
      units: theirs.reduce((sum, asset) => sum + assetCount(asset), 0),
      overdue: theirs.filter((a) => !a.completedAt && a.dueDate && a.dueDate < today).length,
    };
  }

  /**
   * Edits someone's details. Row-level security is the real gate: you may edit
   * yourself, and a workspace admin may edit anyone in their workspace
   * (supabase/migrations/0005_direct_messages.sql).
   */
  async updateProfile(
    userId: EntityId,
    patch: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "jobTitle" | "department" | "timezone" | "avatarUrl" | "stakeholderGroup" | "workHoursStart" | "workHoursEnd">>,
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
    if (cleaned.stakeholderGroup !== undefined) cleaned.stakeholderGroup = cleaned.stakeholderGroup?.trim() || null;
    if (cleaned.workHoursStart !== undefined) cleaned.workHoursStart = cleaned.workHoursStart?.trim() || null;
    if (cleaned.workHoursEnd !== undefined) cleaned.workHoursEnd = cleaned.workHoursEnd?.trim() || null;
    return this.repos.users.update(userId, cleaned);
  }
}

import type { Activity, Board, EntityId, ItemAsset, Team, User, WorkspaceMember } from "@/domain";
import { assetCount } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { bucketDate } from "@/lib/dates/dates";
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
  /** Every line, outstanding first, then the most recently finished: the page shows the head and filters the rest. */
  lines: ItemAsset[];
  /** How many lines in total, done or not. */
  total: number;
  done: number;
  /** Units across every line, a line without a quantity counting as one. */
  units: number;
  /** Units on the lines still to do. */
  openUnits: number;
  overdue: number;
  /** Lines still to do that are due today or later this week. */
  dueThisWeek: number;
}

/** Who the person is and where they sit: the head of the profile page. */
export interface ProfileSummary {
  user: User;
  /** Their membership of this workspace, or null for someone outside it. */
  member: WorkspaceMember | null;
  /** When they joined this workspace, or when the account was made if they never did. */
  joinedAt: string;
  teams: Team[];
  boards: ProfileBoard[];
}

/** What they are carrying and have done: the figures and lists under the head. */
export interface ProfileWork {
  /** Open items assigned to them, newest deadline first (see MyWorkService). */
  tasks: MyWorkItem[];
  /** The deliverables they are in charge of. */
  assets: ProfileAssets;
  /** What they have done lately, newest first. */
  activity: Activity[];
}

export type ProfileView = ProfileSummary & ProfileWork;

const ACTIVITY_SHOWN = 12;

/**
 * Everything the profile page shows about one person: who they are, the teams
 * they belong to, the boards they can reach and the work assigned to them.
 *
 * In two parts, so the page can show who someone is while their work is still
 * being read. Each part asks the database for this person's rows only: their
 * cells, their deliverables, their activity. Reading the whole workspace and
 * filtering here made the page slow to open (a workspace of 17 boards moved
 * some 2 MB and a hundred requests to show one person).
 */
export class ProfileService {
  constructor(
    private readonly repos: Repositories,
    private readonly myWork: MyWorkService,
  ) {}

  /** The whole profile at once. */
  async load(workspaceId: EntityId, userId: EntityId): Promise<ProfileView> {
    const [summary, work] = await Promise.all([this.loadSummary(workspaceId, userId), this.loadWork(workspaceId, userId)]);
    return { ...summary, ...work };
  }

  async loadSummary(workspaceId: EntityId, userId: EntityId): Promise<ProfileSummary> {
    const [user, members, teams, teamMembers, boards, boardMembers] = await Promise.all([
      this.repos.users.getById(userId),
      this.repos.workspaces.listMembers(workspaceId),
      this.repos.teams.listByWorkspace(workspaceId),
      this.repos.teams.listMembersByWorkspace(workspaceId),
      this.repos.boards.listByWorkspace(workspaceId),
      this.repos.boards.listMembersByWorkspace(workspaceId),
    ]);
    if (!user) throw new NotFoundError("User", userId);

    const theirTeamIds = new Set(teamMembers.filter((m) => m.userId === userId).map((m) => m.teamId));
    const theirBoardIds = new Set(boardMembers.filter((m) => m.userId === userId).map((m) => m.boardId));

    const profileBoards: ProfileBoard[] = [];
    for (const board of boards) {
      if (board.archivedAt !== null) continue;
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
    };
  }

  async loadWork(workspaceId: EntityId, userId: EntityId): Promise<ProfileWork> {
    const live = (await this.repos.boards.listByWorkspace(workspaceId)).filter((b) => b.archivedAt === null);
    const [tasks, lines, activity] = await Promise.all([
      this.myWork.listAssigned(workspaceId, userId, live),
      this.repos.itemAssets.listAssignedTo(
        live.map((b) => b.id),
        userId,
      ),
      this.repos.activities.listByActor(workspaceId, userId, ACTIVITY_SHOWN),
    ]);
    // Board by board, as the boards list them, so lines that tie in the sort
    // below keep the order they always had.
    const boardOrder = new Map(live.map((board, index) => [board.id, index]));
    const inBoardOrder = lines.slice().sort((a, b) => (boardOrder.get(a.boardId) ?? 0) - (boardOrder.get(b.boardId) ?? 0));
    return { tasks, assets: summariseAssets(inBoardOrder), activity };
  }

  /**
   * Edits someone's details: your own, or anybody's as an admin (an Owner's
   * only as an Owner). Who may is the UI's canEditProfile and, with Supabase,
   * the update policy (profiles_update_admin, migration 0111). `_actorId` is
   * kept for the callers that pass it.
   */
  async updateProfile(
    userId: EntityId,
    patch: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "jobTitle" | "department" | "timezone" | "avatarUrl" | "stakeholderGroup" | "workHoursStart" | "workHoursEnd">>,
    _actorId?: EntityId,
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

  /**
   * Somebody's email, which is their sign-in address too. With Supabase this
   * goes through the server, which checks the caller may (src/server/people.ts).
   */
  async changeEmail(workspaceId: EntityId, userId: EntityId, email: string): Promise<void> {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address.");
    await this.repos.users.changeEmail({ workspaceId, userId, email: clean });
  }

  /** Whether they have joined a workspace: a seat that is, or was, active. The directory covers workspaces the caller is not in. */
  async hasJoined(userId: EntityId): Promise<boolean> {
    const seats = await this.repos.workspaces.listMembershipsForUser(userId);
    if (seats.some((m) => m.status !== "INVITED")) return true;
    return (await this.repos.workspaces.listDirectory()).includes(userId);
  }
}

/** Their deliverables across the workspace's live boards, and what they add up to. */
function summariseAssets(theirs: readonly ItemAsset[]): ProfileAssets {
  const today = new Date().toISOString().slice(0, 10);
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
      }),
    total: theirs.length,
    done,
    units: theirs.reduce((sum, asset) => sum + assetCount(asset), 0),
    openUnits: theirs.filter((a) => !a.completedAt).reduce((sum, asset) => sum + assetCount(asset), 0),
    overdue: theirs.filter((a) => !a.completedAt && a.dueDate && a.dueDate < today).length,
    dueThisWeek: theirs.filter((a) => {
      if (a.completedAt || !a.dueDate) return false;
      const bucket = bucketDate(a.dueDate);
      return bucket === "today" || bucket === "thisWeek";
    }).length,
  };
}

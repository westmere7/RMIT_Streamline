import type { Board, BoardEditScope, BoardMember, BoardRole, Team, TeamMember, WorkspaceMember, WorkspaceRole } from "@/domain";
import { isMembersOnlyBoard } from "@/domain/booking/booking";

/**
 * Everything the permission checks need about the current user, resolved once
 * per workspace load. UI components call `can*` helpers and never inspect roles.
 */
export interface PermissionContext {
  userId: string;
  workspaceRole: WorkspaceRole | null;
  /** Team ids the user belongs to. */
  teamIds: ReadonlySet<string>;
  /** Board memberships keyed by board id. */
  boardRoles: ReadonlyMap<string, BoardRole>;
  /**
   * Each team's say over its boards (migration 0120), by team id. A team not
   * here shows its boards to the workspace and gives its members no editing.
   */
  teamAccess?: ReadonlyMap<string, TeamAccess>;
  /** Built-in teams (the Admin team), whose trackers and docs are for workspace admins alone. */
  systemTeamIds?: ReadonlySet<string>;
}

/** A team's settings for its boards. */
export type TeamAccess = Pick<Team, "boardVisibility" | "boardEdit">;

/**
 * A team's two settings, read the way migration 0123 wrote them: a team with
 * no "who can edit" yet takes it from the older switch (members can edit →
 * the team's members).
 */
export function teamAccessFor(team: Pick<Team, "boardVisibility" | "boardEdit" | "membersCanEdit">): TeamAccess {
  return { boardVisibility: team.boardVisibility ?? "WORKSPACE", boardEdit: team.boardEdit ?? (team.membersCanEdit ? "TEAM" : "ADDED") };
}

export function buildPermissionContext(input: {
  userId: string;
  workspaceMembers: readonly WorkspaceMember[];
  teamMembers: readonly TeamMember[];
  boardMembers: readonly BoardMember[];
  /** The workspace's teams, for what each allows on its boards. */
  teams?: readonly (Pick<Team, "id" | "boardVisibility" | "boardEdit" | "membersCanEdit"> & Partial<Pick<Team, "system">>)[];
}): PermissionContext {
  const membership = input.workspaceMembers.find((m) => m.userId === input.userId && m.status === "ACTIVE");
  return {
    userId: input.userId,
    workspaceRole: membership?.role ?? null,
    teamIds: new Set(input.teamMembers.filter((m) => m.userId === input.userId).map((m) => m.teamId)),
    boardRoles: new Map(
      input.boardMembers.filter((m) => m.userId === input.userId).map((m) => [m.boardId, m.role] as const),
    ),
    // Only when the teams were given: then a team missing from them is one this
    // person may not read, which is a team kept to itself.
    teamAccess: input.teams ? new Map(input.teams.map((team) => [team.id, teamAccessFor(team)] as const)) : undefined,
    systemTeamIds: input.teams ? new Set(input.teams.filter((team) => !!team.system).map((team) => team.id)) : undefined,
  };
}

/**
 * Whether this person sees the team at all: a team that keeps its boards to
 * itself is hidden, with its trackers and docs, from everyone but its members
 * and workspace admins (policies/0028 can_see_team).
 */
export function canSeeTeam(ctx: PermissionContext, team: (Pick<Team, "id" | "boardVisibility"> & Partial<Pick<Team, "system">>) | null | undefined): boolean {
  if (!team) return true;
  // A built-in team is its admins' (policies/0031); someone seated on one of
  // its boards sees it by name only, holding that board.
  if (team.system) return isWorkspaceAdmin(ctx);
  return team.boardVisibility !== "TEAM" || isWorkspaceAdmin(ctx) || ctx.teamIds.has(team.id);
}

/** The same, for something filed under a team by id (a tracker, a doc). */
export function canSeeTeamId(ctx: PermissionContext, teamId: string | null | undefined): boolean {
  if (!teamId) return true;
  if (ctx.systemTeamIds?.has(teamId)) return isWorkspaceAdmin(ctx);
  return teamAccessOf(ctx, teamId).boardVisibility !== "TEAM" || isWorkspaceAdmin(ctx) || ctx.teamIds.has(teamId);
}

/**
 * A team's settings as this person knows them. With the teams known, one not
 * among them is hidden from this person (Supabase leaves it out), so it reads
 * as kept to itself; without them, as the default.
 */
function teamAccessOf(ctx: PermissionContext, teamId: string): TeamAccess {
  const known = ctx.teamAccess?.get(teamId);
  if (known) return known;
  return ctx.teamAccess ? { boardVisibility: "TEAM", boardEdit: "ADDED" } : { boardVisibility: "WORKSPACE", boardEdit: "ADDED" };
}

/** Who may change a team's board access: workspace admins only (policies/0028's trigger). */
export function canEditTeamAccess(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

const WORKSPACE_ADMIN_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN"]);

export function isWorkspaceAdmin(ctx: PermissionContext): boolean {
  return ctx.workspaceRole !== null && WORKSPACE_ADMIN_ROLES.has(ctx.workspaceRole);
}

export function canManageWorkspace(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

/**
 * An Owner: above every workspace. Owners hold the OWNER seat in each one, and
 * nobody else can (the database keeps it so: 0089), so the seat is the test.
 */
export function isOwner(ctx: PermissionContext): boolean {
  return ctx.workspaceRole === "OWNER";
}

/** Creating, renaming across and deleting workspaces. */
export function canManageWorkspaces(ctx: PermissionContext): boolean {
  return isOwner(ctx);
}

/** Making and unmaking Owners. */
export function canManageOwners(ctx: PermissionContext): boolean {
  return isOwner(ctx);
}

/** Snapshots hold and restore the whole database, every workspace in it. */
export function canUseSnapshots(ctx: PermissionContext): boolean {
  return isOwner(ctx);
}

/** Whether this person may change that member's role, access or teams. An Owner's seat is only the Owners' to touch. */
export function canManageMember(ctx: PermissionContext, target: Pick<WorkspaceMember, "role">): boolean {
  return isWorkspaceAdmin(ctx) && (target.role !== "OWNER" || isOwner(ctx));
}

export function canManageMembers(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

/** The dashboard sums up every board, so only workspace admins may hand it to the internet (policies/0010). */
export function canManageDashboardShare(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

/** Teams decide who sees and edits their boards, so making one is an admin's job (0148). */
export function canCreateTeam(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

/** Deleting a team for good is the workspace admins' alone, as teams_delete says. */
export function canDeleteTeam(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

/**
 * Renaming, archiving and choosing a team's people and booking board: workspace
 * admins only (0148). Being in a team is using it, not running it.
 */
export function canManageTeam(ctx: PermissionContext, _teamId: string): boolean {
  return isWorkspaceAdmin(ctx);
}

/** Trackers are workspace-wide sheets: every member except guests can edit them. */
export function canEditTrackers(ctx: PermissionContext): boolean {
  return ctx.workspaceRole !== null && ctx.workspaceRole !== "GUEST";
}

/** Docs are written by the same people as trackers: every member except guests. */
export function canEditDocs(ctx: PermissionContext): boolean {
  return canEditTrackers(ctx);
}

export function canCreateBoard(ctx: PermissionContext): boolean {
  return ctx.workspaceRole !== null && ctx.workspaceRole !== "GUEST";
}

/** The shape the board checks need; `system` marks a built-in board (Task Allocation, App development). */
export type BoardAccessInput = Pick<Board, "id" | "ownerId" | "visibility" | "teamId"> & Partial<Pick<Board, "system" | "followsTeam" | "editScope">>;

/** Built-in rows (the Admin team, the Task Allocation board) exist for workspace admins only. */
export function canSeeSystemEntities(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

/** Effective board role considering ownership, explicit membership and visibility. */
export function boardRoleFor(ctx: PermissionContext, board: BoardAccessInput): BoardRole | null {
  // Built-in boards are for workspace admins, except the members-only kind and
  // Task Allocation, which are decided by their seats below.
  if (board.system && !isMembersOnlyBoard(board) && board.system !== "TASK_ALLOCATION" && !canSeeSystemEntities(ctx)) return null;
  // Membership first, before ownership and before an explicit seat.
  //
  // `workspaceRole` is null for somebody who is not an ACTIVE member — which
  // includes anyone an administrator has deactivated. Honouring ownership above
  // this check meant deactivating a departing colleague left them full OWNER on
  // every board they had created, and their explicit seats intact, which is the
  // opposite of what the Members screen promises. Deactivation is the
  // offboarding control; it has to reach the boards. (Audit F-001.)
  if (ctx.workspaceRole === null) return null;
  // Task Allocation, for anyone but an admin: the seat an admin gave them, and
  // nothing else; owning the row adds nothing (policies/0031, step 1a).
  if (board.system === "TASK_ALLOCATION" && !isWorkspaceAdmin(ctx)) {
    const seat = ctx.boardRoles.get(board.id) ?? null;
    if (seat) return seat === "OWNER" ? "EDITOR" : seat;
    if (ctx.workspaceRole === "GUEST") return null;
    // Then its own "who can see" and "who can edit", never the Admin team's.
    const { see, edit } = boardAccessOf(board, null);
    const inTeam = !!board.teamId && ctx.teamIds.has(board.teamId);
    if (!(see === "WORKSPACE" || (see === "TEAM" && inTeam))) return null;
    return edit === "VIEWERS" || (edit === "TEAM" && inTeam) ? "EDITOR" : "VIEWER";
  }
  if (board.ownerId === ctx.userId) return "OWNER";
  const explicit = ctx.boardRoles.get(board.id);
  if (explicit) return explicit;
  // The App development board is its members' alone: no admin role, no visibility.
  if (isMembersOnlyBoard(board)) return null;
  if (isWorkspaceAdmin(ctx)) return "EDITOR";

  // Who can see and who can edit (policies/0030, step 5): the team's two
  // settings while the board follows its team, else the board's own. Guests
  // reach only boards they were added to.
  if (ctx.workspaceRole === "GUEST" || board.system) return null;
  const { see, edit } = boardAccessOf(board, board.teamId ? teamAccessOf(ctx, board.teamId) : null);
  const inTeam = !!board.teamId && ctx.teamIds.has(board.teamId);
  if (!(see === "WORKSPACE" || (see === "TEAM" && inTeam))) return null;
  return edit === "VIEWERS" || (edit === "TEAM" && inTeam) ? "EDITOR" : "VIEWER";
}

/**
 * A board's "who can see" and "who can edit" as they stand: its team's while
 * it follows one, else its own. `fromTeam` says which.
 */
export function boardAccessOf(
  board: Pick<Board, "teamId" | "visibility"> & Partial<Pick<Board, "followsTeam" | "editScope" | "system">>,
  team: TeamAccess | null | undefined,
): { see: Board["visibility"]; edit: BoardEditScope; fromTeam: boolean } {
  // Task Allocation keeps its own settings: its team, the Admin team, is open
  // to everyone by default, which would hand the board to every member (policies/0031).
  // A board from before 0125 says TEAM, which for the Admin team meant its admins: people added, then.
  if (board.system === "TASK_ALLOCATION") return { see: board.visibility === "TEAM" ? "PRIVATE" : board.visibility, edit: board.editScope ?? "ADDED", fromTeam: false };
  // Unset (a row from before migration 0123), a private board is its own and any other follows: what the migration wrote.
  if (board.teamId && (board.followsTeam ?? board.visibility !== "PRIVATE")) {
    return { see: team?.boardVisibility ?? "WORKSPACE", edit: team?.boardEdit ?? "ADDED", fromTeam: true };
  }
  return { see: board.visibility, edit: board.editScope ?? "ADDED", fromTeam: false };
}

export function canViewBoard(ctx: PermissionContext, board: BoardAccessInput): boolean {
  return boardRoleFor(ctx, board) !== null;
}

export function canEditBoard(ctx: PermissionContext, board: BoardAccessInput): boolean {
  const role = boardRoleFor(ctx, board);
  return role === "OWNER" || role === "EDITOR";
}

export function canManageBoard(ctx: PermissionContext, board: BoardAccessInput): boolean {
  const role = boardRoleFor(ctx, board);
  // A members-only board is its owner's to run. An admin seated on it is a
  // member like any other, or they could raise their own seat.
  if (isMembersOnlyBoard(board)) return role === "OWNER";
  // Task Allocation is run by workspace admins alone, who it is open to included.
  if (board.system === "TASK_ALLOCATION") return isWorkspaceAdmin(ctx) && role !== null;
  // Otherwise an admin manages what they can see, which is every other board.
  return role === "OWNER" || (isWorkspaceAdmin(ctx) && role !== null);
}

/**
 * Whether this person may change or remove `memberId`'s seat on the board.
 *
 * A manager may, on anybody's but their own and the owner's: nobody raises,
 * lowers or removes their own place on a board, so a seat is always somebody
 * else's decision.
 */
export function canEditBoardSeat(ctx: PermissionContext, board: BoardAccessInput, memberId: string): boolean {
  return canManageBoard(ctx, board) && memberId !== ctx.userId && memberId !== board.ownerId;
}

export function canDeleteBoard(ctx: PermissionContext, board: BoardAccessInput): boolean {
  // Membership first, for the reason given on `boardRoleFor`: this check reads
  // ownership directly, so without it a deactivated owner could still delete
  // the board.
  if (ctx.workspaceRole === null) return false;
  if (board.ownerId === ctx.userId) return true;
  return !isMembersOnlyBoard(board) && isWorkspaceAdmin(ctx) && boardRoleFor(ctx, board) !== null;
}

export function canEditComment(ctx: PermissionContext, comment: { authorId: string }): boolean {
  return comment.authorId === ctx.userId;
}

/**
 * Your own update, always. Somebody else's only as an admin (or Owner) who is a
 * member of the board it is on: its owner, or a seat on it. Seeing the board
 * through the admin role alone is not enough (private.can_delete_comment).
 */
export function canDeleteComment(ctx: PermissionContext, comment: { authorId: string }, board?: Pick<Board, "id" | "ownerId"> | null): boolean {
  if (comment.authorId === ctx.userId) return true;
  if (!board || !isWorkspaceAdmin(ctx)) return false;
  return board.ownerId === ctx.userId || ctx.boardRoles.has(board.id);
}

/**
 * Whether this person may edit someone's profile: their own always; anybody
 * else's as an admin, joined or not, except an Owner's, which only Owners
 * edit. The database adds one rule this cannot see from one workspace: a
 * person active in another workspace is only edited by somebody who runs that
 * one too (profiles_update_admin, migration 0111).
 */
export function canEditProfile(ctx: PermissionContext, target: { userId: string; isOwner: boolean }): boolean {
  if (target.userId === ctx.userId) return true;
  return isWorkspaceAdmin(ctx) && (!target.isOwner || isOwner(ctx));
}

/**
 * Whether this person may change someone's email, which is their sign-in
 * address too: an admin, on the same terms as their other details. Nobody
 * changes their own here; that is an admin's job, so a typo cannot lock
 * somebody out of their own account.
 */
export function canChangeEmail(ctx: PermissionContext, target: { userId: string; isOwner: boolean }): boolean {
  return isWorkspaceAdmin(ctx) && (!target.isOwner || isOwner(ctx));
}

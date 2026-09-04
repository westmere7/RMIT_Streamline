import type { Board, BoardMember, BoardRole, TeamMember, WorkspaceMember, WorkspaceRole } from "@/domain";

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
}

export function buildPermissionContext(input: {
  userId: string;
  workspaceMembers: readonly WorkspaceMember[];
  teamMembers: readonly TeamMember[];
  boardMembers: readonly BoardMember[];
}): PermissionContext {
  const membership = input.workspaceMembers.find((m) => m.userId === input.userId && m.status === "ACTIVE");
  return {
    userId: input.userId,
    workspaceRole: membership?.role ?? null,
    teamIds: new Set(input.teamMembers.filter((m) => m.userId === input.userId).map((m) => m.teamId)),
    boardRoles: new Map(
      input.boardMembers.filter((m) => m.userId === input.userId).map((m) => [m.boardId, m.role] as const),
    ),
  };
}

const WORKSPACE_ADMIN_ROLES: ReadonlySet<WorkspaceRole> = new Set(["OWNER", "ADMIN"]);

export function isWorkspaceAdmin(ctx: PermissionContext): boolean {
  return ctx.workspaceRole !== null && WORKSPACE_ADMIN_ROLES.has(ctx.workspaceRole);
}

export function canManageWorkspace(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

export function canManageMembers(ctx: PermissionContext): boolean {
  return isWorkspaceAdmin(ctx);
}

export function canCreateTeam(ctx: PermissionContext): boolean {
  return ctx.workspaceRole === "OWNER" || ctx.workspaceRole === "ADMIN" || ctx.workspaceRole === "MEMBER";
}

export function canManageTeam(ctx: PermissionContext, teamId: string): boolean {
  return isWorkspaceAdmin(ctx) || ctx.teamIds.has(teamId);
}

/** Trackers are workspace-wide sheets: every member except guests can edit them. */
export function canEditTrackers(ctx: PermissionContext): boolean {
  return ctx.workspaceRole !== null && ctx.workspaceRole !== "GUEST";
}

export function canCreateBoard(ctx: PermissionContext): boolean {
  return ctx.workspaceRole !== null && ctx.workspaceRole !== "GUEST";
}

/** Effective board role considering ownership, explicit membership and visibility. */
export function boardRoleFor(ctx: PermissionContext, board: Pick<Board, "id" | "ownerId" | "visibility" | "teamId">): BoardRole | null {
  if (board.ownerId === ctx.userId) return "OWNER";
  const explicit = ctx.boardRoles.get(board.id);
  if (explicit) return explicit;
  if (isWorkspaceAdmin(ctx)) return "EDITOR";
  if (ctx.workspaceRole === null) return null;

  switch (board.visibility) {
    case "WORKSPACE":
      return ctx.workspaceRole === "GUEST" ? null : "EDITOR";
    case "TEAM":
      return board.teamId && ctx.teamIds.has(board.teamId) ? "EDITOR" : null;
    case "PRIVATE":
      return null;
  }
}

export function canViewBoard(ctx: PermissionContext, board: Pick<Board, "id" | "ownerId" | "visibility" | "teamId">): boolean {
  return boardRoleFor(ctx, board) !== null;
}

export function canEditBoard(ctx: PermissionContext, board: Pick<Board, "id" | "ownerId" | "visibility" | "teamId">): boolean {
  const role = boardRoleFor(ctx, board);
  return role === "OWNER" || role === "EDITOR";
}

export function canManageBoard(ctx: PermissionContext, board: Pick<Board, "id" | "ownerId" | "visibility" | "teamId">): boolean {
  return boardRoleFor(ctx, board) === "OWNER" || isWorkspaceAdmin(ctx);
}

export function canDeleteBoard(ctx: PermissionContext, board: Pick<Board, "id" | "ownerId" | "visibility" | "teamId">): boolean {
  return board.ownerId === ctx.userId || isWorkspaceAdmin(ctx);
}

export function canEditComment(ctx: PermissionContext, comment: { authorId: string }): boolean {
  return comment.authorId === ctx.userId;
}

export function canDeleteComment(ctx: PermissionContext, comment: { authorId: string }): boolean {
  return comment.authorId === ctx.userId || isWorkspaceAdmin(ctx);
}

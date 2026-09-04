import { describe, expect, it } from "vitest";
import type { Board } from "@/domain";
import {
  boardRoleFor,
  buildPermissionContext,
  canCreateBoard,
  canCreateTeam,
  canDeleteBoard,
  canEditBoard,
  canEditComment,
  canManageMembers,
  canManageWorkspace,
  canViewBoard,
} from "@/lib/permissions/permissions";

const board = (overrides: Partial<Board> = {}): Pick<Board, "id" | "ownerId" | "visibility" | "teamId"> => ({
  id: "board-1",
  ownerId: "owner",
  visibility: "WORKSPACE",
  teamId: "team-1",
  ...overrides,
});

function ctx(input: { userId: string; role?: "OWNER" | "ADMIN" | "MEMBER" | "GUEST"; teamIds?: string[]; boardRoles?: Array<[string, "OWNER" | "EDITOR" | "VIEWER"]> }) {
  return buildPermissionContext({
    userId: input.userId,
    workspaceMembers: input.role ? [{ id: "wm", workspaceId: "ws", userId: input.userId, role: input.role, status: "ACTIVE", joinedAt: "" }] : [],
    teamMembers: (input.teamIds ?? []).map((teamId, i) => ({ id: `tm${i}`, teamId, userId: input.userId, role: "MEMBER" as const })),
    boardMembers: (input.boardRoles ?? []).map(([boardId, role], i) => ({ id: `bm${i}`, boardId, userId: input.userId, role })),
  });
}

describe("workspace permissions", () => {
  it("only owners and admins manage the workspace and members", () => {
    expect(canManageWorkspace(ctx({ userId: "u", role: "OWNER" }))).toBe(true);
    expect(canManageMembers(ctx({ userId: "u", role: "ADMIN" }))).toBe(true);
    expect(canManageWorkspace(ctx({ userId: "u", role: "MEMBER" }))).toBe(false);
    expect(canManageMembers(ctx({ userId: "u", role: "GUEST" }))).toBe(false);
  });

  it("guests cannot create boards or teams", () => {
    expect(canCreateBoard(ctx({ userId: "u", role: "GUEST" }))).toBe(false);
    expect(canCreateTeam(ctx({ userId: "u", role: "GUEST" }))).toBe(false);
    expect(canCreateBoard(ctx({ userId: "u", role: "MEMBER" }))).toBe(true);
  });

  it("non-members have no access", () => {
    expect(canViewBoard(ctx({ userId: "outsider" }), board())).toBe(false);
  });
});

describe("board permissions", () => {
  it("workspace boards are editable by members but hidden from guests without membership", () => {
    expect(boardRoleFor(ctx({ userId: "u", role: "MEMBER" }), board())).toBe("EDITOR");
    expect(canViewBoard(ctx({ userId: "u", role: "GUEST" }), board())).toBe(false);
    expect(canViewBoard(ctx({ userId: "u", role: "GUEST", boardRoles: [["board-1", "VIEWER"]] }), board())).toBe(true);
    expect(canEditBoard(ctx({ userId: "u", role: "GUEST", boardRoles: [["board-1", "VIEWER"]] }), board())).toBe(false);
  });

  it("team boards follow team membership", () => {
    const teamBoard = board({ visibility: "TEAM" });
    expect(canViewBoard(ctx({ userId: "u", role: "MEMBER" }), teamBoard)).toBe(false);
    expect(canViewBoard(ctx({ userId: "u", role: "MEMBER", teamIds: ["team-1"] }), teamBoard)).toBe(true);
    expect(canViewBoard(ctx({ userId: "u", role: "ADMIN" }), teamBoard)).toBe(true);
  });

  it("private boards are only visible to explicit members, owners and admins", () => {
    const privateBoard = board({ visibility: "PRIVATE" });
    expect(canViewBoard(ctx({ userId: "u", role: "MEMBER", teamIds: ["team-1"] }), privateBoard)).toBe(false);
    expect(canViewBoard(ctx({ userId: "u", role: "MEMBER", boardRoles: [["board-1", "VIEWER"]] }), privateBoard)).toBe(true);
    expect(canViewBoard(ctx({ userId: "owner", role: "MEMBER" }), privateBoard)).toBe(true);
    expect(canViewBoard(ctx({ userId: "u", role: "OWNER" }), privateBoard)).toBe(true);
  });

  it("only the owner or a workspace admin can delete a board", () => {
    expect(canDeleteBoard(ctx({ userId: "owner", role: "MEMBER" }), board())).toBe(true);
    expect(canDeleteBoard(ctx({ userId: "u", role: "ADMIN" }), board())).toBe(true);
    expect(canDeleteBoard(ctx({ userId: "u", role: "MEMBER", boardRoles: [["board-1", "EDITOR"]] }), board())).toBe(false);
  });

  it("comments can only be edited by their author", () => {
    expect(canEditComment(ctx({ userId: "u", role: "ADMIN" }), { authorId: "someone" })).toBe(false);
    expect(canEditComment(ctx({ userId: "u", role: "GUEST" }), { authorId: "u" })).toBe(true);
  });
});

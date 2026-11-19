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
  canEditTeamAccess,
  canSeeTeam,
  canSeeTeamId,
  canManageMembers,
  canManageTeam,
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

function ctx(input: {
  userId: string;
  role?: "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
  teamIds?: string[];
  boardRoles?: Array<[string, "OWNER" | "EDITOR" | "VIEWER"]>;
  teams?: Array<{ id: string; boardVisibility: "WORKSPACE" | "TEAM"; boardEdit: "ADDED" | "TEAM" | "VIEWERS" }>;
}) {
  return buildPermissionContext({
    userId: input.userId,
    workspaceMembers: input.role ? [{ id: "wm", workspaceId: "ws", userId: input.userId, role: input.role, status: "ACTIVE", joinedAt: "" }] : [],
    teamMembers: (input.teamIds ?? []).map((teamId, i) => ({ id: `tm${i}`, teamId, userId: input.userId, role: "MEMBER" as const })),
    boardMembers: (input.boardRoles ?? []).map(([boardId, role], i) => ({ id: `bm${i}`, boardId, userId: input.userId, role })),
    teams: input.teams,
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

  it("team members manage their team only while active in the workspace", () => {
    expect(canManageTeam(ctx({ userId: "u", role: "MEMBER", teamIds: ["team-1"] }), "team-1")).toBe(true);
    expect(canManageTeam(ctx({ userId: "u", role: "MEMBER" }), "team-1")).toBe(false);
    expect(canManageTeam(ctx({ userId: "u", role: "ADMIN" }), "team-1")).toBe(true);
    const deactivated = buildPermissionContext({
      userId: "u",
      workspaceMembers: [{ id: "wm", workspaceId: "ws", userId: "u", role: "MEMBER", status: "DEACTIVATED", joinedAt: "" }],
      teamMembers: [{ id: "tm", teamId: "team-1", userId: "u", role: "MEMBER" }],
      boardMembers: [],
    });
    expect(canManageTeam(deactivated, "team-1")).toBe(false);
  });
});

describe("board permissions", () => {
  it("workspace boards are readable by members, not editable, and hidden from guests without membership", () => {
    // A workspace-visible board is open to read and closed to edit: being in the
    // workspace is not being on the board.
    expect(boardRoleFor(ctx({ userId: "u", role: "MEMBER" }), board())).toBe("VIEWER");
    expect(canViewBoard(ctx({ userId: "u", role: "GUEST" }), board())).toBe(false);
    expect(canViewBoard(ctx({ userId: "u", role: "GUEST", boardRoles: [["board-1", "VIEWER"]] }), board())).toBe(true);
    expect(canEditBoard(ctx({ userId: "u", role: "GUEST", boardRoles: [["board-1", "VIEWER"]] }), board())).toBe(false);
    expect(canEditBoard(ctx({ userId: "u", role: "MEMBER" }), board())).toBe(false);
    // Being put on the board, or being an admin, is what opens it up.
    expect(canEditBoard(ctx({ userId: "u", role: "MEMBER", boardRoles: [["board-1", "EDITOR"]] }), board())).toBe(true);
    expect(canEditBoard(ctx({ userId: "u", role: "ADMIN" }), board())).toBe(true);
  });

  // Who can see and who can edit (migration 0123, policies/0030): the team's
  // two settings while a board follows it, else the board's own. Same cases as
  // the database rule.
  it("a team's board follows the team's see and edit settings", () => {
    type See = "WORKSPACE" | "TEAM";
    type Edit = "ADDED" | "TEAM" | "VIEWERS";
    const as = (role: "ADMIN" | "MEMBER" | "GUEST", inTeam: boolean, see: See, edit: Edit, boardOverrides: Partial<Board> = {}) =>
      boardRoleFor(ctx({ userId: "u", role, teamIds: inTeam ? ["team-1"] : [], teams: [{ id: "team-1", boardVisibility: see, boardEdit: edit }] }), board(boardOverrides));

    // Everyone sees; only added people (and admins) edit.
    expect(as("MEMBER", true, "WORKSPACE", "ADDED")).toBe("VIEWER");
    expect(as("MEMBER", false, "WORKSPACE", "ADDED")).toBe("VIEWER");
    expect(as("ADMIN", false, "WORKSPACE", "ADDED")).toBe("EDITOR");
    // The team edits.
    expect(as("MEMBER", true, "WORKSPACE", "TEAM")).toBe("EDITOR");
    expect(as("MEMBER", false, "WORKSPACE", "TEAM")).toBe("VIEWER");
    // Everyone who sees edits.
    expect(as("MEMBER", false, "WORKSPACE", "VIEWERS")).toBe("EDITOR");
    // Only the team sees.
    expect(as("MEMBER", false, "TEAM", "VIEWERS")).toBeNull();
    expect(as("MEMBER", true, "TEAM", "ADDED")).toBe("VIEWER");
    expect(as("MEMBER", true, "TEAM", "VIEWERS")).toBe("EDITOR");
    expect(as("ADMIN", false, "TEAM", "ADDED")).toBe("EDITOR");
    // Guests only where added, whatever the settings.
    expect(as("GUEST", true, "WORKSPACE", "VIEWERS")).toBeNull();
    expect(boardRoleFor(ctx({ userId: "u", role: "GUEST", boardRoles: [["board-1", "EDITOR"]] }), board())).toBe("EDITOR");
    // The board's own visibility is ignored while it follows the team.
    expect(as("MEMBER", false, "WORKSPACE", "ADDED", { visibility: "TEAM" })).toBe("VIEWER");
  });

  it("a board can set its own see and edit instead of its team's", () => {
    const team = { id: "team-1", boardVisibility: "TEAM" as const, boardEdit: "ADDED" as const };
    const own = (overrides: Partial<Board>, inTeam: boolean) =>
      boardRoleFor(ctx({ userId: "u", role: "MEMBER", teamIds: inTeam ? ["team-1"] : [], teams: [team] }), board({ followsTeam: false, ...overrides }));
    // Seen by the whole workspace though its team keeps to itself.
    expect(own({ visibility: "WORKSPACE", editScope: "ADDED" }, false)).toBe("VIEWER");
    expect(own({ visibility: "WORKSPACE", editScope: "VIEWERS" }, false)).toBe("EDITOR");
    expect(own({ visibility: "WORKSPACE", editScope: "TEAM" }, true)).toBe("EDITOR");
    // Private: only the added.
    expect(own({ visibility: "PRIVATE", editScope: "ADDED" }, true)).toBeNull();
    // A board from before the setting existed: private stays its own, the rest follow.
    expect(boardRoleFor(ctx({ userId: "u", role: "MEMBER", teamIds: ["team-1"], teams: [{ ...team, boardEdit: "TEAM" }] }), board({ visibility: "PRIVATE" }))).toBeNull();
    // No team: its own settings.
    expect(boardRoleFor(ctx({ userId: "u", role: "MEMBER" }), board({ teamId: null, visibility: "WORKSPACE", editScope: "VIEWERS" }))).toBe("EDITOR");
    expect(boardRoleFor(ctx({ userId: "u", role: "MEMBER" }), board({ teamId: null, visibility: "WORKSPACE" }))).toBe("VIEWER");
  });

  it("hides a team kept to itself from everyone outside it", () => {
    const team = { id: "team-1", boardVisibility: "TEAM" as const };
    expect(canSeeTeam(ctx({ userId: "u", role: "MEMBER" }), team)).toBe(false);
    expect(canSeeTeam(ctx({ userId: "u", role: "MEMBER", teamIds: ["team-1"] }), team)).toBe(true);
    expect(canSeeTeam(ctx({ userId: "u", role: "ADMIN" }), team)).toBe(true);
    expect(canSeeTeam(ctx({ userId: "u", role: "MEMBER" }), { id: "team-1", boardVisibility: "WORKSPACE" })).toBe(true);
    // Trackers and docs filed under it, by id.
    const outsider = ctx({ userId: "u", role: "MEMBER", teams: [{ id: "team-1", boardVisibility: "TEAM", boardEdit: "ADDED" }] });
    expect(canSeeTeamId(outsider, "team-1")).toBe(false);
    expect(canSeeTeamId(outsider, null)).toBe(true);
    // With the teams known, one missing from them is one this person may not
    // read (Supabase leaves a team kept to itself out): hidden, and its boards
    // closed unless they were added.
    const knowsOthers = ctx({ userId: "u", role: "MEMBER", teams: [{ id: "team-2", boardVisibility: "WORKSPACE", boardEdit: "ADDED" }] });
    expect(canSeeTeamId(knowsOthers, "team-1")).toBe(false);
    expect(boardRoleFor(knowsOthers, board())).toBeNull();
    expect(boardRoleFor(ctx({ userId: "u", role: "MEMBER", boardRoles: [["board-1", "VIEWER"]], teams: [] }), board())).toBe("VIEWER");
    // Only admins change it.
    expect(canEditTeamAccess(ctx({ userId: "u", role: "MEMBER", teamIds: ["team-1"] }))).toBe(false);
    expect(canEditTeamAccess(ctx({ userId: "u", role: "ADMIN" }))).toBe(true);
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

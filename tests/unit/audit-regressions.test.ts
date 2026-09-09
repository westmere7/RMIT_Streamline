import { describe, expect, it } from "vitest";
import type { BoardMember, TeamMember, User, WorkspaceMember } from "@/domain";
import { toPublicUser } from "@/domain";
import { boardRoleFor, buildPermissionContext, canDeleteBoard, canEditBoard, canViewBoard } from "@/lib/permissions/permissions";

/**
 * Regressions from the full operations audit of 9 September 2026.
 *
 * Each block names its finding and asserts the behaviour that was wrong, not
 * the shape of the fix — so a future refactor that reintroduces the defect
 * fails here rather than passing on an implementation detail.
 */

const WS = "ws-1";
const USER = "u-leaver";

function context(status: WorkspaceMember["status"], extras: { boardRole?: BoardMember["role"] } = {}) {
  const members: WorkspaceMember[] = [{ id: "m1", workspaceId: WS, userId: USER, role: "MEMBER", status, joinedAt: "2024-01-01T00:00:00.000Z" }];
  const boardMembers: BoardMember[] = extras.boardRole ? [{ id: "bm1", boardId: "b-shared", userId: USER, role: extras.boardRole }] : [];
  const teamMembers: TeamMember[] = [];
  return buildPermissionContext({ userId: USER, workspaceMembers: members, teamMembers, boardMembers });
}

const ownedBoard = { id: "b-own", ownerId: USER, visibility: "PRIVATE" as const, teamId: null };
const sharedBoard = { id: "b-shared", ownerId: "someone-else", visibility: "PRIVATE" as const, teamId: null };

describe("F-001 — deactivation reaches the boards", () => {
  it("gives an active owner their board", () => {
    const ctx = context("ACTIVE");
    expect(boardRoleFor(ctx, ownedBoard)).toBe("OWNER");
    expect(canEditBoard(ctx, ownedBoard)).toBe(true);
    expect(canDeleteBoard(ctx, ownedBoard)).toBe(true);
  });

  it("takes a deactivated member off the board they own", () => {
    // The Members screen promises deactivation stops them. Ownership used to be
    // answered before membership was checked, so a departed colleague kept full
    // OWNER on everything they had ever created.
    const ctx = context("DEACTIVATED");
    expect(boardRoleFor(ctx, ownedBoard)).toBeNull();
    expect(canViewBoard(ctx, ownedBoard)).toBe(false);
    expect(canEditBoard(ctx, ownedBoard)).toBe(false);
    expect(canDeleteBoard(ctx, ownedBoard)).toBe(false);
  });

  it("takes away an explicit seat too", () => {
    expect(boardRoleFor(context("ACTIVE", { boardRole: "EDITOR" }), sharedBoard)).toBe("EDITOR");
    expect(boardRoleFor(context("DEACTIVATED", { boardRole: "EDITOR" }), sharedBoard)).toBeNull();
  });

  it("treats somebody still invited the same way", () => {
    // An invitation that has not been accepted is not membership either.
    expect(boardRoleFor(context("INVITED"), ownedBoard)).toBeNull();
  });

  it("leaves an active member's ordinary access alone", () => {
    // The fix must not cost anybody their board: visibility still reads.
    const ctx = context("ACTIVE");
    expect(boardRoleFor(ctx, { id: "b-open", ownerId: "other", visibility: "WORKSPACE", teamId: null })).toBe("VIEWER");
    expect(boardRoleFor(ctx, { id: "b-private", ownerId: "other", visibility: "PRIVATE", teamId: null })).toBeNull();
  });
});

describe("F-003 — a public link names a person and nothing else", () => {
  const full: User = {
    id: "u1",
    email: "priya@rmit.edu.vn",
    firstName: "Priya",
    lastName: "Nair",
    displayName: "Priya Nair",
    avatarUrl: "https://example.test/a.webp",
    jobTitle: "Senior Designer",
    department: "Brand",
    timezone: "Asia/Ho_Chi_Minh",
    stakeholderGroup: "Comm.",
    workHoursStart: "09:00",
    workHoursEnd: "17:30",
    deactivatedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("publishes the name and the face, and nothing about the person", () => {
    const shown = toPublicUser(full);
    expect(shown.displayName).toBe("Priya Nair");
    expect(shown.avatarUrl).toBe("https://example.test/a.webp");
    expect(shown.id).toBe("u1");
  });

  it("keeps the staff directory out of it", () => {
    const shown = toPublicUser(full);
    // Every one of these went out on an anonymous board link.
    expect(shown.email).toBe("");
    expect(shown.jobTitle).toBeNull();
    expect(shown.department).toBeNull();
    expect(shown.stakeholderGroup).toBeNull();
    expect(shown.workHoursStart).toBeNull();
    expect(shown.workHoursEnd).toBeNull();
    expect(shown.timezone).toBe("");
    // Working hours and a timezone tell a stranger when somebody is at a desk.
    expect(JSON.stringify(shown)).not.toContain("17:30");
    expect(JSON.stringify(shown)).not.toContain("Asia/Ho_Chi_Minh");
    expect(JSON.stringify(shown)).not.toContain("Senior Designer");
  });

  it("is an allowlist, so a new field on User cannot join by accident", () => {
    const withNewField = { ...full, homeAddress: "12 Nguyen Hue" } as unknown as User;
    const shown = toPublicUser(withNewField);
    expect(Object.keys(shown).sort()).toEqual(
      ["avatarUrl", "createdAt", "deactivatedAt", "department", "displayName", "email", "firstName", "id", "jobTitle", "lastName", "stakeholderGroup", "timezone", "updatedAt", "workHoursEnd", "workHoursStart"].sort(),
    );
    expect(JSON.stringify(shown)).not.toContain("Nguyen Hue");
  });
});

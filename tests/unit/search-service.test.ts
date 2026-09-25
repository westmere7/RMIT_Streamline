import { describe, expect, it } from "vitest";
import type { Board, Item, Team, User, WorkspaceMember } from "@/domain";
import type { Repositories } from "@/data/repositories";
import { SearchService } from "@/services/search-service";

const WORKSPACE = "ws-1";

const board: Board = {
  id: "b1",
  workspaceId: WORKSPACE,
  teamId: null,
  name: "Semester 1 Campaign",
  slug: "semester-1-campaign",
  description: null,
  icon: "square-kanban",
  color: "blue",
  type: "MAIN",
  visibility: "WORKSPACE",
  ownerId: "u1",
  archivedAt: null,
  createdAt: "",
  updatedAt: "",
};

function item(id: string, name: string, ticket: string | null): Item {
  return { id, boardId: board.id, groupId: "g1", parentItemId: null, name, description: null, position: 0, createdBy: "u1", archivedAt: null, ticket, createdAt: "", updatedAt: "" };
}

const items = [item("i1", "Radio script – 30s", "TA-7441"), item("i2", "Poster artwork", "TA-9002"), item("i3", "Nothing booked", null), item("i4", "Upgrade the kiosk", null), item("i5", "Graduation day", null), item("i6", "Lễ tốt nghiệp – Đà Nẵng", null)];

/** Only the four reads SearchService makes; everything else would be unused. */
function repos(): Repositories {
  return {
    boards: { listByWorkspace: async () => [board] },
    teams: { listByWorkspace: async () => [] as Team[] },
    users: { list: async () => [] as User[] },
    workspaces: { listMembers: async () => [] as WorkspaceMember[] },
    items: { listByBoard: async () => items },
  } as unknown as Repositories;
}

describe("SearchService", () => {
  const search = (query: string) => new SearchService(repos()).search(WORKSPACE, query);

  it("finds an item by name", async () => {
    expect((await search("radio")).items.map((r) => r.item.id)).toEqual(["i1"]);
  });

  it("finds an item by its booking code, however it is typed", async () => {
    for (const query of ["TA-7441", "ta-7441", "ta7441", "7441"]) {
      expect((await search(query)).items.map((r) => r.item.id)).toEqual(["i1"]);
    }
  });

  it("does not match a code that belongs to nothing", async () => {
    expect((await search("TA-0000")).items).toEqual([]);
  });

  it("finds a task from the start of a word, and ranks the better match first", async () => {
    // "Upgrade" contains "grad" too, but "Graduation" starts with it.
    expect((await search("Grad")).items.map((r) => r.item.id)).toEqual(["i5", "i4"]);
  });

  it("matches every word typed, in any order", async () => {
    expect((await search("day grad")).items.map((r) => r.item.id)).toEqual(["i5"]);
    expect((await search("grad night")).items).toEqual([]);
  });

  it("ignores accents, so a Vietnamese name is found as it is typed on any keyboard", async () => {
    expect((await search("da nang")).items.map((r) => r.item.id)).toEqual(["i6"]);
    expect((await search("tot nghiep")).items.map((r) => r.item.id)).toEqual(["i6"]);
  });

  it("searches one board when asked, whatever the other boards hold", async () => {
    const service = new SearchService(repos());
    expect((await service.search(WORKSPACE, "grad", { boardId: "elsewhere" })).items).toEqual([]);
    expect((await service.search(WORKSPACE, "grad", { boardId: board.id })).items.map((r) => r.item.id)).toEqual(["i5", "i4"]);
  });

  it("finds people who have not onboarded yet, but not deactivated ones", async () => {
    const person = (id: string, first: string, last: string, deactivatedAt: string | null = null): User =>
      ({ id, email: `${first.toLowerCase()}@rmit.local`, firstName: first, lastName: last, displayName: `${first} ${last}`, avatarUrl: null, jobTitle: null, department: null, timezone: "UTC", deactivatedAt, createdAt: "", updatedAt: "" }) as User;
    const member = (userId: string, status: WorkspaceMember["status"]) => ({ workspaceId: WORKSPACE, userId, role: "MEMBER", status }) as WorkspaceMember;
    const people = [person("u-active", "Linh", "Vo"), person("u-pending", "Linh", "Tran"), person("u-gone", "Linh", "Nguyen", "2026-01-01"), person("u-stranger", "Linh", "Outside")];
    const members = [member("u-active", "ACTIVE"), member("u-pending", "INVITED"), member("u-gone", "DEACTIVATED")];
    const service = new SearchService({ ...repos(), users: { list: async () => people }, workspaces: { listMembers: async () => members } } as unknown as Repositories);
    expect((await service.search(WORKSPACE, "linh")).users.map((u) => u.id).sort()).toEqual(["u-active", "u-pending"]);
  });
});

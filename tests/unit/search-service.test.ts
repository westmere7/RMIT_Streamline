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

function item(id: string, name: string, reference: string | null): Item {
  return { id, boardId: board.id, groupId: "g1", parentItemId: null, name, description: null, position: 0, createdBy: "u1", archivedAt: null, reference, createdAt: "", updatedAt: "" };
}

const items = [item("i1", "Radio script – 30s", "TA-7441"), item("i2", "Poster artwork", "TA-9002"), item("i3", "Nothing booked", null)];

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
});

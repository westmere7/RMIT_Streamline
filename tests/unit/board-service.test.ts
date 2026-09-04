import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { BOARD_TEMPLATES } from "@/features/boards/templates";
import { createServices } from "@/services";

let counter = 0;

describe("BoardService", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `board-service-${Date.now()}-${counter}` }));
  });

  it("creates a board from the Creative Production template with groups and columns", async () => {
    const { board, groups, columns } = await services.boards.createBoard(
      { workspaceId: SEED_WORKSPACE_ID, name: "Open Day 2026", teamId: SEED_TEAM_IDS.campaigns, visibility: "TEAM", templateId: "creative-production" },
      SEED_USER_IDS.danh,
    );
    expect(board.slug).toBe("open-day-2026");
    expect(board.ownerId).toBe(SEED_USER_IDS.danh);
    expect(groups.map((g) => g.name)).toEqual(BOARD_TEMPLATES["creative-production"].groups.map((g) => g.name));
    expect(columns.map((c) => c.type)).toEqual(BOARD_TEMPLATES["creative-production"].columns.map((c) => c.type));
    expect(columns.find((c) => c.type === "STATUS")?.settings.kind).toBe("status");
    const members = await services.repos.boards.listMembers(board.id);
    expect(members).toEqual([expect.objectContaining({ userId: SEED_USER_IDS.danh, role: "OWNER" })]);
  });

  it("creates blank boards and de-duplicates slugs", async () => {
    const first = await services.boards.createBoard({ workspaceId: SEED_WORKSPACE_ID, name: "Brief", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, SEED_USER_IDS.emily);
    const second = await services.boards.createBoard({ workspaceId: SEED_WORKSPACE_ID, name: "Brief", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, SEED_USER_IDS.emily);
    expect(first.board.slug).toBe("brief");
    expect(second.board.slug).toBe("brief-2");
    expect(first.groups).toHaveLength(1);
    expect(first.columns.map((c) => c.name)).toEqual(["Owner", "Status", "Due Date"]);
  });

  it("marks private boards with the PRIVATE type", async () => {
    const { board } = await services.boards.createBoard({ workspaceId: SEED_WORKSPACE_ID, name: "Secret", teamId: null, visibility: "PRIVATE", templateId: "campaign" }, SEED_USER_IDS.danh);
    expect(board.type).toBe("PRIVATE");
  });

  it("duplicates a board with its items and values", async () => {
    const copy = await services.boards.duplicateBoard(SEED_BOARD_IDS.rmitinerary, SEED_USER_IDS.danh);
    expect(copy.name).toBe("RMITinerary 2026 (copy)");
    const source = await services.items.loadBoardSnapshot(SEED_BOARD_IDS.rmitinerary);
    const duplicate = await services.items.loadBoardSnapshot(copy.id);
    expect(duplicate.items).toHaveLength(source.items.length);
    expect(duplicate.groups).toHaveLength(source.groups.length);
    expect(duplicate.values).toHaveLength(source.values.length);
    // Subitems keep pointing at the copied parent.
    const sub = duplicate.items.find((i) => i.parentItemId !== null)!;
    expect(duplicate.items.some((i) => i.id === sub.parentItemId)).toBe(true);
  });

  it("renames a board and refreshes its slug", async () => {
    const updated = await services.boards.updateBoard(SEED_BOARD_IDS.dooh, { name: "DOOH Production 2027" }, SEED_USER_IDS.duc);
    expect(updated.slug).toBe("dooh-production-2027");
    const activity = await services.repos.activities.listByBoard(SEED_BOARD_IDS.dooh, 5);
    expect(activity[0]?.eventType).toBe("BOARD_RENAMED");
  });

  it("creates, moves and duplicates items with correct positions", async () => {
    const boardId = SEED_BOARD_IDS.sem1;
    const snapshot = await services.items.loadBoardSnapshot(boardId);
    const planning = snapshot.groups.find((g) => g.name === "Planning")!;
    const live = snapshot.groups.find((g) => g.name === "Live")!;
    const created = await services.items.createItem({ boardId, groupId: planning.id, name: "Media brief" }, SEED_USER_IDS.joanne);
    const planningItems = (await services.repos.items.listByBoard(boardId)).filter((i) => i.groupId === planning.id && !i.parentItemId);
    expect(planningItems[planningItems.length - 1]?.id).toBe(created.id);
    // Default status applied.
    const status = snapshot.columns.find((c) => c.type === "STATUS")!;
    const values = await services.repos.items.listValuesByItem(created.id);
    expect(values.find((v) => v.columnId === status.id)?.value).toEqual({ type: "STATUS", labelId: "not_started" });

    const liveIds = (await services.repos.items.listByBoard(boardId)).filter((i) => i.groupId === live.id && !i.parentItemId).map((i) => i.id);
    await services.items.moveItem(
      { boardId, itemId: created.id, toGroupId: live.id, orderedIdsInTargetGroup: [created.id, ...liveIds], orderedIdsInSourceGroup: planningItems.filter((i) => i.id !== created.id).map((i) => i.id) },
      SEED_USER_IDS.joanne,
    );
    const moved = await services.items.getItem(created.id);
    expect(moved.groupId).toBe(live.id);
    expect(moved.position).toBe(0);

    const copy = await services.items.duplicateItem(created.id, SEED_USER_IDS.joanne);
    expect(copy.name).toBe("Media brief (copy)");
    expect(copy.position).toBe(1);
  });
});

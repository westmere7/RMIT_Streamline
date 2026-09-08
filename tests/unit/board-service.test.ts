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
      { workspaceId: SEED_WORKSPACE_ID, name: "Open Day 2027", teamId: SEED_TEAM_IDS.campaigns, visibility: "TEAM", templateId: "creative-production" },
      SEED_USER_IDS.danh,
    );
    expect(board.slug).toBe("open-day-2027");
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

  it("stores a column width as whole pixels, however the drag measured it", async () => {
    // A pointer on a scaled display reports fractions; the width column is an
    // integer, and Postgres refuses "256.2667236328125" outright.
    const { columns } = await services.boards.createBoard({ workspaceId: SEED_WORKSPACE_ID, name: "Widths", teamId: null, visibility: "WORKSPACE", templateId: "blank" }, SEED_USER_IDS.danh);
    const column = columns[0]!;
    const wider = await services.boards.updateColumn(column.id, { width: 256.2667236328125 });
    expect(wider.width).toBe(256);
    expect(Number.isInteger(wider.width)).toBe(true);
    const narrower = await services.boards.updateColumn(column.id, { width: 120.5 });
    expect(narrower.width).toBe(121);
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

  it("keeps a status set while the item was still being created", async () => {
    // The row shows optimistically before the create request settles, so the
    // status can be changed before the default status is written. Seen on the
    // deployed build: the default arrived last and undid the change.
    const boardId = SEED_BOARD_IDS.sem1;
    const snapshot = await services.items.loadBoardSnapshot(boardId);
    const planning = snapshot.groups.find((g) => g.name === "Planning")!;
    const status = snapshot.columns.find((c) => c.type === "STATUS")!;
    const id = "11111111-2222-4333-8444-555555555555";
    await services.repos.items.setValue(id, status.id, { type: "STATUS", labelId: "working" });
    await services.items.createItem({ id, boardId, groupId: planning.id, name: "Quick status" }, SEED_USER_IDS.joanne);
    const values = await services.repos.items.listValuesByItem(id);
    expect(values.filter((v) => v.columnId === status.id)).toHaveLength(1);
    expect(values.find((v) => v.columnId === status.id)?.value).toEqual({ type: "STATUS", labelId: "working" });
  });
});

describe("deleting a team", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `team-delete-${Date.now()}-${counter}` }));
  });

  it("leaves the boards behind by default, and takes them when asked", async () => {
    const teamId = SEED_TEAM_IDS.campaigns;
    const before = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => b.teamId === teamId);
    expect(before.length).toBeGreaterThan(0);

    const result = await services.workspace.deleteTeam(teamId);
    expect(result).toEqual({ deletedBoards: 0, deletedTrackers: 0 });
    expect(await services.repos.teams.getById(teamId)).toBeNull();
    const after = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    expect(after.filter((b) => before.some((x) => x.id === b.id)).every((b) => b.teamId === null)).toBe(true);

    // The other team goes with everything filed under it.
    const otherId = SEED_TEAM_IDS.vietnam;
    const theirBoards = (await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => b.teamId === otherId);
    const theirItems = (await Promise.all(theirBoards.map((b) => services.repos.items.listByBoard(b.id)))).flat();
    expect(theirBoards.length).toBeGreaterThan(0);
    expect(theirItems.length).toBeGreaterThan(0);

    const taken = await services.workspace.deleteTeam(otherId, { deleteBoards: true });
    expect(taken.deletedBoards).toBe(theirBoards.length);
    const left = await services.repos.boards.listByWorkspace(SEED_WORKSPACE_ID);
    expect(left.some((b) => theirBoards.some((x) => x.id === b.id))).toBe(false);
    expect(await services.repos.items.listByBoard(theirBoards[0]!.id)).toEqual([]);
    // Emptying a team of five boards and their months of history is a lot of
    // writes; the browser shows a spinner while it runs.
  }, 30_000);

  it("refuses to delete a built-in team", async () => {
    const { team } = await services.workspace.ensureSystemEntities(SEED_WORKSPACE_ID, SEED_USER_IDS.danh);
    await expect(services.workspace.deleteTeam(team.id, { deleteBoards: true })).rejects.toThrow(/built in/);
    expect(await services.repos.teams.getById(team.id)).not.toBeNull();
  });
});

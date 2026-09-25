import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_BOARD_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { DEFAULT_TEMPLATE_PARTS, TEMPLATE_PARTS, defaultSettingsFor, normaliseTemplateParts } from "@/domain";
import { createServices, type Services } from "@/services";

let counter = 0;
const SOURCE = SEED_BOARD_IDS.rmitinerary;
const DANH = SEED_USER_IDS.danh;

describe("board templates", () => {
  let services: Services;

  beforeEach(async () => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `board-templates-${Date.now()}-${counter}` }));
    await services.repos.admin.resetToSeed();
  });

  const newBoard = (templateId: string, name: string) =>
    services.boardTemplates.createBoard(templateId, { workspaceId: SEED_WORKSPACE_ID, name, teamId: null, visibility: "WORKSPACE" }, DANH);

  it("lays a new board out like the one it was saved from, with everything asked for", async () => {
    const [group] = await services.repos.boards.listGroups(SOURCE);
    const status = (await services.repos.boards.listColumns(SOURCE)).find((c) => c.type === "STATUS")!;
    await services.repos.automations.createRule({
      workspaceId: SEED_WORKSPACE_ID,
      boardId: SOURCE,
      name: "Done moves to the first group",
      enabled: true,
      trigger: { kind: "column_set_to", columnId: status.id, value: { type: "STATUS", labelId: "done" } } as never,
      conditionMatch: "all",
      conditions: [],
      actions: [{ kind: "move_to_group", groupId: group!.id }] as never,
      createdBy: DANH,
    });

    const saved = await services.boardTemplates.saveFromBoard(SOURCE, { name: "Itinerary layout", description: "For a trip", parts: TEMPLATE_PARTS }, DANH);
    expect(saved.spec.parts).toEqual([...TEMPLATE_PARTS]);

    const { board, groups, columns } = await newBoard(saved.id, "Next year's itinerary");
    const sourceGroups = (await services.repos.boards.listGroups(SOURCE)).sort((a, b) => a.position - b.position);
    const sourceColumns = (await services.repos.boards.listColumns(SOURCE)).sort((a, b) => a.position - b.position);
    expect(groups.map((g) => [g.name, g.color])).toEqual(sourceGroups.map((g) => [g.name, g.color]));
    const made = (await services.repos.boards.listColumns(board.id)).sort((a, b) => a.position - b.position);
    expect(made.map((c) => [c.name, c.type, c.width, c.hidden, c.role ?? null])).toEqual(sourceColumns.map((c) => [c.name, c.type, c.width, c.hidden, c.role ?? null]));
    expect(made.find((c) => c.type === "STATUS")!.settings).toEqual(status.settings);
    expect(columns.length).toBe(made.length);

    // The rule points at the new board's own status column and group, not the old ones.
    const [rule] = await services.repos.automations.listRulesByBoard(board.id);
    const newStatus = made.find((c) => c.type === "STATUS")!;
    expect(JSON.stringify(rule!.trigger)).toContain(newStatus.id);
    expect(JSON.stringify(rule!.actions)).toContain(groups[0]!.id);
    expect(JSON.stringify(rule)).not.toContain(status.id);

    // Task names in their groups, with subitems, and nothing that was in them.
    const sourceTasks = (await services.repos.items.listByBoard(SOURCE)).filter((i) => i.parentItemId === null && !i.archivedAt);
    const newTasks = await services.repos.items.listByBoard(board.id);
    expect(newTasks.filter((i) => i.parentItemId === null).map((i) => i.name).sort()).toEqual(sourceTasks.map((i) => i.name).sort());
    const values = await services.repos.items.listValuesByBoard(board.id);
    expect(values.every((v) => v.value.type === "STATUS")).toBe(true);
    expect(newTasks.every((i) => i.ticket === null)).toBe(true);
  });

  it("saves only what was ticked: no groups means one plain group, no settings means default labels", async () => {
    const saved = await services.boardTemplates.saveFromBoard(SOURCE, { name: "Bare", parts: [] }, DANH);
    expect(saved.spec.groups).toEqual([]);
    expect(saved.spec.tasks).toEqual([]);
    expect(saved.spec.board).toBeNull();
    const { board, groups } = await newBoard(saved.id, "Bare board");
    expect(groups.map((g) => g.name)).toEqual(["Group 1"]);
    const status = (await services.repos.boards.listColumns(board.id)).find((c) => c.type === "STATUS")!;
    expect(status.settings).toEqual(defaultSettingsFor("STATUS"));
    expect(await services.repos.items.listByBoard(board.id)).toEqual([]);
  });

  it("keeps automations only alongside the groups and labels they point at", () => {
    expect(normaliseTemplateParts(["automations"])).toEqual([]);
    expect(normaliseTemplateParts(["automations", "groups", "columnSettings"])).toEqual(["groups", "columnSettings", "automations"]);
    expect(DEFAULT_TEMPLATE_PARTS).not.toContain("tasks");
  });

  it("saves over a template of the same name, and deletes", async () => {
    const first = await services.boardTemplates.saveFromBoard(SOURCE, { name: "Layout", parts: ["groups"] }, DANH);
    const again = await services.boardTemplates.saveFromBoard(SOURCE, { name: " layout ", parts: ["groups", "tasks"] }, DANH);
    expect(again.id).toBe(first.id);
    expect(again.spec.parts).toEqual(["groups", "tasks"]);
    expect(await services.boardTemplates.list(SEED_WORKSPACE_ID)).toHaveLength(1);
    await services.boardTemplates.delete(first.id);
    expect(await services.boardTemplates.list(SEED_WORKSPACE_ID)).toHaveLength(0);
  });
});

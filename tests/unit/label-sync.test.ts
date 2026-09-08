import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import type { ColumnSettings, StatusColumnSettings } from "@/domain";
import { createServices } from "@/services";
import { syncLabelDefinitions } from "@/services/item-link-sync";

const status = (labels: Array<[string, string, string]>, roles: Partial<Pick<StatusColumnSettings, "doneLabelIds" | "stuckLabelIds" | "progressLabelIds">> = {}): StatusColumnSettings => ({
  kind: "status",
  labels: labels.map(([id, name, color]) => ({ id, name, color: color as never })),
  doneLabelIds: [],
  defaultLabelId: null,
  ...roles,
});

let n = 0;
const nextId = () => `new-${++n}`;

describe("label definitions follow links", () => {
  it("renames the paired label by its old name, and carries colour and meaning", () => {
    const before = status([["a", "Not Started", "gray"], ["b", "Working On It", "orange"], ["c", "Done", "green"]], { doneLabelIds: ["c"], progressLabelIds: ["b"] });
    const after = status([["a", "Not Started", "gray"], ["b", "In Progress", "blue"], ["c", "Done", "green"]], { doneLabelIds: ["c"], progressLabelIds: ["b"] });
    const target = status([["x", "Working On It", "orange"], ["y", "Done", "green"], ["z", "Not Started", "gray"]], { doneLabelIds: ["y"] });
    const next = syncLabelDefinitions(before, after, target, nextId) as StatusColumnSettings;
    expect(next.labels).toEqual([
      { id: "x", name: "In Progress", color: "blue" },
      { id: "y", name: "Done", color: "green" },
      { id: "z", name: "Not Started", color: "gray" },
    ]);
    expect(next.progressLabelIds).toEqual(["x"]);
    expect(next.doneLabelIds).toEqual(["y"]);
  });

  it("adds a new label on the other board but never removes one", () => {
    const before = status([["a", "Open", "gray"]]);
    const after = status([["a", "Open", "gray"], ["b", "Blocked", "red"]], { stuckLabelIds: ["b"] });
    const target = status([["x", "Open", "gray"], ["y", "Archived", "gray"]]);
    const next = syncLabelDefinitions(before, after, target, nextId) as StatusColumnSettings;
    expect(next.labels.map((l) => l.name)).toEqual(["Open", "Archived", "Blocked"]);
    expect(next.stuckLabelIds).toEqual([next.labels[2]!.id]);

    const removed = status([["a", "Open", "gray"]]);
    expect(syncLabelDefinitions(after, removed, next, nextId)).toBeNull();
  });

  it("does nothing across different kinds, when nothing changed, or when a rename would collide", () => {
    const s = status([["a", "Open", "gray"]]);
    expect(syncLabelDefinitions(s, s, s, nextId)).toBeNull();
    const priority: ColumnSettings = { kind: "priority", labels: [{ id: "p", name: "High", color: "orange" }] };
    expect(syncLabelDefinitions(s, s, priority, nextId)).toBeNull();
    // Renaming "Open" to "Done" where the target already has a "Done": leave the target alone.
    const renamed = status([["a", "Done", "gray"]]);
    const target = status([["x", "Open", "gray"], ["y", "Done", "green"]]);
    expect(syncLabelDefinitions(s, renamed, target, nextId)).toBeNull();
  });
});

describe("through the services", () => {
  let services: ReturnType<typeof createServices>;
  beforeEach(() => {
    services = createServices(createLocalRepositories({ databaseName: `label-sync-${Date.now()}-${Math.random()}` }));
  });

  it("editing status labels on one board updates the paired status column on a linked board", async () => {
    const boards = await services.boards.listBoards(SEED_WORKSPACE_ID);
    const a = boards.find((b) => b.slug === "rmitinerary-2026")!;
    const b = boards.find((b) => b.slug === "open-day-2026")!;
    const [itemsA, itemsB] = await Promise.all([services.repos.items.listByBoard(a.id), services.repos.items.listByBoard(b.id)]);
    await services.links.link(itemsA[0]!.id, itemsB[0]!.id, SEED_USER_IDS.danh);

    const columnsA = await services.repos.boards.listColumns(a.id);
    const statusA = columnsA.find((c) => c.type === "STATUS")!;
    const settings = statusA.settings as StatusColumnSettings;
    const working = settings.labels.find((l) => l.name === "In Progress")!;
    const edited: StatusColumnSettings = {
      ...settings,
      labels: settings.labels.map((l) => (l.id === working.id ? { ...l, name: "Underway", color: "blue" as const } : l)).concat([{ id: "qa", name: "In QA", color: "rose" as const }]),
    };
    await services.boards.updateColumn(statusA.id, { settings: edited });

    const statusB = (await services.repos.boards.listColumns(b.id)).find((c) => c.type === "STATUS")!;
    const namesB = (statusB.settings as StatusColumnSettings).labels.map((l) => l.name);
    expect(namesB).toContain("Underway");
    expect(namesB).not.toContain("In Progress");
    expect(namesB).toContain("In QA");
  });
});

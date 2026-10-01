import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnValue, Item, PortalTask, User } from "@/domain";
import { normalizePortalColumnLayout, portalColumnCandidates, portalColumnKeyFor, resolvePortalColumnLayout } from "@/domain";
import { buildPortalBoard } from "@/services/portal/portal-board";
import { projectPortalExtras } from "@/services/portal/portal-extra-columns";
import type { BoardContext } from "@/services/portal/portal-projection";

const col = (boardId: string, id: string, name: string, type: BoardColumn["type"], settings: BoardColumn["settings"] = { kind: "none" }): BoardColumn => ({ id, boardId, name, type, settings, position: 0, width: 140, hidden: false, createdAt: "" });

describe("portal column layout", () => {
  const columns = [
    col("a", "a-status", "Stage", "STATUS"),
    col("a", "a-size", "Effort", "SIZE"),
    col("a", "a-format", "Format", "DROPDOWN"),
    col("b", "b-size", "T-shirt", "SIZE"),
    col("b", "b-format", "format ", "DROPDOWN"),
    col("b", "b-dep", "Waits on", "DEPENDENCY"),
    col("b", "b-assets", "Asset type", "TAGS"),
    { ...col("b", "b-gone", "Old", "TEXT"), removed: true },
  ];

  it("offers the built-ins, then each board column once: specials by type, the rest by name and type", () => {
    const candidates = portalColumnCandidates(columns);
    const extras = candidates.filter((c) => !c.builtIn);
    expect(extras.map((c) => [c.key, c.name, c.special])).toEqual([
      ["type:SIZE", "Size", true],
      ["col:DROPDOWN:format", "Format", false],
    ]);
    expect(candidates.find((c) => c.key === "status")).toMatchObject({ builtIn: true, required: true });
    // Dependencies never travel; the asset-type tags are the Asset type built-in already.
    expect(portalColumnKeyFor({ type: "DEPENDENCY", name: "x" })).toBeNull();
    expect(portalColumnKeyFor({ type: "TAGS", name: "Asset type" })).toBeNull();
  });

  it("reads as before until saved, keeps the saved order, and adds new columns hidden at the end", () => {
    const candidates = portalColumnCandidates(columns);
    const fresh = resolvePortalColumnLayout(null, ["priority"], candidates);
    expect(fresh.find((e) => e.key === "priority")?.hidden).toBe(true);
    expect(fresh.find((e) => e.key === "due")?.hidden).toBe(false);
    expect(fresh.find((e) => e.key === "type:SIZE")?.hidden).toBe(true);

    const saved = resolvePortalColumnLayout([{ key: "type:SIZE", hidden: false }, { key: "status", hidden: true }, { key: "gone", hidden: false }], [], candidates);
    expect(saved.slice(0, 2)).toEqual([
      { key: "type:SIZE", hidden: false },
      // Status can move but not be hidden.
      { key: "status", hidden: false },
    ]);
    expect(saved.some((e) => e.key === "gone")).toBe(false);
    expect(normalizePortalColumnLayout([{ key: "a", hidden: true }, { key: "a" }, 3, { hidden: true }])).toEqual([{ key: "a", hidden: true }]);
  });

  it("carries only switched-on board columns, merging dropdown labels by their words", () => {
    const a = col("a", "a-format", "Format", "DROPDOWN", { kind: "dropdown", labels: [{ id: "x1", name: "Reel", color: "pink" }], defaultLabelId: null });
    const b = col("b", "b-format", "Format", "DROPDOWN", { kind: "dropdown", labels: [{ id: "y9", name: "reel", color: "blue" }, { id: "y2", name: "Story", color: "teal" }], defaultLabelId: null });
    const people = col("b", "b-people", "Reviewer", "PEOPLE", { kind: "person", allowMultiple: true });
    const value = (v: ColumnValue) => v;
    const boards = new Map<string, BoardContext>([
      ["a", { board: { id: "a" } as never, columns: [a], values: new Map([["i1", new Map([["a-format", value({ type: "DROPDOWN", labelId: "x1" })]])]]) }],
      ["b", { board: { id: "b" } as never, columns: [b, people], values: new Map([["i2", new Map<string, ColumnValue>([["b-format", { type: "DROPDOWN", labelId: "y9" }], ["b-people", { type: "PEOPLE", userIds: ["u1", "stranger"] }]])]]) }],
    ]);
    const items = [{ id: "i1", boardId: "a" }, { id: "i2", boardId: "b" }] as Item[];
    const users = new Map([["u1", { id: "u1", displayName: "Linh Vo", firstName: "Linh", lastName: "Vo" } as User]]);

    const off = projectPortalExtras([{ key: "col:DROPDOWN:format", hidden: true }], boards, items, users);
    expect(off.columns).toHaveLength(0);

    const on = projectPortalExtras([{ key: "col:DROPDOWN:format", hidden: false }, { key: "col:PEOPLE:reviewer", hidden: false }], boards, items, users);
    const format = on.columns.find((c) => c.key === "col:DROPDOWN:format")!;
    expect(format.settings.kind === "dropdown" && format.settings.labels.map((l) => l.name)).toEqual(["Reel", "Story"]);
    // Both boards' "Reel" are one label on the portal.
    expect(on.values.get("i1")!.get("col:DROPDOWN:format")).toEqual(on.values.get("i2")!.get("col:DROPDOWN:format"));
    // People are published only where they are known, by name.
    expect(on.values.get("i2")!.get("col:PEOPLE:reviewer")).toEqual({ type: "PEOPLE", userIds: ["u1"] });
    expect(on.people.map((p) => p.displayName)).toEqual(["Linh Vo"]);

    // And the board follows the layout's order, with the carried column in it.
    const task = { id: "i2", ticket: null, name: "T", status: null, priority: null, dueDate: null, timeline: null, people: [], sourceName: "B", assetTypes: [], deliverables: { total: 0, done: 0 }, subitems: { total: 0, done: 0 }, stakeholder: null, linkedCount: 0, awaitingAllocation: false, bookedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" } satisfies PortalTask;
    const payload = buildPortalBoard({
      portalId: "p",
      workspaceId: "w",
      layout: [{ key: "col:DROPDOWN:format", hidden: false }, { key: "status", hidden: false }, { key: "priority", hidden: true }, { key: "requested", hidden: false }],
      extras: on,
      tasks: [{ task, brief: null, deliverables: [], subitems: [] }],
      links: [],
      comments: [],
      commentAuthors: [],
      workspaceName: "W",
      now: "2026-09-09T00:00:00.000Z",
    });
    const names = payload.columns.map((c) => c.name);
    expect(names.slice(0, 3)).toEqual(["Format", "Status", "Requested"]);
    expect(names).not.toContain("Priority");
    expect(payload.users.map((u) => u.displayName)).toContain("Linh Vo");
  });
});

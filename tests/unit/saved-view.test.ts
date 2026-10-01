import { describe, expect, it } from "vitest";
import { cleanViewName, normaliseViewConfig, sameViewConfig, type SavedViewConfig } from "@/domain";

const base: SavedViewConfig = {
  view: "table",
  search: "",
  filters: { personIds: ["u1", "u2"], statusIds: [], priorityIds: [], groupIds: [], tags: ["Print"], date: null },
  sort: { field: "dueDate", direction: "asc" },
  hiddenColumnIds: ["c1", "c2"],
  settings: { kanban: { laneBy: "status" } },
};

describe("saved view configs", () => {
  it("reads a partial or foreign row back whole", () => {
    const config = normaliseViewConfig({ view: "nonsense", filters: { personIds: ["u1", 3], date: "someday" }, sort: { field: "name" }, settings: { kanban: { laneBy: "group" }, bogus: {} } });
    expect(config.view).toBe("table");
    expect(config.filters).toEqual({ personIds: ["u1"], statusIds: [], priorityIds: [], groupIds: [], tags: [], date: null });
    expect(config.sort).toEqual({ field: "name", direction: "asc" });
    expect(config.settings).toEqual({ kanban: { laneBy: "group" } });
    expect(config.hiddenColumnIds).toEqual([]);
  });

  it("compares id lists as sets and tags without case", () => {
    const reordered = { ...base, filters: { ...base.filters, personIds: ["u2", "u1"], tags: ["print"] }, hiddenColumnIds: ["c2", "c1"] };
    expect(sameViewConfig(base, reordered)).toBe(true);
  });

  it("notices a change to the view, a filter, the sort or the hidden columns", () => {
    expect(sameViewConfig(base, { ...base, view: "kanban" })).toBe(false);
    expect(sameViewConfig(base, { ...base, filters: { ...base.filters, date: "overdue" } })).toBe(false);
    expect(sameViewConfig(base, { ...base, sort: { field: "dueDate", direction: "desc" } })).toBe(false);
    expect(sameViewConfig(base, { ...base, hiddenColumnIds: ["c1"] })).toBe(false);
    expect(sameViewConfig(base, { ...base, search: "poster" })).toBe(false);
  });

  it("reads a setting never saved as its default rather than as a change", () => {
    const touched = { ...base, settings: { kanban: { laneBy: "status", tintLanes: true } } };
    expect(sameViewConfig(base, touched)).toBe(false);
    expect(sameViewConfig(base, touched, { kanban: { laneBy: "status", tintLanes: true } })).toBe(true);
    expect(sameViewConfig(base, { ...base, settings: { kanban: { laneBy: "status", tintLanes: false } } }, { kanban: { tintLanes: true } })).toBe(false);
  });

  it("cleans a name to fit", () => {
    expect(cleanViewName("  This   sprint ")).toBe("This sprint");
    expect(cleanViewName("x".repeat(80))).toHaveLength(60);
  });
});

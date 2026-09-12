import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnSettings, ColumnType } from "@/domain";
import { columnLabels, defaultSettingsFor, emptyValueFor, hasEditableLabels, isEmptyValue, isProgressLabel, isStuckLabel } from "@/domain";
import { syncLabelDefinitions, translateValue } from "@/services/item-link-sync";
import { sortItems } from "@/features/boards/board-filtering";
import { columnSortField } from "@/stores/board-ui-store";
import type { Item } from "@/domain";

let n = 0;
function col(name: string, type: ColumnType, settings: ColumnSettings = defaultSettingsFor(type)): BoardColumn {
  n += 1;
  return { id: `c${n}`, boardId: "b", name, type, settings, position: n, width: 120, hidden: false, createdAt: "" };
}

const dropdown = (labels: { id: string; name: string; color: "gray" | "red" | "green" }[]) => ({ kind: "dropdown" as const, labels, defaultLabelId: null });

describe("the dropdown column", () => {
  it("starts empty rather than guessing what the list is of", () => {
    const settings = defaultSettingsFor("DROPDOWN");
    expect(settings).toEqual({ kind: "dropdown", labels: [], defaultLabelId: null });
  });

  it("carries no meanings, even for labels named the way a status names them", () => {
    const column = col("Stage", "DROPDOWN", dropdown([{ id: "stuck", name: "Stuck", color: "red" }, { id: "done", name: "Done", color: "green" }]));
    expect(isStuckLabel(column, "stuck")).toBe(false);
    expect(isProgressLabel(column, "done")).toBe(false);
  });

  it("offers its labels to the pickers, and an editor to define them in", () => {
    const column = col("Channel", "DROPDOWN", dropdown([{ id: "a", name: "Email", color: "gray" }]));
    expect(columnLabels(column).map((l) => l.name)).toEqual(["Email"]);
    expect(hasEditableLabels(column)).toBe(true);
    expect(hasEditableLabels(col("Priority", "PRIORITY"))).toBe(false);
  });

  it("is empty until a choice is made", () => {
    const value = emptyValueFor("DROPDOWN");
    expect(value).toEqual({ type: "DROPDOWN", labelId: null });
    expect(isEmptyValue(value)).toBe(true);
    expect(isEmptyValue({ type: "DROPDOWN", labelId: "a" })).toBe(false);
  });

  it("carries a choice to a linked board by the label's name", () => {
    const source = col("Channel", "DROPDOWN", dropdown([{ id: "src", name: "Email", color: "gray" }]));
    const target = col("Channel", "DROPDOWN", dropdown([{ id: "tgt", name: "email", color: "red" }]));
    expect(translateValue({ type: "DROPDOWN", labelId: "src" }, source, target)).toEqual({ kind: "value", value: { type: "DROPDOWN", labelId: "tgt" } });
  });

  it("says why a choice cannot travel when the other board has no such label", () => {
    const source = col("Channel", "DROPDOWN", dropdown([{ id: "src", name: "Email", color: "gray" }]));
    const target = col("Channel", "DROPDOWN", dropdown([{ id: "tgt", name: "Print", color: "red" }]));
    const result = translateValue({ type: "DROPDOWN", labelId: "src" }, source, target);
    expect(result).toEqual({ kind: "skip", reason: "Channel has no “Email” label" });
  });

  it("carries a rename and a new label to the paired dropdown, and no roles with them", () => {
    const before = dropdown([{ id: "a", name: "Email", color: "gray" }]);
    const after = dropdown([{ id: "a", name: "Newsletter", color: "red" }, { id: "b", name: "Print", color: "green" }]);
    const target = dropdown([{ id: "t", name: "Email", color: "gray" }]);
    const next = syncLabelDefinitions(before, after, target, () => "new");
    expect(next).toEqual({ kind: "dropdown", defaultLabelId: null, labels: [{ id: "t", name: "Newsletter", color: "red" }, { id: "new", name: "Print", color: "green" }] });
    expect(next && "doneLabelIds" in next).toBe(false);
  });

  it("does not pair a dropdown's labels with a status column's", () => {
    const status = defaultSettingsFor("STATUS");
    const after = dropdown([{ id: "a", name: "Done", color: "green" }]);
    expect(syncLabelDefinitions(dropdown([]), after, status, () => "new")).toBeNull();
  });
});

describe("sorting a board by a dropdown", () => {
  it("orders by the labels' own order rather than alphabetically, empties last", () => {
    // Named so that alphabetical order and label order disagree.
    const column = col("Stage", "DROPDOWN", dropdown([
      { id: "brief", name: "Zebra brief", color: "gray" },
      { id: "art", name: "Artwork", color: "green" },
    ]));
    const mk = (id: string): Item => ({ id }) as Item;
    const items = [mk("none"), mk("second"), mk("first")];
    const stored: Record<string, string | null> = { first: "brief", second: "art", none: null };
    const sorted = sortItems(items, { field: columnSortField(column.id), direction: "asc" }, {
      columns: [column],
      getValue: (itemId) => ({ type: "DROPDOWN", labelId: stored[itemId] ?? null }),
    });
    expect(sorted.map((i) => i.id)).toEqual(["first", "second", "none"]);
  });
});

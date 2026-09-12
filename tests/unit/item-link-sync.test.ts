import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnType } from "@/domain";
import { defaultSettingsFor } from "@/domain";
import { mapColumns, translateValue, valuesEqual } from "@/services/item-link-sync";

let n = 0;
function col(boardId: string, name: string, type: ColumnType, settings = defaultSettingsFor(type)): BoardColumn {
  n += 1;
  return {
    id: `c${n}`,
    boardId,
    name,
    type,
    settings,
    position: n,
    width: 120,
    hidden: false,
    createdAt: "",
  };
}

describe("mapColumns", () => {
  it("pairs columns by name first, then lone status/people/date columns by type", () => {
    const a = [col("a", "Owner", "PERSON"), col("a", "Status", "STATUS"), col("a", "Due Date", "DATE"), col("a", "Channel", "TAGS")];
    const b = [col("b", "Designer", "PERSON"), col("b", "Status", "STATUS"), col("b", "Delivery", "DATE"), col("b", "Market", "TAGS")];
    const report = mapColumns(a, b);
    expect(report.mapped.map((m) => `${m.source.name}->${m.target.name}`)).toEqual(["Owner->Designer", "Status->Status", "Due Date->Delivery"]);
    // Free-form types never pair by type alone: "Channel" and "Market" are different fields.
    expect(report.unmapped.map((c) => c.name)).toEqual(["Channel"]);
    expect(report.targetOnly.map((c) => c.name)).toEqual(["Market"]);
  });

  it("does not guess between several columns of the same type", () => {
    const a = [col("a", "Requester", "PERSON"), col("a", "Owner", "PERSON")];
    const b = [col("b", "Designer", "PERSON")];
    const report = mapColumns(a, b);
    expect(report.mapped).toHaveLength(0);
    expect(report.unmapped).toHaveLength(2);
  });

  it("matches text with long text by name and ignores dependency columns", () => {
    const a = [col("a", "Notes", "TEXT"), col("a", "Dependency", "DEPENDENCY")];
    const b = [col("b", "notes", "LONG_TEXT"), col("b", "Dependency", "DEPENDENCY")];
    const report = mapColumns(a, b);
    expect(report.mapped).toHaveLength(1);
    expect(report.mapped[0]?.target.type).toBe("LONG_TEXT");
    expect(report.unmapped).toHaveLength(0);
    expect(report.targetOnly).toHaveLength(0);
  });

  it("pairs two columns the user paired by hand, whichever way round they are given", () => {
    const channel = col("a", "Channel", "TAGS");
    const market = col("b", "Market", "TAGS");
    const forwards = mapColumns([channel], [market], [[channel.id, market.id]]);
    const backwards = mapColumns([channel], [market], [[market.id, channel.id]]);
    for (const report of [forwards, backwards]) {
      expect(report.mapped.map((m) => `${m.source.name}->${m.target.name}`)).toEqual(["Channel->Market"]);
      expect(report.unmapped).toHaveLength(0);
      expect(report.targetOnly).toHaveLength(0);
    }
  });

  it("lets a hand pairing win over the name match the rules would have made", () => {
    const status = col("a", "Status", "STATUS");
    const sameName = col("b", "Status", "STATUS");
    const other = col("b", "Stage", "STATUS");
    const report = mapColumns([status], [sameName, other], [[status.id, other.id]]);
    expect(report.mapped.map((m) => m.target.name)).toEqual(["Stage"]);
    expect(report.targetOnly.map((c) => c.name)).toEqual(["Status"]);
  });

  it("ignores a hand pairing between types that could never carry each other's values", () => {
    const due = col("a", "Due Date", "DATE");
    const tags = col("b", "Market", "TAGS");
    const report = mapColumns([due], [tags], [[due.id, tags.id]]);
    expect(report.mapped).toHaveLength(0);
    expect(report.unmapped.map((c) => c.name)).toEqual(["Due Date"]);
  });

  it("ignores a hand pairing whose other column has since been removed", () => {
    const tags = col("a", "Channel", "TAGS");
    const report = mapColumns([tags], [], [[tags.id, "deleted-column"]]);
    expect(report.mapped).toHaveLength(0);
    expect(report.unmapped.map((c) => c.name)).toEqual(["Channel"]);
  });
});

describe("translateValue", () => {
  it("maps status labels by name and skips labels the target does not have", () => {
    const source = col("a", "Status", "STATUS");
    const target = col("b", "Status", "STATUS", {
      kind: "status",
      labels: [
        { id: "x1", name: "In progress", color: "orange" },
        { id: "x2", name: "Shipped", color: "green" },
      ],
      doneLabelIds: ["x2"],
      defaultLabelId: "x1",
    });
    expect(translateValue({ type: "STATUS", labelId: "working" }, source, target)).toEqual({ kind: "value", value: { type: "STATUS", labelId: "x1" } });
    expect(translateValue({ type: "STATUS", labelId: "stuck" }, source, target)).toMatchObject({ kind: "skip" });
    expect(translateValue({ type: "STATUS", labelId: null }, source, target)).toEqual({ kind: "value", value: { type: "STATUS", labelId: null } });
  });

  it("keeps only the first assignee for single-person columns", () => {
    const source = col("a", "Owner", "PERSON");
    const target = col("b", "Owner", "PERSON", {
      kind: "person",
      allowMultiple: false,
    });
    expect(translateValue({ type: "PERSON", userIds: ["u1", "u2"] }, source, target)).toEqual({ kind: "value", value: { type: "PERSON", userIds: ["u1"] } });
  });

  it("converts between text and long text", () => {
    const source = col("a", "Notes", "TEXT");
    const target = col("b", "Notes", "LONG_TEXT");
    expect(translateValue({ type: "TEXT", text: "hi" }, source, target)).toEqual({ kind: "value", value: { type: "LONG_TEXT", text: "hi" } });
  });

  it("compares stored values structurally", () => {
    expect(valuesEqual({ type: "TAGS", tags: ["a"] }, { type: "TAGS", tags: ["a"] })).toBe(true);
    expect(valuesEqual({ type: "TAGS", tags: ["a"] }, { type: "TAGS", tags: ["b"] })).toBe(false);
    expect(valuesEqual(undefined, undefined)).toBe(true);
  });
});

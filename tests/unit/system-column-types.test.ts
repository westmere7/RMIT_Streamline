import { describe, expect, it } from "vitest";
import type { BoardColumn, ColumnType } from "@/domain";
import { COLUMN_TYPES, COLUMN_TYPE_LABELS, COLUMN_TYPE_PURPOSE, SYSTEM_COLUMN_TYPES, defaultSettingsFor, emptyValueFor, isEmptyValue, isSystemColumnType } from "@/domain";
import { buildBoardModel } from "@/features/boards/board-model";
import { EMPTY_FILTERS } from "@/stores/board-ui-store";
import type { Board } from "@/domain";
import { translateValue } from "@/services/item-link-sync";

let n = 0;
function col(name: string, type: ColumnType): BoardColumn {
  n += 1;
  return { id: `c${n}`, boardId: "b", name, type, settings: defaultSettingsFor(type), position: n, width: 120, hidden: false, createdAt: "" };
}

describe("system column types", () => {
  it("claims only real types", () => {
    for (const type of SYSTEM_COLUMN_TYPES) expect(COLUMN_TYPES).toContain(type);
  });

  it("says what every type is for, so the picker can too", () => {
    for (const type of COLUMN_TYPES) expect(COLUMN_TYPE_PURPOSE[type], `${type} has no note`).toBeTruthy();
  });

  it("keeps a board's own field types out of the group", () => {
    for (const type of ["TEXT", "LONG_TEXT", "RICH_TEXT", "DROPDOWN", "PEOPLE", "NUMBER", "CHECKBOX", "LINK", "TAGS"] as ColumnType[]) {
      expect(isSystemColumnType(type), `${type} should be a plain field`).toBe(false);
    }
  });
});

describe("PIC and People", () => {
  it("calls them apart, so a board can say which is which", () => {
    expect(COLUMN_TYPE_LABELS.PERSON).toBe("PIC");
    expect(COLUMN_TYPE_LABELS.PEOPLE).toBe("People");
    expect(isSystemColumnType("PERSON")).toBe(true);
    expect(isSystemColumnType("PEOPLE")).toBe(false);
  });

  it("counts only the PIC as carrying the work", () => {
    const columns = [col("Owner", "PERSON"), col("Requester", "PEOPLE")];
    const board = { id: "b" } as Board;
    const model = buildBoardModel({ board, columns, items: [], groups: [], values: [], links: [] }, { search: "", filters: EMPTY_FILTERS, sort: null, now: new Date() });
    expect(model.personColumns.map((c) => c.name)).toEqual(["Owner"]);
  });

  it("picks people the same way but stores which kind it is", () => {
    expect(emptyValueFor("PEOPLE")).toEqual({ type: "PEOPLE", userIds: [] });
    expect(isEmptyValue({ type: "PEOPLE", userIds: [] })).toBe(true);
    expect(isEmptyValue({ type: "PEOPLE", userIds: ["u1"] })).toBe(false);
  });

  it("carries a list of people to a linked board without turning them into owners", () => {
    const source = col("Contacts", "PEOPLE");
    const target = col("Contacts", "PEOPLE");
    expect(translateValue({ type: "PEOPLE", userIds: ["u1", "u2"] }, source, target)).toEqual({ kind: "value", value: { type: "PEOPLE", userIds: ["u1", "u2"] } });
  });
});

describe("the due date column", () => {
  it("is a system type, and says so by name", () => {
    expect(COLUMN_TYPE_LABELS.DATE).toBe("Due date");
    expect(isSystemColumnType("DATE")).toBe(true);
  });
});

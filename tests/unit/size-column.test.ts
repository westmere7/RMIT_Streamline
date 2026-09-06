import { describe, expect, it } from "vitest";
import type { BoardColumn, Item } from "@/domain";
import { COLUMN_TYPE_LABELS, DEFAULT_COLUMN_WIDTHS, T_SHIRT_SIZES, T_SHIRT_SIZE_COLORS, defaultSettingsFor, emptyValueFor, isEmptyValue, isTShirtSize } from "@/domain";
import { sortItems } from "@/features/boards/board-filtering";
import { displayValue } from "@/services/column-display";

const column: BoardColumn = { id: "size", boardId: "b", name: "Size", type: "SIZE", settings: defaultSettingsFor("SIZE"), position: 0, width: 110, hidden: false, createdAt: "" };
const item = (id: string, position: number): Item => ({ id, boardId: "b", groupId: "g", parentItemId: null, name: id, description: null, position, createdBy: "u", archivedAt: null, createdAt: "", updatedAt: "" });

describe("T-shirt size column", () => {
  it("is a first-class column type with five sizes, each with its own colour", () => {
    expect(T_SHIRT_SIZES).toEqual(["XS", "S", "M", "L", "XL"]);
    expect(new Set(Object.values(T_SHIRT_SIZE_COLORS)).size).toBe(5);
    expect(COLUMN_TYPE_LABELS.SIZE).toBe("T-shirt size");
    expect(DEFAULT_COLUMN_WIDTHS.SIZE).toBeGreaterThan(0);
    expect(isTShirtSize("M")).toBe(true);
    expect(isTShirtSize("XXL")).toBe(false);
  });

  it("starts empty and reads back as its letters", () => {
    const empty = emptyValueFor("SIZE");
    expect(empty).toEqual({ type: "SIZE", size: null });
    expect(isEmptyValue(empty)).toBe(true);
    expect(isEmptyValue({ type: "SIZE", size: "L" })).toBe(false);
    expect(displayValue(column, { type: "SIZE", size: "L" }, [])).toBe("L");
    expect(displayValue(column, empty, [])).toBeNull();
  });

  it("sorts by size, not alphabetically, with blanks last", () => {
    const values: Record<string, "XS" | "S" | "M" | "L" | "XL" | null> = { a: "XL", b: "S", c: null, d: "M", e: "XS" };
    const ctx = { columns: [column], getValue: (itemId: string) => ({ type: "SIZE" as const, size: values[itemId] ?? null }) };
    const items = Object.keys(values).map((id, i) => item(id, i));
    const asc = sortItems(items, { field: "column:size", direction: "asc" }, ctx).map((i) => i.id);
    expect(asc).toEqual(["e", "b", "d", "a", "c"]);
    const desc = sortItems(items, { field: "column:size", direction: "desc" }, ctx).map((i) => i.id);
    expect(desc).toEqual(["a", "d", "b", "e", "c"]);
  });
});

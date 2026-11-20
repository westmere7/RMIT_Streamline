import { describe, expect, it } from "vitest";
import { isMappingUsable, suggestAssetMapping } from "@/domain";
import { assetSheet } from "@/features/trackers/tracker-template";

/** "New tracker for this task" (v0.127.0): the sheet it makes reads as assets without any setting up. */
describe("a sheet laid out for a task's assets", () => {
  it("has a column for every part of a line, and the suggested mapping finds them all", () => {
    const sheet = { ...assetSheet("t", "Assets", ["Print", "Digital"]), id: "s" };
    expect(sheet.columns.map((c) => c.name)).toEqual(["Asset", "Type", "Quantity", "Spec", "PIC", "Due date", "Done"]);
    expect(sheet.columns.find((c) => c.name === "Type")?.options).toEqual(["Print", "Digital"]);
    expect(sheet.rows).toHaveLength(20);

    const mapping = suggestAssetMapping(sheet);
    expect(isMappingUsable(mapping)).toBe(true);
    const id = (name: string) => sheet.columns.find((c) => c.name === name)!.id;
    expect(mapping.name).toBe(id("Asset"));
    expect(mapping.type.columnId).toBe(id("Type"));
    expect(mapping.quantity.columnId).toBe(id("Quantity"));
    expect(mapping.pic.columnId).toBe(id("PIC"));
    expect(mapping.due.columnId).toBe(id("Due date"));
    expect(mapping.done.columnId).toBe(id("Done"));
  });
});

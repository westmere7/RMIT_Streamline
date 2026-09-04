import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { isDataExport } from "@/data/repositories";
import { SEED_BOARD_IDS } from "@/data/seed/seed-data";

let counter = 0;
const fresh = () => createLocalRepositories({ databaseName: `export-${Date.now()}-${++counter}` });

describe("data export / import", () => {
  it("round-trips every store between two databases", async () => {
    const source = fresh();
    await source.boards.update(SEED_BOARD_IDS.sem1, { name: "Renamed in source" });
    const dump = await source.admin.exportAll();
    expect(isDataExport(dump)).toBe(true);
    expect(dump.stores.boards).toHaveLength(12);
    expect(dump.stores.items?.length).toBeGreaterThan(100);

    const target = fresh();
    expect((await target.boards.getById(SEED_BOARD_IDS.sem1))?.name).toBe("Semester 1 Campaign");
    await target.admin.importAll(JSON.parse(JSON.stringify(dump)));
    expect((await target.boards.getById(SEED_BOARD_IDS.sem1))?.name).toBe("Renamed in source");
    const again = await target.admin.exportAll();
    for (const store of Object.keys(dump.stores)) {
      expect(again.stores[store]).toHaveLength(dump.stores[store]!.length);
    }
  });

  it("rejects files that are not exports", () => {
    expect(isDataExport({ format: "other" })).toBe(false);
    expect(isDataExport(null)).toBe(false);
    expect(isDataExport({ format: "streamline-export", version: 1, exportedAt: "", stores: {} })).toBe(true);
  });
});

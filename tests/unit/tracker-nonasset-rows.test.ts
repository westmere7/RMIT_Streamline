import { describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { canBeBand, detectNonAssetRows, nonAssetPlan, normalizeAssetMapping, sheetAssetLines, suggestAssetMapping, type TrackerColumn, type TrackerRow } from "@/domain";
import { createServices } from "@/services";

/**
 * Rows that are not assets (v0.132.0): a repeated header, a section or channel
 * label typed as a row, a total. Spotted for the asset settings, then left out
 * (ignoreRows, the sheet untouched) or made bands.
 */
const columns: TrackerColumn[] = [
  { id: "n", name: "Asset", type: "text", width: 160 },
  { id: "t", name: "Type", type: "text", width: 120 },
  { id: "q", name: "Qty", type: "number", width: 80 },
];
const row = (id: string, cells: TrackerRow["cells"]): TrackerRow => ({ id, kind: "data", cells });
const sheet = (rows: TrackerRow[]) => ({ columns, rows });

describe("spotting rows that are not assets", () => {
  const rows = [
    row("h", { n: "Asset", t: "Type", q: "Qty" }),
    row("s1", { n: "SOCIAL" }),
    row("a1", { n: "Story tile", t: "Social", q: 3 }),
    row("a2", { n: "Feed post", t: "Social", q: 2 }),
    row("s2", { n: "Channel: Web" }),
    row("a3", { n: "Banner", t: "Web" }),
    row("s3", { n: "Phase 2 — Launch" }),
    row("s4", { n: "Print:" }),
    row("a4", { n: "Hero tile" }), // a bare name: an asset, not a label
    row("tot", { n: "Total", q: 5 }),
    row("sub", { n: "Subtotal print" }),
  ];

  it("finds headers, section labels and totals, and leaves real assets alone", () => {
    const found = detectNonAssetRows(sheet(rows));
    expect(found.map((f) => [f.rowId, f.kind])).toEqual([
      ["h", "header"],
      ["s1", "section"],
      ["s2", "section"],
      ["s3", "section"],
      ["s4", "section"],
      ["tot", "total"],
      ["sub", "total"],
    ]);
  });

  it("does not call bare names labels in a sheet that is only a list of names", () => {
    expect(detectNonAssetRows(sheet([row("1", { n: "POSTER" }), row("2", { n: "FLYER" }), row("3", { n: "Banner" })]))).toEqual([]);
  });

  it("does not report a row the mapping already leaves out", () => {
    expect(detectNonAssetRows(sheet(rows), { ignoreRows: ["h", "tot"] }).map((f) => f.rowId)).not.toContain("h");
  });

  it("left-out rows are not lines, and the mapping keeps them through a clean", () => {
    const mapping = normalizeAssetMapping({ ...suggestAssetMapping({ columns }), ignoreRows: ["h", "tot", "tot", 7] }, columns)!;
    expect(mapping.ignoreRows).toEqual(["h", "tot"]);
    const names = sheetAssetLines(sheet(rows), mapping).map((l) => l.name);
    expect(names).not.toContain("Asset");
    expect(names).not.toContain("Total");
    expect(names).toContain("Story tile");
  });
});

describe("dealing with them on a real sheet", () => {
  it("bands the section rows (label from the text) and leaves the rest of the sheet as it was", async () => {
    const repos = createLocalRepositories({ databaseName: `nonasset-${Date.now()}-${Math.random()}` });
    const services = createServices(repos);
    const { sheets } = await services.trackers.create(
      { workspaceId: SEED_WORKSPACE_ID, teamId: null, name: "Mixed", layout: "blank", sheets: [{ name: "S", columns, frozenColumns: 1, rows: [row("s1", { n: "SOCIAL" }), row("a1", { n: "Story tile", t: "Social", q: 3 }), row("a2", { n: "Feed post", t: "Social", q: 2 })] }] },
      SEED_USER_IDS.jun,
    );
    const banded = await services.trackers.bandRows(sheets[0]!.id, ["s1", "a1-not-there"], SEED_USER_IDS.jun);
    expect(banded.rows.map((r) => [r.id, r.kind, r.label ?? null])).toEqual([
      ["s1", "section", "SOCIAL"],
      ["a1", "data", null],
      ["a2", "data", null],
    ]);
    const lines = sheetAssetLines(banded, suggestAssetMapping(banded));
    expect(lines.map((l) => [l.name, l.blockName])).toEqual([
      ["Story tile", "SOCIAL"],
      ["Feed post", "SOCIAL"],
    ]);
  });
});

describe("marking rows by hand (v0.133.0)", () => {
  const rows = [
    row("h", { n: "Asset", t: "Type", q: "Qty" }),
    row("s1", { n: "SOCIAL" }),
    row("a1", { n: "Story tile", t: "Social", q: 3 }),
    row("a2", { n: "Feed post", t: "Social", q: 2 }),
    row("note", { n: "Ask Jun about sizes" }),
    row("tot", { n: "Total", q: 5 }),
  ];
  const detected = detectNonAssetRows(sheet(rows));

  it("follows what was spotted when nothing is marked", () => {
    expect(nonAssetPlan(sheet(rows), [], detected, {})).toEqual({ bandIds: ["s1"], ignoreRows: ["h", "tot"] });
  });

  it("marks win: a spotted row made an asset, a missed row left out, another made a band", () => {
    expect(nonAssetPlan(sheet(rows), [], detected, { tot: "asset", a2: "skip", note: "band" })).toEqual({ bandIds: ["s1", "note"], ignoreRows: ["h", "a2"] });
  });

  it("brings back a row left out before, and keeps the others left out", () => {
    expect(nonAssetPlan(sheet(rows), ["a1", "a2"], [], { a1: "asset" })).toEqual({ bandIds: [], ignoreRows: ["a2"] });
  });

  it("never makes a band of a row with several values (its cells would be lost): it is left out instead", () => {
    expect(canBeBand(rows[2]!)).toBe(false);
    expect(canBeBand(rows[1]!)).toBe(true);
    expect(nonAssetPlan(sheet(rows), [], [], { a1: "band" })).toEqual({ bandIds: [], ignoreRows: ["a1"] });
  });

  it("drops marks for rows the sheet no longer has, and ignores bands", () => {
    const withBand: TrackerRow[] = [{ id: "b", kind: "section", label: "Print", cells: {} }, ...rows];
    expect(nonAssetPlan(sheet(withBand), ["gone"], [], { gone: "skip", b: "skip" })).toEqual({ bandIds: [], ignoreRows: [] });
  });
});

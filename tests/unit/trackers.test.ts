import { beforeEach, describe, expect, it } from "vitest";
import { createLocalRepositories } from "@/data/local";
import { SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import { clearRange, parseTsv, pasteBlock, rangeToTsv } from "@/features/trackers/grid-model";
import { DOMESTIC_CAMPAIGNS_COLUMNS } from "@/features/trackers/tracker-template";
import { createServices } from "@/services";
import { TrackerService } from "@/services/tracker-service";
import { sheetsToWorkbook, workbookToSheets } from "@/services/tracker-xlsx";

let counter = 0;

describe("Trackers", () => {
  let services: ReturnType<typeof createServices>;

  beforeEach(() => {
    counter += 1;
    services = createServices(createLocalRepositories({ databaseName: `trackers-${Date.now()}-${counter}` }));
  });

  it("seeds the demo asset tracker inside the Campaigns team with two sheets", async () => {
    const trackers = await services.trackers.list(SEED_WORKSPACE_ID);
    expect(trackers.map((t) => t.name)).toEqual(["Domestic Campaigns Asset Tracker"]);
    expect(trackers[0]?.teamId).toBe(SEED_TEAM_IDS.campaigns);
    const sheets = await services.trackers.listSheets(trackers[0]!.id);
    expect(sheets.map((s) => s.name)).toEqual(["Sem 1 2027", "Open Day 2026"]);
    const sheet = sheets[0]!;
    expect(sheet.columns.map((c) => c.name)).toEqual(DOMESTIC_CAMPAIGNS_COLUMNS.map((c) => c.name));
    expect(sheet.frozenColumns).toBe(6);
    expect(sheet.rows.filter((r) => r.kind === "section").map((r) => r.label)).toEqual(["Phase 1 — Connect", "Phase 2 — Convert"]);
    const status = sheet.columns.find((c) => c.name === "STATUS")!;
    expect(status.type).toBe("list");
    expect(status.optionColors?.COMPLETED).toBe("C6EFCE");
  });

  it("creates a campaign tracker, edits cells and reshapes rows and columns", async () => {
    const { tracker, sheets } = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: SEED_TEAM_IDS.digital, name: "Website assets", layout: "campaign" }, SEED_USER_IDS.jun);
    expect(tracker.teamId).toBe(SEED_TEAM_IDS.digital);
    let sheet = sheets[0]!;
    const channel = sheet.columns.find((c) => c.name === "CHANNEL")!;
    const due = sheet.columns.find((c) => c.name === "LIVE DATE")!;
    const row = sheet.rows[0]!;

    sheet = TrackerService.applyEdits(sheet, [
      { rowId: row.id, columnId: channel.id, value: "YouTube" },
      { rowId: row.id, columnId: due.id, value: TrackerService.coerce(due, "14/09/2026") },
    ]);
    expect(sheet.rows[0]!.cells[channel.id]).toBe("YouTube");
    expect(sheet.rows[0]!.cells[due.id]).toBe("2026-09-14");

    sheet = TrackerService.insertRows(sheet, 0, 1, "section");
    sheet = TrackerService.setRowLabel(sheet, sheet.rows[0]!.id, "Phase 1");
    expect(sheet.rows[0]).toMatchObject({ kind: "section", label: "Phase 1" });
    expect(sheet.rows[1]!.cells[channel.id]).toBe("YouTube");

    sheet = TrackerService.insertColumn(sheet, 2, { name: "Budget", type: "number" });
    expect(sheet.columns[2]!.name).toBe("Budget");
    sheet = TrackerService.deleteColumn(sheet, channel.id);
    expect(sheet.columns.some((c) => c.id === channel.id)).toBe(false);
    expect(channel.id in sheet.rows[1]!.cells).toBe(false);

    const saved = await services.trackers.saveSheet(sheet.id, { columns: sheet.columns, rows: sheet.rows, frozenColumns: sheet.frozenColumns });
    expect((await services.trackers.getSheet(saved.id)).rows[0]!.label).toBe("Phase 1");

    // Deleting the last sheet is refused; deleting the tracker removes its sheets.
    await expect(services.trackers.deleteSheet(sheet.id)).rejects.toThrow(/at least one sheet/);
    await services.trackers.delete(tracker.id);
    expect(await services.repos.trackers.getSheet(sheet.id)).toBeNull();
  });

  it("coerces typed and pasted text into column types", () => {
    expect(TrackerService.coerce({ type: "number" }, "1,250")).toBe(1250);
    expect(TrackerService.coerce({ type: "number" }, "n/a")).toBe("n/a");
    expect(TrackerService.coerce({ type: "checkbox" }, "Yes")).toBe(true);
    expect(TrackerService.coerce({ type: "date" }, "2026-09-14")).toBe("2026-09-14");
    expect(TrackerService.coerce({ type: "date" }, "1/9/26")).toBe("2026-09-01");
    expect(TrackerService.coerce({ type: "date" }, 46264)).toBe("2026-08-30");
    expect(TrackerService.coerce({ type: "text" }, "")).toBeNull();
  });

  it("copies and pastes blocks like Excel, growing the sheet when needed", async () => {
    const trackers = await services.trackers.list(SEED_WORKSPACE_ID);
    const [sheet] = await services.trackers.listSheets(trackers[0]!.id);
    const firstData = sheet!.rows.findIndex((r) => r.kind === "data");
    const tsv = rangeToTsv(sheet!, { top: firstData, left: 0, bottom: firstData, right: 2 });
    expect(tsv.split("\t")).toEqual(["Display", "Prospecting (Connect)", "VE"]);

    expect(parseTsv('a\tb\n"multi\nline"\t"quote""d"\n')).toEqual([
      ["a", "b"],
      ["multi\nline", 'quote"d'],
    ]);

    const last = sheet!.rows.length - 1;
    const pasted = pasteBlock(sheet!, { row: last, col: 0 }, [["Spotify", "Remarketing (Convert)"], ["YouTube", "Prospecting (Connect)"]], null);
    expect(pasted.rows).toHaveLength(sheet!.rows.length + 1);
    expect(pasted.rows[last]!.cells[sheet!.columns[0]!.id]).toBe("Spotify");
    expect(pasted.rows[last + 1]!.cells[sheet!.columns[1]!.id]).toBe("Prospecting (Connect)");

    // A single value fills the whole selection.
    const filled = pasteBlock(pasted, { row: last, col: 4 }, [["COMPLETED"]], { top: last, left: 4, bottom: last + 1, right: 4 });
    const status = sheet!.columns[4]!;
    expect(filled.rows[last]!.cells[status.id]).toBe("COMPLETED");
    expect(filled.rows[last + 1]!.cells[status.id]).toBe("COMPLETED");

    const cleared = clearRange(filled, { top: last, left: 0, bottom: last + 1, right: 4 });
    expect(Object.keys(cleared.rows[last]!.cells)).toHaveLength(0);
  });

  it("round-trips a tracker through .xlsx keeping bands, dropdowns, dates and links", async () => {
    const trackers = await services.trackers.list(SEED_WORKSPACE_ID);
    const sheets = await services.trackers.listSheets(trackers[0]!.id);
    const bytes = await sheetsToWorkbook(trackers[0]!.name, sheets);
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const imported = await workbookToSheets(bytes);
    expect(imported.skipped).toEqual([]);
    expect(imported.sheets.map((s) => s.name)).toEqual(["Sem 1 2027", "Open Day 2026"]);
    const source = sheets[0]!;
    const back = imported.sheets[0]!;
    expect(back.columns.map((c) => c.name)).toEqual(source.columns.map((c) => c.name));
    expect(back.frozenColumns).toBe(source.frozenColumns);

    const status = back.columns.find((c) => c.name === "STATUS")!;
    expect(status.type).toBe("list");
    expect(status.options).toEqual(source.columns.find((c) => c.name === "STATUS")!.options);
    expect(status.optionColors?.["IN PROGRESS"]).toBe("FFEB9C");
    expect(back.columns.find((c) => c.name === "LIVE DATE")!.type).toBe("date");
    expect(back.columns.find((c) => c.name === "LANDING PAGE URL")!.type).toBe("url");

    const bands = back.rows.filter((r) => r.kind !== "data");
    expect(bands.map((r) => [r.kind, r.label])).toEqual(source.rows.filter((r) => r.kind !== "data").map((r) => [r.kind, r.label]));

    const dataIndex = source.rows.findIndex((r) => r.kind === "data");
    const cellsOf = (sheet: { columns: { id: string; name: string }[]; rows: { cells: Record<string, unknown> }[] }, index: number) => Object.fromEntries(Object.entries(sheet.rows[index]!.cells).map(([id, v]) => [sheet.columns.find((c) => c.id === id)!.name, v]));
    expect(cellsOf(back, dataIndex)).toEqual(cellsOf(source, dataIndex));
  });
});

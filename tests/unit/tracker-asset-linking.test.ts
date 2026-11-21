import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalRepositories } from "@/data/local";
import type { Repositories } from "@/data/repositories";
import { SEED_TEAM_IDS, SEED_USER_IDS, SEED_WORKSPACE_ID } from "@/data/seed/seed-data";
import {
  NEW_ASSET_COLUMN,
  asUuid,
  assetRoleOf,
  assignAssetRole,
  coercePeople,
  doneChoicesOf,
  emptyAssetMapping,
  isMappingUsable,
  normalizeAssetMapping,
  resolveColumnRoles,
  resolvePeople,
  roleMismatch,
  setTrackerPeople,
  sheetAssetLines,
  sheetLineCells,
  sheetLineColumns,
  specColumnIds,
  suggestAssetMapping,
  type AssetPerson,
  type Item,
  type ItemAsset,
  type ItemAssetPatch,
  type TrackerAssetMapping,
  type TrackerColumn,
  type TrackerRow,
  type TrackerSheet,
} from "@/domain";
import { createServices } from "@/services";
import { ItemAssetService } from "@/services/item-asset-service";
import { TrackerService } from "@/services/tracker-service";

/**
 * A tracker sheet as a task's assets: the mapping, the lines a sheet stands
 * for, the sync that real saves run, edits made from the task, and the link's
 * lifecycle. Complements tracker-assets.test.ts (which covers the happy paths).
 */

const col = (id: string, name: string, type: TrackerColumn["type"], extra: Partial<TrackerColumn> = {}): TrackerColumn => ({ id, name, type, width: 120, ...extra });
const data = (id: string, cells: TrackerRow["cells"]): TrackerRow => ({ id, kind: "data", cells });
const band = (id: string, label: string, kind: "section" | "subsection" = "section"): TrackerRow => ({ id, kind, label, cells: {} });
const mapWith = (patch: Partial<TrackerAssetMapping>): TrackerAssetMapping => ({ ...emptyAssetMapping(), ...patch });

const JUN = SEED_USER_IDS.jun;
const EMILY = SEED_USER_IDS.emily;
const TOM = SEED_USER_IDS.tom;

const PEOPLE: AssetPerson[] = [
  { id: "u-jane", name: "Jane Morrison", email: "jane@x.test" },
  { id: "u-tom", name: "Tom Hartley", email: "tom@x.test" },
  { id: "u-mai", name: "Mai Tran", email: "mai+design@x.test" },
];

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe("suggestAssetMapping: header spellings", () => {
  const suggest = (columns: TrackerColumn[]) => suggestAssetMapping({ columns });

  it.each([
    ["Owner"],
    ["assigned to"],
    ["In charge"],
    ["Designer"],
    ["WHO"],
  ])("reads a text column named %s as the PIC when there is no People column", (name) => {
    const m = suggest([col("n", "Asset", "text"), col("p", name, "text")]);
    expect(m.pic.columnId).toBe("p");
    expect(m.name).toBe("n");
  });

  it("prefers a People column over a text column named PIC, which is then free to be the name", () => {
    const m = suggest([col("t", "PIC", "text"), col("p", "Reviewer", "person")]);
    expect(m.pic.columnId).toBe("p");
    // Nothing else reads as a name, so the leftover text column is taken.
    expect(m.name).toBe("t");
  });

  it("picks a due-like date over any other date, and falls back to the first date", () => {
    expect(suggest([col("a", "Name", "text"), col("c", "Created", "date"), col("g", "Go live", "date")]).due.columnId).toBe("g");
    expect(suggest([col("a", "Name", "text"), col("c", "Deliver by", "date")]).due.columnId).toBe("c");
    // Surprising but deliberate: any date at all is taken as the due date.
    expect(suggest([col("a", "Name", "text"), col("c", "Created", "date")]).due.columnId).toBe("c");
  });

  it.each([["Qty"], ["#"], ["No."], ["pcs"], ["Variants"], ["Copies"], ["Qty (units)"], ["Version count"]])("reads a number column named %s as the quantity", (name) => {
    expect(suggest([col("a", "Asset", "text"), col("q", name, "number")]).quantity.columnId).toBe("q");
  });

  it("takes a number column called Amount as the quantity (a cost column would be read as a count)", () => {
    expect(suggest([col("a", "Asset", "text"), col("q", "Amount", "number")]).quantity.columnId).toBe("q");
    // A number column that is not named like a count is left alone.
    expect(suggest([col("a", "Asset", "text"), col("q", "Budget", "number")]).quantity.columnId).toBeNull();
  });

  it.each([["Type"], ["Asset type"], ["deliverable type"], ["Kind"], ["Category"]])("reads %s as the type, from a text or a dropdown column", (name) => {
    expect(suggest([col("a", "Asset", "text"), col("t", name, "list", { options: ["A"] })]).type.columnId).toBe("t");
    expect(suggest([col("a", "Asset", "text"), col("t", name, "text")]).type.columnId).toBe("t");
  });

  it("takes a done-like checkbox before a status dropdown, and a status only when it has a finished choice", () => {
    const status = col("s", "Status", "list", { options: ["To do", "Done"] });
    expect(suggest([col("a", "Asset", "text"), status, col("c", "Approved?", "checkbox")]).done).toEqual({ columnId: "c", values: [] });
    expect(suggest([col("a", "Asset", "text"), status]).done).toEqual({ columnId: "s", values: ["Done"] });
    expect(suggest([col("a", "Asset", "text"), col("s", "Stage", "list", { options: ["Brief", "Signed off", "Live"] })]).done).toEqual({ columnId: "s", values: ["Signed off", "Live"] });
    expect(suggest([col("a", "Asset", "text"), col("s", "Status", "list", { options: ["To do", "Doing"] })]).done.columnId).toBeNull();
    // A checkbox that is not named like done is not taken; a text Status is not either.
    expect(suggest([col("a", "Asset", "text"), col("u", "Urgent", "checkbox"), col("s", "Status", "text")]).done.columnId).toBeNull();
  });

  it("names lines from the best named column, then any text column, then a long text or dropdown", () => {
    expect(suggest([col("x", "Notes", "text"), col("h", "Headline", "text")]).name).toBe("h");
    expect(suggest([col("x", "Comments", "text"), col("m", "Key message", "text")]).name).toBe("m");
    expect(suggest([col("x", "Comments", "text")]).name).toBe("x");
    expect(suggest([col("l", "Body", "longText")]).name).toBe("l");
    // With no text at all, any dropdown left over names the lines.
    const m = suggest([col("t", "Type", "list", { options: ["A"] }), col("s", "Owner choice", "list", { options: ["X"] })]);
    expect(m.type.columnId).toBe("t");
    expect(m.name).toBe("s");
  });

  it("puts every spec-like and link column it has not used into spec and links, in sheet order", () => {
    const m = suggest([
      col("a", "Asset", "text"),
      col("r", "Aspect ratio", "text"),
      col("d", "Dimensions", "text"),
      col("z", "Duration", "number"),
      col("l1", "Preview", "url"),
      col("l2", "Final", "url"),
      col("o", "Other", "text"),
    ]);
    expect(m.spec).toEqual(["r", "d", "z"]);
    expect(m.links).toEqual(["l1", "l2"]);
    expect(m.name).toBe("a");
  });

  it("never gives one column two parts", () => {
    const m = suggest([col("a", "Type", "text"), col("b", "Status", "list", { options: ["Done"] })]);
    const ids = [m.name, m.type.columnId, m.quantity.columnId, m.pic.columnId, m.due.columnId, m.done.columnId, ...m.spec, ...m.links].filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(m.type.columnId).toBe("a");
    expect(m.done.columnId).toBe("b");
    // Status was taken as Done, so nothing names the lines but the type: still usable.
    expect(m.name).toBeNull();
    expect(isMappingUsable(m)).toBe(true);
  });
});

describe("normalizeAssetMapping", () => {
  const columns = [col("n", "Asset", "text"), col("q", "Qty", "number"), col("p", "PIC", "person"), col("l", "Link", "url")];

  it("drops a mapped column that no longer exists, keeping every value for every row", () => {
    const raw = mapWith({
      name: "gone",
      type: { columnId: "gone-type", value: "  Banner  " },
      quantity: { columnId: "q", value: 2 },
      pic: { columnId: "gone-pic", value: ["u1"] },
      due: { columnId: "gone-due", value: "2026-12-01" },
      done: { columnId: "gone-done", values: ["Done"] },
      spec: ["gone-spec", "q"],
      links: ["l", "gone-link"],
    });
    const m = normalizeAssetMapping(raw, columns)!;
    expect(m).toEqual({
      name: null,
      type: { columnId: null, value: "Banner" },
      quantity: { columnId: "q", value: 2 },
      pic: { columnId: null, value: ["u1"] },
      due: { columnId: null, value: "2026-12-01" },
      // The done values outlive their column; harmless while no column is chosen.
      done: { columnId: null, values: ["Done"] },
      spec: ["q"],
      links: ["l"],
    });
    expect(isMappingUsable(m)).toBe(false);
  });

  it("keeps a mapped column whose type has changed (only the id is checked)", () => {
    const changed = [col("n", "Asset", "number"), col("q", "Qty", "text")];
    const m = normalizeAssetMapping(mapWith({ name: "n", quantity: { columnId: "q", value: null } }), changed)!;
    expect(m.name).toBe("n");
    expect(m.quantity.columnId).toBe("q");
  });

  it("cleans the values for every row: rounds a quantity, refuses a negative one, a non-ISO date and blank type", () => {
    const read = (patch: Record<string, unknown>) => normalizeAssetMapping({ ...emptyAssetMapping(), ...patch }, columns)!;
    expect(read({ quantity: { columnId: null, value: 2.6 } }).quantity.value).toBe(3);
    expect(read({ quantity: { columnId: null, value: -1 } }).quantity.value).toBeNull();
    expect(read({ quantity: { columnId: null, value: "4" } }).quantity.value).toBeNull();
    expect(read({ due: { columnId: null, value: "01/12/2026" } }).due.value).toBeNull();
    expect(read({ type: { columnId: null, value: "   " } }).type.value).toBeNull();
    expect(read({ pic: { columnId: null, value: ["a", "", 3, "b"] } }).pic.value).toEqual(["a", "b"]);
  });

  it("reads anything that is not an object as no mapping, and a bare object as an empty one", () => {
    expect(normalizeAssetMapping(null, columns)).toBeNull();
    expect(normalizeAssetMapping("name", columns)).toBeNull();
    expect(normalizeAssetMapping({}, columns)).toEqual(emptyAssetMapping());
    expect(normalizeAssetMapping({ spec: "n", links: 3, done: "x" }, columns)).toEqual(emptyAssetMapping());
  });
});

describe("assignAssetRole, doneChoicesOf, roleMismatch, NEW_ASSET_COLUMN", () => {
  it("moves a single part between columns and keeps a value for every row", () => {
    const start = mapWith({ name: "a", pic: { columnId: "p", value: ["u1"] } });
    const moved = assignAssetRole(start, { id: "q", type: "text" }, "pic");
    expect(moved.pic).toEqual({ columnId: "q", value: ["u1"] });
    // Taking a role off the column that plays it keeps the value.
    expect(assignAssetRole(moved, { id: "q", type: "text" }, null).pic).toEqual({ columnId: null, value: ["u1"] });
    // A column that is spec and gets made a link leaves spec.
    const spec = assignAssetRole(start, { id: "s", type: "text" }, "spec");
    expect(assignAssetRole(spec, { id: "s", type: "text" }, "link")).toMatchObject({ spec: [], links: ["s"] });
  });

  it("offers a dropdown's finished choices, any case, and nothing for other types", () => {
    expect(doneChoicesOf({ type: "list", options: ["to do", "DONE", "Done-ish", "Sent", "Signed off"] })).toEqual(["DONE", "Sent", "Signed off"]);
    expect(doneChoicesOf({ type: "text", options: ["Done"] })).toEqual([]);
    expect(doneChoicesOf({ type: "list" })).toEqual([]);
  });

  it("warns about PIC names nobody has and cells that are not addresses", () => {
    const columns = [col("p", "Owner", "text"), col("l", "Where", "text"), col("u", "Link", "url")];
    const rows = [data("a", { p: "Jane", l: "https://x.test", u: "not a url" }), data("b", { p: "Nobody", l: "see drive", u: "x" }), band("x", "Band")];
    expect(roleMismatch({ columns, rows }, "p", "pic", PEOPLE)).toEqual({ unreadable: 1, filled: 2, expected: "a person", rowIds: ["b"], wrongType: null });
    expect(roleMismatch({ columns, rows }, "l", "link")).toEqual({ unreadable: 1, filled: 2, expected: "a web address", rowIds: ["b"], wrongType: null });
    // A Link column is taken at its word.
    expect(roleMismatch({ columns, rows }, "u", "link")).toBeNull();
    expect(roleMismatch({ columns, rows }, "missing", "due")).toBeNull();
  });

  it("gives each part a column type that reads as that part", () => {
    expect(NEW_ASSET_COLUMN).toMatchObject({ name: { type: "text" }, type: { type: "list" }, quantity: { type: "number" }, pic: { type: "person" }, due: { type: "date" }, done: { type: "checkbox" }, link: { type: "url" } });
  });
});

// ---------------------------------------------------------------------------
// sheetAssetLines
// ---------------------------------------------------------------------------

describe("sheetAssetLines", () => {
  const columns = [col("n", "Asset", "text"), col("t", "Type", "list", { options: ["Banner", "Video"] }), col("q", "Qty", "text"), col("p", "Owner", "text"), col("d", "Due", "text"), col("s", "State", "text")];
  const mapping = mapWith({ name: "n", type: { columnId: "t", value: null }, quantity: { columnId: "q", value: null }, pic: { columnId: "p", value: null }, due: { columnId: "d", value: null }, done: { columnId: "s", values: [] } });
  const lines = (rows: TrackerRow[], m: TrackerAssetMapping = mapping, people: AssetPerson[] = PEOPLE) => sheetAssetLines({ columns, rows }, m, people);

  it("turns bands into blocks with stable uuids, default names for blank bands, and rows before a band into no block", () => {
    const out = lines([data("r0", { n: "Loose" }), band("b1", "  Phase 1  "), data("r1", { n: "A" }), band("b2", "", "subsection"), data("r2", { n: "B" }), band("b3", "   "), data("r3", { n: "C" })]);
    expect(out.map((l) => [l.rowId, l.blockId, l.blockName])).toEqual([
      ["r0", null, null],
      ["r1", asUuid("b1"), "Phase 1"],
      ["r2", asUuid("b2"), "Channel"],
      ["r3", asUuid("b3"), "Phase"],
    ]);
    expect(out.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });

  it("keeps a band row id that is already a uuid (lower-cased), so it is stored as it is", () => {
    const id = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
    expect(lines([band(id, "X"), data("r", { n: "A" })])[0]!.blockId).toBe(id.toLowerCase());
    // Two bands with the same label are still two blocks.
    const twins = lines([band("b1", "Same"), data("r1", { n: "A" }), band("b2", "Same"), data("r2", { n: "B" })]);
    expect(twins[0]!.blockId).not.toBe(twins[1]!.blockId);
  });

  it("skips rows with neither a name nor a type, including whitespace-only cells; a type alone names the row", () => {
    const out = lines([data("a", { n: "   " }), data("b", { q: "3", p: "Jane" }), data("c", { t: "Video" }), data("d", { n: " Spaced ", t: " Banner " })]);
    expect(out.map((l) => [l.rowId, l.name, l.assetType])).toEqual([
      ["c", "Video", "Video"],
      ["d", "Spaced", "Banner"],
    ]);
  });

  it("does not name a row from the type for every row: a blank row stays blank", () => {
    const m = { ...mapping, type: { columnId: "t", value: "Banner" } };
    const out = lines([data("a", {}), data("b", { n: "Named" })], m);
    expect(out.map((l) => [l.rowId, l.assetType])).toEqual([["b", "Banner"]]);
  });

  it("rounds and coerces quantities, and falls back to the value for every row when a cell does not read", () => {
    const m = { ...mapping, quantity: { columnId: "q", value: 7 } };
    const qty = (q: TrackerRow["cells"][string]) => lines([data("a", { n: "A", q })], m)[0]!.quantity;
    expect(qty("1,000")).toBe(1000);
    expect(qty(" 2.5 ")).toBe(3);
    expect(qty(0)).toBe(0);
    expect(qty("0")).toBe(0);
    // A count with its unit (v0.132.5): read, not dropped.
    expect(qty("3 pcs")).toBe(3);
    expect(qty("x4")).toBe(4);
    expect(qty("lots")).toBe(7);
    expect(qty("0x10")).toBe(7);
    expect(qty(-2)).toBe(7);
    expect(qty("")).toBe(7);
    expect(qty(true)).toBe(7);
    expect(qty(null)).toBe(7);
    // No value for every row: unreadable is null.
    expect(lines([data("a", { n: "A", q: "lots" })])[0]!.quantity).toBeNull();
  });

  it("reads a due cell as the sheet types dates (day first, Excel days, written with a year); anything else gets the value for every row", () => {
    const m = { ...mapping, due: { columnId: "d", value: "2030-01-01" } };
    const due = (d: string | number) => lines([data("a", { n: "A", d })], m)[0]!.dueDate;
    expect(due("2026-11-02")).toBe("2026-11-02");
    expect(due(" 2026-11-02")).toBe("2026-11-02");
    expect(due("02/11/2026")).toBe("2026-11-02");
    expect(due("2 Nov 2026")).toBe("2026-11-02");
    expect(due(46000)).toBe("2025-12-09");
    expect(due("next week")).toBe("2030-01-01");
    expect(due("02/11")).toBe("2030-01-01");
    expect(due(12)).toBe("2030-01-01");
    expect(due("31/02/2026")).toBe("2030-01-01");
  });

  it("was a bug, fixed: an impossible calendar date in a due cell is passed through as the line's due date", () => {
    // item_assets.due_date is a SQL date: "2026-02-30" makes the insert fail and the whole sheet sync with it.
    const out = lines([data("a", { n: "A", d: "2026-02-30" }), data("b", { n: "B", d: "2026-13-45" })]);
    expect(out.map((l) => l.dueDate)).toEqual([null, null]);
  });

  it("was a bug, fixed: a quantity beyond a SQL integer is passed through", () => {
    // item_assets.quantity is an integer: a mistyped 99999999999 breaks the sync for the whole sheet.
    // Read as no quantity (the mapping's value for every row, here none) rather than failing the sync.
    expect(lines([data("a", { n: "A", q: "99999999999" })])[0]!.quantity).toBeNull();
    expect(lines([data("a", { n: "A", q: "2147483647" })])[0]!.quantity).toBe(2147483647);
  });

  it("was a bug, fixed: a band label longer than 200 characters becomes a block name the database refuses", () => {
    // item_assets.block_name has check (char_length(block_name) <= 200); the line's name is cut at 500, the band's is not cut.
    const out = lines([band("b", "x".repeat(250)), data("a", { n: "A" })]);
    expect(out[0]!.blockName!.length).toBeLessThanOrEqual(200);
  });

  it("cuts a long name at 500 characters", () => {
    expect(lines([data("a", { n: "y".repeat(600) })])[0]!.name).toHaveLength(500);
  });

  it("reads people by full name, first name or email, ignoring case and separators, and drops unknown names", () => {
    const pic = (p: string) => lines([data("a", { n: "A", p })])[0]!.assigneeIds;
    expect(pic("JANE MORRISON")).toEqual(["u-jane"]);
    expect(pic("tom")).toEqual(["u-tom"]);
    expect(pic("tom@x.test; jane")).toEqual(["u-tom", "u-jane"]);
    expect(pic("Jane and Tom")).toEqual(["u-jane", "u-tom"]);
    expect(pic("Jane / Tom + jane")).toEqual(["u-jane", "u-tom"]);
    expect(pic("Nobody")).toEqual([]);
    expect(pic("Morrison")).toEqual([]);
  });

  it("falls back to the PIC for every row when no name in the cell resolves (an unknown name reads as the default person)", () => {
    const m = { ...mapping, pic: { columnId: "p", value: ["u-tom"] } };
    const out = lines([data("a", { n: "A", p: "Nobody" }), data("b", { n: "B" }), data("c", { n: "C", p: "Jane" })], m);
    expect(out.map((l) => l.assigneeIds)).toEqual([["u-tom"], ["u-tom"], ["u-jane"]]);
  });

  it("takes the first of two people sharing a first name (no warning that it is ambiguous)", () => {
    const people = [...PEOPLE, { id: "u-jane2", name: "Jane Doe", email: "doe@x.test" }];
    expect(lines([data("a", { n: "A", p: "Jane" })], mapping, people)[0]!.assigneeIds).toEqual(["u-jane"]);
    expect(resolvePeople("Jane Doe", people)).toEqual(["u-jane2"]);
  });

  it("was a bug, fixed: an email with plus addressing is split at the +, and can resolve to somebody else", () => {
    const people = [...PEOPLE, { id: "u-kim", name: "Kim Park", email: "tom+kim@x.test" }];
    // "tom+kim@x.test" is Kim's address, but is read as "tom" (Tom Hartley) and "kim@x.test" (nobody).
    expect(resolvePeople("tom+kim@x.test", people)).toEqual(["u-kim"]);
  });

  it("keeps rows with the same name as separate lines", () => {
    const out = lines([data("a", { n: "Tile" }), data("b", { n: "Tile" })]);
    expect(out.map((l) => [l.rowId, l.name])).toEqual([
      ["a", "Tile"],
      ["b", "Tile"],
    ]);
  });

  it("reads done from a checkbox (true only), from chosen list choices (any case), and from the usual words in text", () => {
    const cols = [col("n", "Asset", "text"), col("c", "Done", "checkbox"), col("l", "Status", "list", { options: ["Draft", "Approved", "Live"] }), col("x", "Note", "text")];
    const done = (doneCol: string, values: string[], cell: TrackerRow["cells"][string]) => sheetAssetLines({ columns: cols, rows: [data("a", { n: "A", [doneCol]: cell })] }, mapWith({ name: "n", done: { columnId: doneCol, values } }))[0]!.done;
    expect(done("c", [], true)).toBe(true);
    expect(done("c", [], "true")).toBe(false);
    expect(done("c", [], "Yes")).toBe(false);
    expect(done("l", ["Approved"], "APPROVED")).toBe(true);
    expect(done("l", ["Approved"], "Live")).toBe(false);
    // A dropdown with no Done choice chosen is never done, whatever it says.
    expect(done("l", [], "Live")).toBe(false);
    expect(done("x", [], " delivered ")).toBe(true);
    expect(done("x", [], "Done!")).toBe(false);
    expect(done("x", ["Yes"], "Done")).toBe(false);
    expect(done("x", ["Yes"], "yes")).toBe(true);
  });

  it("builds the spec from several columns (People as names, ticks as Yes, zero kept) and links from link columns", () => {
    const cols = [col("n", "Asset", "text"), col("f", "Format", "text"), col("z", "Size", "number"), col("r", "Reviewer", "person"), col("k", "Print", "checkbox"), col("u", "Final", "url"), col("w", "Drive", "text")];
    const m = mapWith({ name: "n", spec: ["f", "z", "r", "k"], links: ["u", "w"] });
    const row = data("a", { n: "A", f: "PDF", z: 0, r: "u-jane,u-ghost", k: true, u: "drive/folder", w: "www.example.test/x" });
    const [line] = sheetAssetLines({ columns: cols, rows: [row] }, m, PEOPLE);
    expect(line!.notes).toBe("Format: PDF · Size: 0 · Reviewer: Jane Morrison · Print: Yes");
    expect(line!.links).toEqual([
      { id: "col-u", label: "Final", url: "drive/folder", icon: "link" },
      { id: "col-w", label: "Drive", url: "www.example.test/x", icon: "link" },
    ]);
    // An unticked box and an empty cell say nothing.
    const [bare] = sheetAssetLines({ columns: cols, rows: [data("b", { n: "B", k: false })] }, m, PEOPLE);
    expect(bare!.notes).toBeNull();
    expect(bare!.links).toEqual([]);
  });
});

describe("coercePeople", () => {
  it("turns ids, names and emails into stored ids, once each, and drops what it cannot read", () => {
    expect(coercePeople("u-tom, Jane Morrison;tom@x.test\nNobody", PEOPLE)).toBe("u-tom,u-jane");
    expect(coercePeople("  ", PEOPLE)).toBeNull();
    // With nobody to look up, a uuid-looking token is kept as an id; a name is not.
    expect(coercePeople("00000001-0000-4000-8000-000000000003, Jane", [])).toBe("00000001-0000-4000-8000-000000000003");
  });
});

describe("sheetLineColumns and sheetLineCells (pure)", () => {
  const columns = [col("n", "Asset", "text"), col("q", "Qty", "number"), col("p", "PIC", "person"), col("d", "Due", "date"), col("l", "Status", "list", { options: ["Draft", "Done"] }), col("c", "Ok", "checkbox"), col("f", "Format", "text"), col("u", "Link", "url")];

  it("maps each changeable part to its column, spec and links only from a single column", () => {
    const m = mapWith({ name: "n", quantity: { columnId: "q", value: null }, spec: ["f", "br:1"], links: ["u"] });
    expect(sheetLineColumns(m)).toEqual({ name: "n", quantity: "q", notes: "f", links: "u" });
    expect(sheetLineColumns({ ...m, spec: ["f", "n"], links: ["u", "f"] })).toEqual({ name: "n", quantity: "q" });
    expect(specColumnIds({ spec: ["sep:1", "f", "br:2"] })).toEqual(["f"]);
    expect(sheetLineColumns(null)).toEqual({});
  });

  it("writes People ids, checkbox booleans, the first Done choice, and clears with null", () => {
    const m = mapWith({ name: "n", pic: { columnId: "p", value: null }, done: { columnId: "l", values: ["Done"] } });
    expect(sheetLineCells({ columns }, m, { assigneeIds: ["a", "b", "a"], completedAt: "2026-01-01T00:00:00Z" })).toEqual({ refused: null, cells: [{ columnId: "p", value: "a,b" }, { columnId: "l", value: "Done" }] });
    expect(sheetLineCells({ columns }, m, { assigneeIds: [], completedAt: null }).cells).toEqual([{ columnId: "p", value: null }, { columnId: "l", value: null }]);
    const box = mapWith({ name: "n", done: { columnId: "c", values: [] } });
    expect(sheetLineCells({ columns }, box, { completedAt: null }).cells).toEqual([{ columnId: "c", value: false }]);
    expect(sheetLineCells({ columns }, box, { name: "  Trimmed  " }).cells).toEqual([{ columnId: "n", value: "Trimmed" }]);
  });

  it("refuses the whole patch when any one part cannot be written, so nothing half-applies", () => {
    const m = mapWith({ name: "n" });
    expect(sheetLineCells({ columns }, m, { name: "X", dueDate: "2026-01-01" })).toEqual({ cells: [], refused: "No column in the sheet gives the due date. Choose one in its asset settings." });
    expect(sheetLineCells({ columns }, m, { name: "X", blockName: "Other" }).refused).toBe("Bands come from the sheet. Change them there.");
    // A mapped column that has since been deleted is refused too.
    expect(sheetLineCells({ columns }, mapWith({ name: "gone" }), { name: "X" }).refused).toMatch(/No column in the sheet gives the name/);
    // A list as Done with no finished choice cannot be ticked.
    expect(sheetLineCells({ columns }, mapWith({ name: "n", done: { columnId: "l", values: [] } }), { completedAt: "2026-01-01" }).refused).toMatch(/No choice in the sheet's Done column/);
  });
});

// ---------------------------------------------------------------------------
// Through real saves
// ---------------------------------------------------------------------------

const COLUMNS = [
  col("c-name", "Asset", "text"),
  col("c-type", "Type", "list", { options: ["Social post", "Banner", "Video"] }),
  col("c-qty", "Qty", "number"),
  col("c-pic", "PIC", "person"),
  col("c-due", "Due date", "date"),
  col("c-done", "Done", "checkbox"),
  col("c-format", "Format", "text"),
  col("c-link", "Final artwork", "url"),
];

const ROWS = (): TrackerRow[] => [
  band("b1", "Social"),
  data("r1", { "c-name": "Tile 1", "c-type": "Social post", "c-qty": 2, "c-pic": JUN, "c-due": "2030-01-10", "c-format": "1080x1080" }),
  data("r2", { "c-name": "Tile 2", "c-type": "Social post" }),
  band("b2", "Web"),
  data("r3", { "c-name": "Banner", "c-type": "Banner", "c-qty": 3, "c-done": true }),
  data("r4", {}),
];

let counter = 0;

/** Top-level tasks with no lines and no links, so their lists hold only what a test puts there. */
async function cleanItems(repos: Repositories, count: number): Promise<Item[]> {
  const boards = (await repos.boards.listByWorkspace(SEED_WORKSPACE_ID)).filter((b) => !b.system);
  const found: Item[] = [];
  for (const board of boards) {
    for (const item of (await repos.items.listByBoard(board.id)).filter((i) => !i.parentItemId && !i.archivedAt)) {
      if ((await repos.itemAssets.listByItem(item.id)).length) continue;
      if ((await repos.links.listByItems([item.id])).length) continue;
      found.push(item);
      if (found.length === count) return found;
    }
  }
  throw new Error("Not enough clean items in the seed");
}

describe("a linked sheet, through real saves", () => {
  let repos: Repositories;
  let services: ReturnType<typeof createServices>;
  let item: Item;
  let other: Item;
  let sheet: TrackerSheet;

  beforeEach(async () => {
    counter += 1;
    repos = createLocalRepositories({ databaseName: `link-${Date.now()}-${counter}-${Math.random()}` });
    services = createServices(repos);
    [item, other] = (await cleanItems(repos, 2)) as [Item, Item];
    const created = await services.trackers.create({ workspaceId: SEED_WORKSPACE_ID, teamId: SEED_TEAM_IDS.digital, name: "Kit", layout: "blank", sheets: [{ name: "Assets", columns: COLUMNS, frozenColumns: 1, rows: ROWS() }] }, JUN);
    sheet = created.sheets[0]!;
  });

  const link = (mapping: TrackerAssetMapping = suggestAssetMapping({ columns: COLUMNS })) => services.trackers.linkSheet(sheet.id, item.id, mapping, JUN);
  const sheetLines = async (itemId = item.id) => (await services.assets.list(itemId)).filter((a) => a.trackerSheetId === sheet.id);
  const current = () => services.trackers.getSheet(sheet.id);
  const row = async (rowId: string) => (await current()).rows.find((r) => r.id === rowId)!;
  /** Saves the sheet as the editor does, with the rows `edit` makes. */
  const save = async (edit: (s: TrackerSheet) => Partial<Pick<TrackerSheet, "columns" | "rows" | "frozenColumns">>) => {
    const now = await current();
    const result = await services.trackers.saveSheetDraft(sheet.id, edit(now), now.updatedAt, JUN);
    if ("conflict" in result) throw new Error("unexpected conflict");
    return result;
  };
  const values = async (itemId = item.id, boardId = item.boardId) => {
    const columns = await repos.boards.listColumns(boardId);
    const stored = await repos.items.listValuesByItem(itemId);
    const of = (columnId: string | undefined) => stored.find((v) => v.columnId === columnId)?.value;
    const pic = of(resolveColumnRoles(columns).pic?.id);
    return { recap: of(columns.find((c) => c.type === "ASSETS_RECAP")?.id), progress: of(columns.find((c) => c.type === "PROGRESS")?.id), pic: pic && pic.type === "PERSON" ? pic.userIds : [] };
  };

  it("links with one line a data row, in sheet order, bands as blocks", async () => {
    const { sync, sheet: saved } = await link();
    expect(sync).toEqual({ added: 3, updated: 0, removed: 0 });
    expect(saved.itemId).toBe(item.id);
    const lines = await sheetLines();
    expect(lines.map((l) => [l.trackerRowId, l.name, l.assetType, l.quantity, l.assigneeIds, l.dueDate, !!l.completedAt, l.notes, l.blockName, l.blockId])).toEqual([
      ["r1", "Tile 1", "Social post", 2, [JUN], "2030-01-10", false, "Format: 1080x1080", "Social", asUuid("b1")],
      ["r2", "Tile 2", "Social post", null, [], null, false, null, "Social", asUuid("b1")],
      ["r3", "Banner", "Banner", 3, [], null, true, null, "Web", asUuid("b2")],
    ]);
    expect(lines.every((l) => l.position >= 100_000 && l.boardId === item.boardId)).toBe(true);
  });

  it("adds a line when a row is added, and only that one", async () => {
    await link();
    const before = await sheetLines();
    const result = await save((s) => ({ rows: [...s.rows, data("r5", { "c-name": "Story", "c-type": "Video" })] }));
    expect(result.sync).toEqual({ added: 1, updated: 0, removed: 0 });
    const after = await sheetLines();
    expect(after.map((l) => l.id).slice(0, 3)).toEqual(before.map((l) => l.id));
    // A row after the last band sits in it.
    expect(after[3]).toMatchObject({ trackerRowId: "r5", name: "Story", blockName: "Web" });
  });

  it("updates a line in place when a cell changes: same id, nothing deleted or added", async () => {
    await link();
    const [first] = await sheetLines();
    const deleteMany = vi.spyOn(repos.itemAssets, "deleteMany");
    const createMany = vi.spyOn(repos.itemAssets, "createMany");
    const result = await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r1", columnId: "c-qty", value: 5 }, { rowId: "r1", columnId: "c-name", value: "Tile one" }]).rows }));
    expect(result.sync).toEqual({ added: 0, updated: 1, removed: 0 });
    expect(deleteMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    const [again] = await sheetLines();
    expect(again).toMatchObject({ id: first!.id, name: "Tile one", quantity: 5, createdAt: first!.createdAt });
  });

  it("removes only the deleted row's line", async () => {
    await link();
    const before = await sheetLines();
    const result = await save((s) => ({ rows: TrackerService.deleteRows(s, ["r2"]).rows }));
    // The line below moves up one place, so its position is rewritten too.
    expect(result.sync).toEqual({ added: 0, updated: 1, removed: 1 });
    expect((await sheetLines()).map((l) => l.id)).toEqual([before[0]!.id, before[2]!.id]);
  });

  it("moves a line between blocks when its row moves between bands, keeping its id and done mark", async () => {
    await link();
    const before = await sheetLines();
    const banner = before.find((l) => l.trackerRowId === "r3")!;
    // r3 (done) moves up under Social, above Tile 1.
    await save((s) => ({ rows: TrackerService.moveRows(s, ["r3"], 1).rows }));
    const after = await sheetLines();
    expect(after.map((l) => [l.trackerRowId, l.blockName])).toEqual([
      ["r3", "Social"],
      ["r1", "Social"],
      ["r2", "Social"],
    ]);
    expect(after[0]).toMatchObject({ id: banner.id, blockId: asUuid("b1"), completedAt: banner.completedAt });
  });

  it("renames every line of a band when the band is renamed, and keeps the block id", async () => {
    await link();
    const result = await save((s) => ({ rows: TrackerService.setRowLabel(s, "b1", "Organic social").rows }));
    expect(result.sync).toEqual({ added: 0, updated: 2, removed: 0 });
    expect((await sheetLines()).filter((l) => l.blockId === asUuid("b1")).map((l) => l.blockName)).toEqual(["Organic social", "Organic social"]);
  });

  it("takes a row's line off when the row becomes a band, and lines below move into it", async () => {
    await link();
    const result = await save((s) => ({ rows: TrackerService.setRowKind(s, ["r2"], "section").rows }));
    // r2's line goes (its first text became the band's label); r3 moves up a place.
    expect(result.sync).toEqual({ added: 0, updated: 1, removed: 1 });
    expect((await row("r2")).label).toBe("Tile 2");
    // Turning the Web band back into a data row: r3 joins the new "Tile 2" band, and the blank band row is not an asset.
    await save((s) => ({ rows: TrackerService.setRowKind(s, ["b2"], "data").rows }));
    expect((await sheetLines()).map((l) => [l.trackerRowId, l.blockName])).toEqual([
      ["r1", "Social"],
      ["r3", "Tile 2"],
    ]);
  });

  it("adds a line for a duplicated row, with the same name", async () => {
    await link();
    const result = await save((s) => ({ rows: TrackerService.duplicateRows(s, ["r1"]).rows }));
    expect(result.sync).toMatchObject({ added: 1 });
    expect((await sheetLines()).filter((l) => l.name === "Tile 1")).toHaveLength(2);
  });

  it("never touches the task's own lines, and counts them with the sheet's in the recap and progress", async () => {
    const own = await services.assets.add({ itemId: item.id, boardId: item.boardId, name: "Hand-made", quantity: 4, dueDate: "2020-01-01" }, JUN);
    await link();
    await save((s) => ({ rows: TrackerService.deleteRows(TrackerService.applyEdits(s, [{ rowId: "r1", columnId: "c-done", value: true }]), ["r2"]).rows }));
    const still = await repos.itemAssets.getById(own.id);
    expect(still).toEqual(own);
    expect(own.position).toBeLessThan(100_000);
    // Hand-made (×4, overdue) + Tile 1 (×2, done, due 2030-01-10) + Banner (×3, done).
    const { recap, progress } = await values();
    expect(recap).toEqual({ type: "ASSETS_RECAP", lines: 3, quantity: 9, types: 2, people: 1, nextDue: null, overdue: 1 });
    expect(progress).toEqual({ type: "PROGRESS", done: 2, total: 3, doneUnits: 5, totalUnits: 9 });
  });

  it("keeps the recap right through link, edits and unlink", async () => {
    await link();
    expect((await values()).recap).toEqual({ type: "ASSETS_RECAP", lines: 3, quantity: 6, types: 2, people: 1, nextDue: "2030-01-10", overdue: 0 });
    expect((await values()).progress).toEqual({ type: "PROGRESS", done: 1, total: 3, doneUnits: 3, totalUnits: 6 });
    await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r2", columnId: "c-qty", value: 10 }]).rows }));
    expect((await values()).progress).toMatchObject({ totalUnits: 15 });
    await services.trackers.unlinkSheet(sheet.id, JUN);
    expect((await values()).recap).toMatchObject({ lines: 0, quantity: 0 });
    expect((await values()).progress).toEqual({ type: "PROGRESS", done: 0, total: 0, doneUnits: 0, totalUnits: 0 });
  });

  it("adds the sheet's people to the task's PIC; removing them from the sheet leaves the PIC alone (clear is off by default)", async () => {
    const ids = (await values()).pic;
    const newcomer = [TOM, EMILY, SEED_USER_IDS.ben, SEED_USER_IDS.grace].find((id) => !ids.includes(id))!;
    await link();
    await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r2", columnId: "c-pic", value: newcomer }]).rows }));
    expect((await values()).pic).toContain(newcomer);
    expect((await values()).pic).toContain(JUN);
    await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r2", columnId: "c-pic", value: null }]).rows }));
    expect((await values()).pic).toContain(newcomer);
  });

  it("keeps a line's done moment across later edits, and clears it when unticked in the sheet", async () => {
    await link();
    const done = (await sheetLines()).find((l) => l.trackerRowId === "r3")!;
    expect(done.completedAt).not.toBeNull();
    await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r3", columnId: "c-name", value: "Banner 2" }]).rows }));
    expect((await sheetLines()).find((l) => l.trackerRowId === "r3")!.completedAt).toBe(done.completedAt);
    await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r3", columnId: "c-done", value: false }]).rows }));
    expect((await sheetLines()).find((l) => l.trackerRowId === "r3")!.completedAt).toBeNull();
  });

  it("rewrites every line's position when a row is inserted at the top (positions are the row's index among lines)", async () => {
    await link();
    const result = await save((s) => ({ rows: [data("r0", { "c-name": "First" }), ...s.rows] }));
    expect(result.sync).toEqual({ added: 1, updated: 3, removed: 0 });
  });

  it("takes every line off when the name column is deleted and no type column is mapped (the stored mapping lets go of the dead column)", async () => {
    await link(mapWith({ name: "c-name", done: { columnId: "c-done", values: [] } }));
    const result = await save((s) => TrackerService.deleteColumn(s, "c-name"));
    expect(result.sync).toEqual({ added: 0, updated: 0, removed: 3 });
    expect((await current()).assetMapping?.name).toBeNull();
    expect((await current()).itemId).toBe(item.id);
  });

  it("keeps the type-named lines when the name column is deleted but a type column is mapped", async () => {
    await link();
    const before = await sheetLines();
    const result = await save((s) => TrackerService.deleteColumn(s, "c-name"));
    expect(result.sync).toEqual({ added: 0, updated: 2, removed: 0 });
    const after = await sheetLines();
    expect(after.map((l) => [l.id, l.name])).toEqual(before.map((l) => [l.id, l.assetType]));
  });

  it("reopens every ticked line when the Done column is deleted", async () => {
    await link();
    await save((s) => TrackerService.deleteColumn(s, "c-done"));
    expect((await sheetLines()).some((l) => l.completedAt)).toBe(false);
  });

  it("keeps the same people when the PIC column turns from People into text and back", async () => {
    const users = await repos.users.list();
    setTrackerPeople(users.map((u) => ({ id: u.id, name: u.displayName, email: u.email })));
    try {
      await link();
      await save((s) => TrackerService.updateColumn(s, "c-pic", { type: "text" }));
      expect((await row("r1")).cells["c-pic"]).toBe("Jun Tanaka");
      expect((await sheetLines())[0]!.assigneeIds).toEqual([JUN]);
      await save((s) => TrackerService.updateColumn(s, "c-pic", { type: "person" }));
      expect((await row("r1")).cells["c-pic"]).toBe(JUN);
      expect((await sheetLines())[0]!.assigneeIds).toEqual([JUN]);
    } finally {
      setTrackerPeople([]);
    }
  });

  it("keeps quantities when the Qty column turns into text", async () => {
    await link();
    const result = await save((s) => TrackerService.updateColumn(s, "c-qty", { type: "text" }));
    expect(result.sync).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("was a bug, fixed: a link column whose name has a trailing space makes every save rewrite every linked line", async () => {
    // sheetAssetLines labels the link with the raw column name; the repository trims the label;
    // diffLine then compares "Final artwork " with "Final artwork" on every save, forever.
    await link();
    await save((s) => TrackerService.updateColumn(s, "c-link", { name: "Final artwork " }));
    await save((s) => ({ rows: TrackerService.applyEdits(s, [{ rowId: "r1", columnId: "c-link", value: "https://x.test/a" }]).rows }));
    const again = await save(() => ({ frozenColumns: 2 }));
    expect(again.sync).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("was a bug, fixed: a spec column whose name starts with a space makes every save rewrite the line", async () => {
    // specText writes " Format: 1080x1080"; the repository trims notes; diffLine never settles.
    await link();
    await save((s) => TrackerService.updateColumn(s, "c-format", { name: " Format" }));
    const again = await save(() => ({ frozenColumns: 2 }));
    expect(again.sync).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("was a bug, fixed: more than 20 link columns make every save rewrite the line (the store keeps 20)", async () => {
    const extra = Array.from({ length: 21 }, (_, i) => col(`u${i}`, `Link ${i}`, "url"));
    await save((s) => ({ columns: [...s.columns, ...extra], rows: TrackerService.applyEdits(s, extra.map((c) => ({ rowId: "r1", columnId: c.id, value: `https://x.test/${c.id}` }))).rows }));
    await link({ ...suggestAssetMapping({ columns: COLUMNS }), links: extra.map((c) => c.id) });
    const again = await save(() => ({ frozenColumns: 2 }));
    expect(again.sync).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("reports a sync that failed after the sheet saved, rather than throwing", async () => {
    await link();
    vi.spyOn(services.assets, "syncFromSheet").mockRejectedValueOnce(new Error("boom"));
    const now = await current();
    const result = await services.trackers.saveSheetDraft(sheet.id, { frozenColumns: 3 }, now.updatedAt, JUN);
    expect(result).toMatchObject({ sync: null, syncError: "boom" });
    expect((await current()).frozenColumns).toBe(3);
  });

  it("refuses a stale save without syncing, and the next save catches the task up", async () => {
    await link();
    const stale = await current();
    await services.trackers.saveSheetDraft(sheet.id, { frozenColumns: 2 }, stale.updatedAt, JUN);
    const sync = vi.spyOn(services.assets, "syncFromSheet");
    const rows = TrackerService.applyEdits(stale, [{ rowId: "r2", columnId: "c-name", value: "Lost" }]).rows;
    const conflict = await services.trackers.saveSheetDraft(sheet.id, { rows }, stale.updatedAt, JUN);
    expect("conflict" in conflict).toBe(true);
    expect(sync).not.toHaveBeenCalled();
    expect((await sheetLines()).map((l) => l.name)).not.toContain("Lost");
  });

  // ---- From the task's side ------------------------------------------------

  describe("edits made on the task", () => {
    const lineFor = async (rowId: string) => (await sheetLines()).find((l) => l.trackerRowId === rowId)!;
    const edit = async (rowId: string, patch: ItemAssetPatch) => services.assets.update((await lineFor(rowId)).id, patch, JUN);

    it("ticks and unticks a checkbox Done column, and the line follows", async () => {
      await link();
      const ticked = await edit("r2", { completedAt: "2026-11-20T00:00:00.000Z" });
      expect((await row("r2")).cells["c-done"]).toBe(true);
      expect(ticked.completedAt).not.toBeNull();
      const unticked = await edit("r2", { completedAt: null });
      expect((await row("r2")).cells["c-done"]).toBe(false);
      expect(unticked.completedAt).toBeNull();
    });

    it("ticks a text Done column with the usual word, which reads back as done", async () => {
      await save((s) => ({ columns: [...s.columns, col("c-state", "State", "text")] }));
      await link(mapWith({ name: "c-name", done: { columnId: "c-state", values: [] } }));
      await edit("r1", { completedAt: "2026-11-20T00:00:00.000Z" });
      expect((await row("r1")).cells["c-state"]).toBe("Done");
      expect((await lineFor("r1")).completedAt).not.toBeNull();
    });

    it("renames, re-types, changes quantity, PIC, due date, spec and link; the row and the line agree", async () => {
      await link();
      const before = await lineFor("r2");
      const after = await edit("r2", { name: "  Tile two  ", assetType: "Video", quantity: 4, assigneeIds: [TOM, EMILY], dueDate: "2030-02-01", notes: "A3", links: [{ id: "x", label: "anything", url: " https://x.test/f ", icon: "link" }] });
      const cells = (await row("r2")).cells;
      expect(cells).toMatchObject({ "c-name": "Tile two", "c-type": "Video", "c-qty": 4, "c-pic": `${TOM},${EMILY}`, "c-due": "2030-02-01", "c-format": "A3", "c-link": "https://x.test/f" });
      expect(after).toMatchObject({ id: before.id, name: "Tile two", assetType: "Video", quantity: 4, assigneeIds: [TOM, EMILY], dueDate: "2030-02-01", notes: "Format: A3" });
      expect(after.links.map((l) => [l.label, l.url])).toEqual([["Final artwork", "https://x.test/f"]]);
    });

    it("writes a PIC into a text column as a name the line reads back as the same person", async () => {
      await save((s) => ({ columns: [...s.columns, col("c-owner", "Owner", "text")] }));
      await link(mapWith({ name: "c-name", pic: { columnId: "c-owner", value: null } }));
      await edit("r1", { assigneeIds: [JUN, EMILY] });
      expect((await row("r1")).cells["c-owner"]).toBe("Jun Tanaka, Emily Carter");
      expect((await lineFor("r1")).assigneeIds).toEqual([JUN, EMILY]);
    });

    it("writes a quantity into a text column as text, which reads back", async () => {
      await save((s) => TrackerService.updateColumn(s, "c-qty", { type: "text" }));
      await link();
      await edit("r1", { quantity: 12 });
      expect((await row("r1")).cells["c-qty"]).toBe("12");
      expect((await lineFor("r1")).quantity).toBe(12);
    });

    it("rounds a fractional quantity typed on the task, in the sheet and on the line alike", async () => {
      await link();
      const after = await edit("r1", { quantity: 2.5 });
      expect((await row("r1")).cells["c-qty"]).toBe(3);
      expect(after.quantity).toBe(3);
    });

    it("snaps a cleared quantity or PIC back to the value for every row", async () => {
      await link({ ...suggestAssetMapping({ columns: COLUMNS }), quantity: { columnId: "c-qty", value: 1 }, pic: { columnId: "c-pic", value: [EMILY] } });
      const after = await edit("r1", { quantity: null, assigneeIds: [] });
      expect((await row("r1")).cells["c-qty"]).toBeUndefined();
      expect((await row("r1")).cells["c-pic"]).toBeUndefined();
      expect(after.quantity).toBe(1);
      expect(after.assigneeIds).toEqual([EMILY]);
    });

    it("deletes a type-named line when its type is cleared on the task, and hands back the line as it was", async () => {
      await link();
      await save((s) => ({ rows: [...s.rows, data("r6", { "c-type": "Video" })] }));
      const line = await lineFor("r6");
      expect(line.name).toBe("Video");
      const returned = await services.assets.update(line.id, { assetType: null }, JUN);
      expect(await repos.itemAssets.getById(line.id)).toBeNull();
      // update() returns the stale line, not that it is gone.
      expect(returned).toMatchObject({ id: line.id, assetType: "Video" });
    });

    it("refuses what the mapping cannot express, with a clear message, and writes nothing", async () => {
      await save((s) => ({ columns: [...s.columns, col("c-size", "Size", "text"), col("c-preview", "Preview", "url")] }));
      await link(mapWith({ name: "c-name", spec: ["c-format", "c-size"], links: ["c-link", "c-preview"] }));
      const before = await current();
      await expect(edit("r1", { notes: "A4" })).rejects.toThrow("The spec comes from several columns of the sheet. Change it there.");
      await expect(edit("r1", { links: [] })).rejects.toThrow("The link comes from several columns of the sheet. Change it there.");
      await expect(edit("r1", { dueDate: "2030-01-01" })).rejects.toThrow("No column in the sheet gives the due date. Choose one in its asset settings.");
      await expect(edit("r1", { completedAt: "2030-01-01T00:00:00Z" })).rejects.toThrow(/done mark/);
      await expect(edit("r1", { name: "Kept?", blockName: "Elsewhere" })).rejects.toThrow("Bands come from the sheet. Change them there.");
      // Reordering a sheet line on the task is refused with its own message.
      await expect(edit("r1", { position: 3 })).rejects.toThrow("Lines from a sheet keep the sheet's order. Move the rows there.");
      expect((await current()).updatedAt).toBe(before.updatedAt);
      expect((await lineFor("r1")).name).toBe("Tile 1");
    });

    it("refuses a tick when the Done column is a dropdown with no finished choice", async () => {
      await save((s) => ({ columns: [...s.columns, col("c-stage", "Stage", "list", { options: ["Brief", "WIP"] })] }));
      await link(mapWith({ name: "c-name", done: { columnId: "c-stage", values: [] } }));
      await expect(edit("r1", { completedAt: "2030-01-01T00:00:00Z" })).rejects.toThrow(/No choice in the sheet's Done column/);
    });

    it("validates before writing to the sheet: a blank name or negative quantity never reaches it", async () => {
      await link();
      const before = await current();
      await expect(edit("r1", { name: "   " })).rejects.toThrow("Say what the asset is");
      await expect(edit("r1", { quantity: -1 })).rejects.toThrow("Quantity must be zero or more");
      expect((await current()).updatedAt).toBe(before.updatedAt);
    });

    it("refuses to delete a sheet line on the task, and leaves both the line and the row", async () => {
      await link();
      const line = await lineFor("r1");
      await expect(services.assets.remove(line.id, item.id, item.boardId, JUN)).rejects.toThrow("This line comes from a tracker sheet. Change it in the sheet.");
      expect(await repos.itemAssets.getById(line.id)).not.toBeNull();
      expect((await row("r1")).cells["c-name"]).toBe("Tile 1");
    });

    it("refuses block edits on a band from the sheet", async () => {
      await link();
      const blockId = asUuid("b1");
      await expect(services.assets.updateBlock(item.id, blockId, { name: "X" }, JUN)).rejects.toThrow(/tracker sheet/);
      await expect(services.assets.saveBlock(item.id, blockId, { name: "X", assigneeIds: [], links: [], lines: [] }, JUN)).rejects.toThrow(/tracker sheet/);
      await expect(services.assets.removeBlock(item.id, blockId, JUN)).rejects.toThrow(/tracker sheet/);
      expect(await sheetLines()).toHaveLength(3);
    });

    it("gives up with a clear message when the sheet keeps changing under the edit", async () => {
      await link();
      const line = await lineFor("r1");
      const spy = vi.spyOn(repos.trackers, "updateSheetIfCurrent").mockResolvedValue(null);
      await expect(services.assets.update(line.id, { name: "Never" }, JUN)).rejects.toThrow("The sheet kept changing. Try again in a moment.");
      expect(spy).toHaveBeenCalledTimes(4);
      spy.mockRestore();
      expect((await row("r1")).cells["c-name"]).toBe("Tile 1");
    });

    it("retries over one concurrent save and keeps both changes", async () => {
      await link();
      const line = await lineFor("r1");
      const real = repos.trackers.updateSheetIfCurrent.bind(repos.trackers);
      let first = true;
      vi.spyOn(repos.trackers, "updateSheetIfCurrent").mockImplementation(async (id, patch, expected) => {
        if (first) {
          first = false;
          // Somebody else types in the sheet just before this save lands.
          const theirs = await repos.trackers.getSheet(id);
          await repos.trackers.updateSheet(id, { rows: TrackerService.applyEdits(theirs!, [{ rowId: "r2", columnId: "c-qty", value: 9 }]).rows });
        }
        return real(id, patch, expected);
      });
      await services.assets.update(line.id, { name: "Mine" }, JUN);
      expect((await row("r1")).cells["c-name"]).toBe("Mine");
      expect((await row("r2")).cells["c-qty"]).toBe(9);
    });

    it("says so when the sheet took the change but the task's lines could not follow", async () => {
      await link();
      const line = await lineFor("r1");
      vi.spyOn(services.assets, "syncFromSheet").mockRejectedValueOnce(new Error("db down"));
      await expect(services.assets.update(line.id, { name: "Half" }, JUN)).rejects.toThrow("The sheet took the change, but the task's assets could not be updated: db down");
      expect((await row("r1")).cells["c-name"]).toBe("Half");
      expect((await lineFor("r1")).name).toBe("Tile 1");
    });

    it("refuses a sheet line edit when no tracker service is listening", async () => {
      await link();
      const bare = new ItemAssetService(repos);
      await expect(bare.update((await lineFor("r1")).id, { name: "X" }, JUN)).rejects.toThrow(/tracker sheet/);
    });
  });

  // ---- Lifecycle -------------------------------------------------------------

  it("unlinks and relinks without duplicates, keeping the mapping in between", async () => {
    await link();
    const first = await sheetLines();
    const unlinked = await services.trackers.unlinkSheet(sheet.id, JUN);
    expect(unlinked.itemId).toBeNull();
    expect(unlinked.assetMapping?.name).toBe("c-name");
    expect(await sheetLines()).toEqual([]);
    // Saving the unlinked sheet writes nothing.
    expect((await save(() => ({ frozenColumns: 2 }))).sync).toEqual({ added: 0, updated: 0, removed: 0 });
    const { sync } = await link(unlinked.assetMapping!);
    expect(sync).toEqual({ added: 3, updated: 0, removed: 0 });
    const second = await sheetLines();
    expect(second.map((l) => l.trackerRowId)).toEqual(first.map((l) => l.trackerRowId));
    // New lines, not the old ones back.
    expect(second.some((l) => first.some((f) => f.id === l.id))).toBe(false);
    // Linking the same pair again changes nothing.
    expect((await link(unlinked.assetMapping!)).sync).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await sheetLines()).toHaveLength(3);
  });

  it("unlinking an unlinked sheet is a no-op", async () => {
    const result = await services.trackers.unlinkSheet(sheet.id, JUN);
    expect(result.itemId).toBeNull();
  });

  it("refuses a second task, and a second sheet for the same task, naming the first", async () => {
    await link();
    await expect(services.trackers.linkSheet(sheet.id, other.id, suggestAssetMapping({ columns: COLUMNS }), JUN)).rejects.toThrow(`This sheet already holds the assets of “${item.name}”. Unlink it there first.`);
    const spare = await services.trackers.addSheet(sheet.trackerId, "Spare", "blank");
    await expect(services.trackers.linkSheet(spare.id, item.id, suggestAssetMapping(spare), JUN)).rejects.toThrow(`“${item.name}” already takes its assets from the sheet “Assets”.`);
    expect(await sheetLines(other.id)).toEqual([]);
  });

  it("refuses an unusable mapping (or one naming only missing columns) and leaves the sheet unlinked", async () => {
    await expect(link(emptyAssetMapping())).rejects.toThrow("Choose the column that names each asset.");
    await expect(link(mapWith({ name: "gone", type: { columnId: "also-gone", value: null } }))).rejects.toThrow("Choose the column that names each asset.");
    expect((await current()).itemId ?? null).toBeNull();
    expect(await sheetLines()).toEqual([]);
  });

  it("refuses an unknown task or sheet", async () => {
    await expect(services.trackers.linkSheet(sheet.id, "no-such-item", suggestAssetMapping({ columns: COLUMNS }), JUN)).rejects.toThrow();
    await expect(services.trackers.linkSheet("no-such-sheet", item.id, suggestAssetMapping({ columns: COLUMNS }), JUN)).rejects.toThrow();
  });

  it("re-syncs in place when the mapping of a linked sheet changes", async () => {
    await link();
    const before = await sheetLines();
    // Name lines from the Format column instead: a row with no format is named by its type.
    const { sync } = await services.trackers.setAssetMapping(sheet.id, { ...suggestAssetMapping({ columns: COLUMNS }), name: "c-format", spec: [] }, JUN);
    // Banner keeps its name (its type is "Banner") and had no spec, so only two lines change.
    expect(sync).toEqual({ added: 0, updated: 2, removed: 0 });
    const after = await sheetLines();
    expect(after.map((l) => [l.id, l.name, l.notes])).toEqual([
      [before[0]!.id, "1080x1080", null],
      [before[1]!.id, "Social post", null],
      [before[2]!.id, "Banner", null],
    ]);
    // Dropping the type too leaves only the row with a format.
    const narrowed = await services.trackers.setAssetMapping(sheet.id, mapWith({ name: "c-format" }), JUN);
    expect(narrowed.sync).toEqual({ added: 0, updated: 1, removed: 2 });
  });

  it("refuses an unusable mapping on a linked sheet but stores one on an unlinked sheet", async () => {
    await link();
    await expect(services.trackers.setAssetMapping(sheet.id, emptyAssetMapping(), JUN)).rejects.toThrow("Choose the column that names each asset.");
    expect(await sheetLines()).toHaveLength(3);
    await services.trackers.unlinkSheet(sheet.id, JUN);
    const { sheet: saved, sync } = await services.trackers.setAssetMapping(sheet.id, emptyAssetMapping(), JUN);
    expect(saved.assetMapping).toEqual(emptyAssetMapping());
    expect(sync).toEqual({ added: 0, updated: 0, removed: 0 });
  });

  it("adds a Done checkbox column that makes a usable mapping, and ticking a line then writes it", async () => {
    await link(mapWith({ name: "c-name" }));
    const { column } = await services.trackers.addAssetColumn(sheet.id, "done", JUN, ["ignored"]);
    expect(column).toMatchObject({ name: "Done 2", type: "checkbox" });
    expect(column.options).toBeUndefined();
    const mapping = assignAssetRole((await current()).assetMapping!, column, "done");
    expect(mapping.done).toEqual({ columnId: column.id, values: [] });
    await services.trackers.setAssetMapping(sheet.id, mapping, JUN);
    const line = (await sheetLines())[0]!;
    await services.assets.update(line.id, { completedAt: "2030-01-01T00:00:00Z" }, JUN);
    expect((await row("r1")).cells[column.id]).toBe(true);
    // The new column changed nothing about the lines while unmapped; the link is intact.
    expect((await current()).itemId).toBe(item.id);
  });

  it.each([
    ["name", "Asset 2", "text"],
    ["quantity", "Quantity", "number"],
    ["pic", "PIC 2", "person"],
    ["link", "Link", "url"],
  ] as const)("adds a %s column named %s of type %s", async (role, name, type) => {
    const { column, sheet: saved } = await services.trackers.addAssetColumn(sheet.id, role, JUN);
    expect(column).toMatchObject({ name, type });
    expect(saved.columns.at(-1)!.id).toBe(column.id);
    expect(assetRoleOf(assignAssetRole(emptyAssetMapping(), column, role), column.id)).toBe(role);
  });

  it("deleting the tracker with keepAssets keeps the lines as the task's own: detached, editable and removable", async () => {
    await link();
    const before = await sheetLines();
    await services.trackers.delete(sheet.trackerId, JUN, { keepAssets: true });
    const kept = await services.assets.list(item.id);
    expect(kept.map((l) => [l.id, l.name, l.trackerSheetId, l.trackerRowId, l.blockName, !!l.completedAt])).toEqual(before.map((l) => [l.id, l.name, null, null, l.blockName, !!l.completedAt]));
    expect(await services.trackers.sheetForItem(item.id)).toBeNull();
    // They are ordinary lines now: an edit is written to the line, and it can be taken off.
    const renamed = await services.assets.update(kept[0]!.id, { name: "Mine now" }, JUN);
    expect(renamed.name).toBe("Mine now");
    await services.assets.remove(kept[1]!.id, item.id, item.boardId, JUN);
    expect((await services.assets.list(item.id)).map((l) => l.name)).toEqual(["Mine now", "Banner"]);
    expect((await values()).recap).toMatchObject({ lines: 2 });
    // A line added by hand goes after them, not among them.
    const added = await services.assets.add({ itemId: item.id, boardId: item.boardId, name: "Later" }, JUN);
    expect(added.position).toBeGreaterThan(kept[2]!.position);
  });

  it("unlinking with keepAssets keeps the lines as the task's own, same ids; the sheet keeps its rows", async () => {
    await link();
    const before = await sheetLines();
    const rows = (await current()).rows.length;
    const unlinked = await services.trackers.unlinkSheet(sheet.id, JUN, { keepAssets: true });
    expect(unlinked.itemId).toBeNull();
    expect(unlinked.rows).toHaveLength(rows);
    const kept = await services.assets.list(item.id);
    expect(kept.map((l) => [l.id, l.name, l.trackerSheetId, l.trackerRowId, !!l.completedAt])).toEqual(before.map((l) => [l.id, l.name, null, null, !!l.completedAt]));
    expect((await values()).recap).toMatchObject({ lines: before.length });
  });

  it("unlinking without keepAssets takes the lines off", async () => {
    await link();
    await services.trackers.unlinkSheet(sheet.id, JUN);
    expect(await services.assets.list(item.id)).toEqual([]);
    expect((await values()).recap).toMatchObject({ lines: 0 });
  });

  it("deleting the tracker without keepAssets takes the lines off and puts the recap right", async () => {
    await link();
    await services.trackers.delete(sheet.trackerId, JUN, { keepAssets: false });
    expect(await services.assets.list(item.id)).toEqual([]);
    expect((await values()).recap).toMatchObject({ lines: 0 });
  });

  it("deleting a linked sheet with keepAssets keeps the lines; without, they go; the last sheet cannot go", async () => {
    await link();
    await expect(services.trackers.deleteSheet(sheet.id, JUN, { keepAssets: true })).rejects.toThrow("A tracker needs at least one sheet");
    expect((await current()).itemId).toBe(item.id);
    expect(await sheetLines()).toHaveLength(3);

    await services.trackers.addSheet(sheet.trackerId, "Spare", "blank");
    await services.trackers.deleteSheet(sheet.id, JUN, { keepAssets: true });
    const kept = await services.assets.list(item.id);
    expect(kept.map((l) => [l.trackerSheetId, l.trackerRowId])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
  });

  it("deleting a linked sheet without keepAssets takes the lines off and frees the task for another sheet", async () => {
    await link();
    const spare = await services.trackers.addSheet(sheet.trackerId, "Spare", "duplicate", sheet.id);
    await services.trackers.deleteSheet(sheet.id, JUN, { keepAssets: false });
    expect(await services.assets.list(item.id)).toEqual([]);
    expect((await values()).recap).toMatchObject({ lines: 0 });
    // The copy kept the mapping, so it links in one go.
    const { sync } = await services.trackers.linkSheet(spare.id, item.id, spare.assetMapping ?? suggestAssetMapping(spare), JUN);
    expect(sync).toEqual({ added: 3, updated: 0, removed: 0 });
  });

  it("copies of a linked sheet or tracker hold no task's lines, and saving them writes none", async () => {
    await link();
    const copy = await services.trackers.addSheet(sheet.trackerId, "Copy", "duplicate", sheet.id);
    expect(copy.itemId ?? null).toBeNull();
    expect(copy.assetMapping?.name).toBe("c-name");
    const dup = await services.trackers.duplicate(sheet.trackerId, JUN);
    expect(dup.sheets.every((s) => !s.itemId)).toBe(true);
    const saved = await services.trackers.saveSheetDraft(copy.id, { rows: [...copy.rows, data("x", { "c-name": "New" })] }, copy.updatedAt, JUN);
    expect("sync" in saved && saved.sync).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(await services.assets.list(item.id)).toHaveLength(3);
  });

  it("renaming the tracker or sheet never breaks the link", async () => {
    await link();
    await services.trackers.update(sheet.trackerId, { name: "Renamed" });
    await services.trackers.renameSheet(sheet.id, "Renamed tab");
    expect((await services.trackers.sheetForItem(item.id))?.id).toBe(sheet.id);
    await services.assets.update((await sheetLines())[0]!.id, { name: "Still linked" }, JUN);
    expect((await row("r1")).cells["c-name"]).toBe("Still linked");
  });

  it("takes the lines with the task when the task is deleted, and a save of the sheet then does nothing", async () => {
    await link();
    await services.items.deleteItems(item.boardId, [item.id], JUN);
    expect(await repos.itemAssets.listBySheet(sheet.id)).toEqual([]);
    expect((await save(() => ({ frozenColumns: 2 }))).sync).toEqual({ added: 0, updated: 0, removed: 0 });
    // Unlinking still works, and frees the sheet.
    await services.trackers.unlinkSheet(sheet.id, JUN);
    expect((await services.trackers.linkSheet(sheet.id, other.id, suggestAssetMapping({ columns: COLUMNS }), JUN)).sync).toEqual({ added: 3, updated: 0, removed: 0 });
  });

  it("was a bug, fixed (local store): a deleted task stays on its sheet, so the sheet cannot be linked to another task", async () => {
    // Postgres has tracker_sheets.item_id … on delete set null; the local cascade (deleteItemsCascade) leaves it.
    await link();
    await services.items.deleteItems(item.boardId, [item.id], JUN);
    expect((await current()).itemId).toBeNull();
    await services.trackers.linkSheet(sheet.id, other.id, suggestAssetMapping({ columns: COLUMNS }), JUN);
  });

  it("reads its sheet line ids as a pair the store keeps unique", async () => {
    await link();
    const line = (await sheetLines())[0]!;
    await expect(
      repos.itemAssets.createMany([{ itemId: item.id, boardId: item.boardId, name: "Dup", trackerSheetId: sheet.id, trackerRowId: line.trackerRowId, createdBy: JUN }]),
    ).rejects.toThrow("That sheet row already has an asset line");
  });

  it("lists sheet lines after the task's own lines, whatever order they were added in", async () => {
    await link();
    await services.assets.add({ itemId: item.id, boardId: item.boardId, name: "Own" }, JUN);
    const all: ItemAsset[] = await services.assets.list(item.id);
    expect(all[0]!.name).toBe("Own");
    expect(all.slice(1).every((l) => l.trackerSheetId === sheet.id)).toBe(true);
  });
});

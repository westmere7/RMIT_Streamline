import { describe, expect, it } from "vitest";
import type { AssetRates, TagOption } from "@/domain";
import { addRow, describeDraft, draftCommit, draftDirty, listChanged, liveRows, ratesChangedFrom, removeRow, renameRow, rowsFromOptions } from "@/features/workspace/list-draft";

const OPTIONS: TagOption[] = [
  { name: "Print", color: "orange" },
  { name: "Social", color: "pink" },
  { name: "Video", color: "violet" },
];

const RATES: AssetRates = {
  Print: { qty: 4, every: 1, per: "day" },
  Social: { qty: 8, every: 1, per: "day" },
};

const rows = () => rowsFromOptions(OPTIONS);
const idOf = (name: string) => rowsFromOptions(OPTIONS).find((row) => row.name === name)!.id;

/**
 * The Lists draft, and the one thing combining the list with its values was
 * for: a rate is keyed by its type's name, so a rename has to carry the rate
 * along and a removal has to take it away. When the two lived in separate
 * editors they drifted, and the dashboard quietly stopped counting hours it
 * should have counted. These pin that they move together.
 */
describe("renaming a row", () => {
  it("takes the rate with it", () => {
    const result = renameRow(rows(), RATES, idOf("Print"), "Large format");
    expect("refused" in result).toBe(false);
    if ("refused" in result) return;

    expect(result.rows.map((row) => row.name)).toEqual(["Large format", "Social", "Video"]);
    // The rate followed the name, and did not stay behind under the old one.
    expect(result.rates["Large format"]).toEqual({ qty: 4, every: 1, per: "day" });
    expect(result.rates.Print).toBeUndefined();
    // Everyone else is untouched.
    expect(result.rates.Social).toEqual(RATES.Social);
  });

  it("keeps the stored name as the origin, so the rename can reach the work", () => {
    const result = renameRow(rows(), RATES, idOf("Print"), "Large format");
    if ("refused" in result) throw new Error("refused");
    const commit = draftCommit(result.rows, result.rates);
    // The server is told Print → Large format; it has never heard of the new word.
    expect(commit.renames).toEqual({ Print: "Large format" });
    expect(commit.rates["Large format"]).toBeDefined();
  });

  it("carries nothing when the row had no rate", () => {
    const result = renameRow(rows(), RATES, idOf("Video"), "Film");
    if ("refused" in result) throw new Error("refused");
    expect(result.rates).toEqual(RATES);
    expect(Object.keys(result.rates)).not.toContain("Film");
  });

  it("survives two renames of the same row", () => {
    const first = renameRow(rows(), RATES, idOf("Print"), "Large format");
    if ("refused" in first) throw new Error("refused");
    const second = renameRow(first.rows, first.rates, idOf("Print"), "Wide format");
    if ("refused" in second) throw new Error("refused");

    expect(second.rates["Wide format"]).toEqual(RATES.Print);
    expect(second.rates["Large format"]).toBeUndefined();
    // Still reported against the word the server stores.
    expect(draftCommit(second.rows, second.rates).renames).toEqual({ Print: "Wide format" });
  });

  it("refuses a name the list already has, or an empty one", () => {
    expect(renameRow(rows(), RATES, idOf("Print"), "Social")).toEqual({ refused: "duplicate" });
    expect(renameRow(rows(), RATES, idOf("Print"), "  social  ")).toEqual({ refused: "duplicate" });
    expect(renameRow(rows(), RATES, idOf("Print"), "   ")).toEqual({ refused: "empty" });
    expect(renameRow(rows(), RATES, idOf("Print"), "Print")).toEqual({ refused: "unchanged" });
  });

  it("allows a name a removed row is holding", () => {
    // Social is on its way out, so its word is free.
    const marked = removeRow(rows(), idOf("Social"), {});
    const result = renameRow(marked, RATES, idOf("Print"), "Social");
    expect("refused" in result).toBe(false);
  });
});

describe("removing a row", () => {
  it("takes the rate away with the word", () => {
    const marked = removeRow(rows(), idOf("Print"), { replaceWith: "Social" });
    const commit = draftCommit(marked, RATES);
    expect(commit.options.map((option) => option.name)).toEqual(["Social", "Video"]);
    expect(commit.rates.Print).toBeUndefined();
    expect(commit.rates.Social).toEqual(RATES.Social);
    expect(commit.removals).toEqual([{ name: "Print", removal: { replaceWith: "Social" } }]);
  });

  it("keeps a stored row visible, so Discard can bring it back", () => {
    const marked = removeRow(rows(), idOf("Print"), {});
    expect(marked).toHaveLength(3);
    expect(marked.find((row) => row.name === "Print")!.removal).toEqual({});
    expect(liveRows(marked).map((row) => row.name)).toEqual(["Social", "Video"]);
  });

  it("drops a row that was only ever in the draft, with nothing to tell the server", () => {
    const added = addRow(rows(), "Motion", "teal");
    if ("refused" in added) throw new Error("refused");
    const marked = removeRow(added, added[3]!.id, {});
    expect(marked).toHaveLength(3);
    expect(draftCommit(marked, RATES).removals).toEqual([]);
  });
});

describe("adding a row", () => {
  it("comes in unrated, which reads as not specified", () => {
    const added = addRow(rows(), "Motion", "teal");
    if ("refused" in added) throw new Error("refused");
    const commit = draftCommit(added, RATES);
    expect(commit.options.map((o) => o.name)).toContain("Motion");
    expect(commit.rates.Motion).toBeUndefined();
    // Nothing to rename: the server has never stored it.
    expect(commit.renames).toEqual({});
  });

  it("refuses a duplicate however it was capitalised", () => {
    expect(addRow(rows(), "print", "teal")).toEqual({ refused: "duplicate" });
    expect(addRow(rows(), " ", "teal")).toEqual({ refused: "empty" });
  });
});

describe("the commit", () => {
  it("drops a rate whose type is gone, and keeps the rest", () => {
    // A rate left over from a type nobody removed through this editor.
    const stale: AssetRates = { ...RATES, Ghost: { qty: 1, every: 1, per: "day" } };
    expect(draftCommit(rows(), stale).rates.Ghost).toBeUndefined();
    expect(draftCommit(rows(), stale).rates.Print).toEqual(RATES.Print);
  });

  it("writes rates back through the normaliser", () => {
    const junk = { ...RATES, Video: { qty: 0, every: 1, per: "day" as const } };
    // A zero rate has one representation: an absent key.
    expect(draftCommit(rows(), junk).rates.Video).toBeUndefined();
  });
});

describe("dirty and what Save will do", () => {
  it("is clean when nothing has been touched", () => {
    const commit = draftCommit(rows(), RATES);
    expect(draftDirty(commit, OPTIONS, RATES, true)).toBe(false);
    expect(draftDirty(commit, OPTIONS, RATES, false)).toBe(false);
  });

  it("notices a rate change even when the list itself is untouched", () => {
    const changed: AssetRates = { ...RATES, Video: { qty: 1, every: 2, per: "week" } };
    const commit = draftCommit(rows(), changed);
    expect(draftDirty(commit, OPTIONS, RATES, true)).toBe(true);
    // A list that carries no values cannot be dirtied by one.
    expect(draftDirty(commit, OPTIONS, RATES, false)).toBe(false);
  });

  it("notices a colour, a rename and a removal", () => {
    const recoloured = rows().map((row) => (row.name === "Print" ? { ...row, color: "red" as const } : row));
    expect(draftDirty(draftCommit(recoloured, RATES), OPTIONS, RATES, true)).toBe(true);

    const renamed = renameRow(rows(), RATES, idOf("Print"), "Large format");
    if ("refused" in renamed) throw new Error("refused");
    expect(draftDirty(draftCommit(renamed.rows, renamed.rates), OPTIONS, RATES, true)).toBe(true);

    const removed = removeRow(rows(), idOf("Print"), {});
    expect(draftDirty(draftCommit(removed, RATES), OPTIONS, RATES, true)).toBe(true);
  });

  it("says what is about to happen", () => {
    const added = addRow(rows(), "Motion", "teal");
    if ("refused" in added) throw new Error("refused");
    const marked = removeRow(added, idOf("Video"), {});
    expect(describeDraft(draftCommit(marked, RATES), OPTIONS, false)).toBe("Unsaved: 1 added, 1 to remove.");
    expect(describeDraft(draftCommit(rows(), RATES), OPTIONS, true)).toBe("Unsaved: rates changed.");
  });
});

/**
 * Writing the list and writing a rate cost wildly different amounts — a list
 * save rewrites every row and then makes every board re-read its items and
 * deliverables. So the editor asks the two questions separately and writes only
 * the half that changed; filling in a rate used to pay for all of it.
 */
describe("what a save actually has to write", () => {
  it("says the list is untouched when only a rate moved", () => {
    const changed: AssetRates = { ...RATES, Video: { qty: 1, every: 2, per: "week" } };
    const commit = draftCommit(rows(), changed);
    expect(listChanged(commit, OPTIONS)).toBe(false);
    expect(ratesChangedFrom(commit, RATES)).toBe(true);
  });

  it("says the rates are untouched when only a word moved", () => {
    const recoloured = rows().map((row) => (row.name === "Print" ? { ...row, color: "red" as const } : row));
    const commit = draftCommit(recoloured, RATES);
    expect(listChanged(commit, OPTIONS)).toBe(true);
    expect(ratesChangedFrom(commit, RATES)).toBe(false);
  });

  it("counts a rename as both, because the rate travels with the word", () => {
    const renamed = renameRow(rows(), RATES, idOf("Print"), "Large format");
    if ("refused" in renamed) throw new Error("refused");
    const commit = draftCommit(renamed.rows, renamed.rates);
    expect(listChanged(commit, OPTIONS)).toBe(true);
    expect(ratesChangedFrom(commit, RATES)).toBe(true);
  });

  it("counts a removal as both when the removed word had a rate", () => {
    const withRate = draftCommit(removeRow(rows(), idOf("Print"), {}), RATES);
    expect(listChanged(withRate, OPTIONS)).toBe(true);
    expect(ratesChangedFrom(withRate, RATES)).toBe(true);

    // Video has no rate, so its removal changes the list and nothing else.
    const withoutRate = draftCommit(removeRow(rows(), idOf("Video"), {}), RATES);
    expect(listChanged(withoutRate, OPTIONS)).toBe(true);
    expect(ratesChangedFrom(withoutRate, RATES)).toBe(false);
  });

  it("writes nothing at all when nothing changed", () => {
    const commit = draftCommit(rows(), RATES);
    expect(listChanged(commit, OPTIONS)).toBe(false);
    expect(ratesChangedFrom(commit, RATES)).toBe(false);
  });
});

/**
 * The stranded rename.
 *
 * A draft that never stops claiming a rename it has already made never goes
 * clean, so the editor never reseeds it, so its rows keep an `origin` the
 * server has replaced. The next rename of such a row is reported against a word
 * the server has never heard of, `rewrite` matches nothing, and the deliverables
 * keep the old asset type while the list moves on. That is how 27 deliverables
 * ended up on "Copies" while the list said "Copy" — and how the dashboard came
 * to report "no rate yet for Copies" about a type that had one.
 */
describe("a rename that has already landed", () => {
  const RENAMED: TagOption[] = [
    { name: "Copy", color: "orange" },
    { name: "Social", color: "pink" },
    { name: "Video", color: "violet" },
  ];

  /** The draft immediately after saving Copies -> Copy, before any reseed. */
  const afterSaving = () => {
    const result = renameRow(rows(), RATES, idOf("Print"), "Copy");
    if ("refused" in result) throw new Error("refused");
    return result;
  };

  it("is still outstanding while the server has the old word", () => {
    const { rows: draft, rates } = afterSaving();
    // Stored still says "Print": the rename has not been written yet.
    expect(draftCommit(draft, rates, OPTIONS).renames).toEqual({ Print: "Copy" });
  });

  it("stops being claimed once the server carries the new word", () => {
    const { rows: draft, rates } = afterSaving();
    // The save landed, so the stored list says "Copy". There is nothing left to
    // tell the server, and repeating it would be a rename from a word it has
    // never heard of.
    expect(draftCommit(draft, rates, RENAMED).renames).toEqual({});
  });

  it("lets the draft go clean after a save, which is what triggers the reseed", () => {
    const { rows: draft, rates } = afterSaving();
    const landed = draftCommit(draft, rates, RENAMED);
    // Clean against the list as it now stands — so the editor reseeds and the
    // rows pick up an `origin` that exists.
    expect(listChanged(landed, RENAMED)).toBe(false);
    expect(draftDirty(landed, RENAMED, { ...RATES, Copy: RATES.Print!, Print: undefined as never }, false)).toBe(false);
  });

  it("reports the second rename against the word the server actually has", () => {
    // The sequence that stranded the data: rename, save, then rename again.
    // With the draft reseeded from the saved list, the row's origin is "Copy",
    // so the second rename is reported as Copy -> Copies and reaches the
    // deliverables. Before the fix the origin was still "Print" and the server
    // was told to rewrite a word nothing carried.
    const reseeded = rowsFromOptions(RENAMED);
    const second = renameRow(reseeded, RATES, "Copy", "Copies");
    if ("refused" in second) throw new Error("refused");
    expect(draftCommit(second.rows, second.rates, RENAMED).renames).toEqual({ Copy: "Copies" });
  });

  it("does not try to remove a word the server has already lost", () => {
    const { rows: draft } = afterSaving();
    const marked = removeRow(draft, idOf("Print"), {});
    // Its origin is gone from the stored list, so there is nothing to remove
    // there — sending it would be a removal of a word the server does not have.
    expect(draftCommit(marked, RATES, RENAMED).removals).toEqual([]);
    // Against the list that still has it, the removal stands.
    expect(draftCommit(marked, RATES, OPTIONS).removals).toEqual([{ name: "Print", removal: {} }]);
  });

  it("takes a first save at face value, when the server has written no list yet", () => {
    // A list nobody has edited has no stored rows at all; the domain stands the
    // defaults in for it. Every claimed rename is then genuinely outstanding.
    const { rows: draft, rates } = afterSaving();
    expect(draftCommit(draft, rates, []).renames).toEqual({ Print: "Copy" });
  });
});

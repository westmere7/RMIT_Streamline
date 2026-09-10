import type { AssetRates, ColorToken, TagOption } from "@/domain";
import { normaliseAssetRates } from "@/domain";

/**
 * A list being edited, before any of it is written.
 *
 * The Lists editor holds every change as a draft — names, colours, rates,
 * additions, removals — and commits them in one go. The arithmetic of that is
 * here rather than in the component because one part of it is genuinely easy to
 * get wrong: a rate is keyed by its type's *name*, so renaming a type has to
 * carry its rate along, and removing one has to take its rate away. Miss either
 * and the dashboard quietly loses hours it should be counting, which is the one
 * failure the effort figure was built to avoid.
 */
export interface DraftRow {
  /** Stable across renames, so React and the removal dialog can hold onto a row. */
  id: string;
  /**
   * The name this row is stored under; null for one that exists only in the
   * draft. A rename is reported against it and a removal names it on the
   * server — the current name is a word the server has never heard.
   */
  origin: string | null;
  name: string;
  color: ColorToken;
  /** Set when marked for removal, carrying what happens to work using the word. */
  removal?: { replaceWith?: string | null };
}

export const rowsFromOptions = (options: readonly TagOption[]): DraftRow[] =>
  options.map((option) => ({ id: option.name, origin: option.name, name: option.name, color: option.color }));

/** The rows that will still be in the list after a commit. */
export const liveRows = (rows: readonly DraftRow[]): DraftRow[] => rows.filter((row) => !row.removal);

/** Why a rename was refused, or null when it is fine. */
export type RenameRefusal = "empty" | "duplicate" | "unchanged";

/**
 * Renames a row and moves its rate with it.
 *
 * Returns the refusal instead of throwing, so the caller can say why: a blank
 * name, a word the list already has, or no change at all.
 */
export function renameRow(
  rows: readonly DraftRow[],
  rates: AssetRates,
  id: string,
  raw: string,
): { rows: DraftRow[]; rates: AssetRates } | { refused: RenameRefusal } {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return { refused: "unchanged" };
  const name = raw.trim();
  if (!name) return { refused: "empty" };
  if (name === row.name) return { refused: "unchanged" };
  if (rows.some((other) => other.id !== id && !other.removal && other.name.toLowerCase() === name.toLowerCase())) return { refused: "duplicate" };

  const next = { ...rates };
  const rate = next[row.name];
  if (rate) {
    delete next[row.name];
    next[name] = rate;
  }
  return { rows: rows.map((other) => (other.id === id ? { ...other, name } : other)), rates: next };
}

/** Adds a word, or refuses one the list already has. */
export function addRow(rows: readonly DraftRow[], raw: string, color: ColorToken): DraftRow[] | { refused: RenameRefusal } {
  const name = raw.trim();
  if (!name) return { refused: "empty" };
  if (rows.some((row) => !row.removal && row.name.toLowerCase() === name.toLowerCase())) return { refused: "duplicate" };
  return [...rows, { id: `new:${name}:${rows.length}`, origin: null, name, color }];
}

/**
 * Marks a row for removal, or drops it outright.
 *
 * A row that was never saved has nothing on the server to remove and nothing
 * carrying its word, so it simply leaves the draft. A stored one is kept
 * visible with what is about to become of it, so Discard can bring it back.
 */
export function removeRow(rows: readonly DraftRow[], id: string, removal: { replaceWith?: string | null }): DraftRow[] {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return [...rows];
  if (!row.origin) return rows.filter((other) => other.id !== id);
  return rows.map((other) => (other.id === id ? { ...other, removal } : other));
}

/** Everything one commit has to write, worked out while the draft still explains itself. */
export interface DraftCommit {
  options: TagOption[];
  /** Stored name → new name, which is how the rename reaches the work carrying it. */
  renames: Record<string, string>;
  removals: Array<{ name: string; removal: { replaceWith?: string | null } }>;
  /** Pruned to the surviving names, so a removed type takes its rate with it. */
  rates: AssetRates;
}

/**
 * Everything one commit has to write.
 *
 * `stored` is what the list looks like on the server *right now*, and it is what
 * decides whether a row's rename is still outstanding. A rename is only a
 * rename while the server still has the old word: once a save lands, the stored
 * list carries the new one, and a draft row that goes on claiming
 * "Copies → Copy" is describing something that has already happened.
 *
 * That distinction is not pedantry — it was a bug. A draft that never stopped
 * claiming a landed rename never went clean, so the editor never reseeded it,
 * so the row kept an `origin` that no longer existed. The next rename of that
 * row was then reported against a word the server had never heard of, `rewrite`
 * matched nothing, and the deliverables kept the old asset type while the list
 * moved on — which is exactly how "Copies" ended up stranded on 27 deliverables
 * while the list said "Copy".
 */
export function draftCommit(rows: readonly DraftRow[], rates: AssetRates, stored: readonly TagOption[] = []): DraftCommit {
  const live = liveRows(rows);
  const surviving = new Set(live.map((row) => row.name.trim().toLowerCase()));
  const known = new Set(stored.map((option) => option.name));
  // With no stored list to check against, every claimed rename is taken at face
  // value — the first save of a list the server has never written.
  const outstanding = (row: DraftRow) => !!row.origin && row.origin !== row.name && (known.size === 0 || known.has(row.origin));
  return {
    options: live.map((row) => ({ name: row.name, color: row.color })),
    renames: Object.fromEntries(live.filter(outstanding).map((row) => [row.origin!, row.name])),
    removals: rows.filter((row) => row.removal && row.origin && (known.size === 0 || known.has(row.origin))).map((row) => ({ name: row.origin!, removal: row.removal! })),
    rates: normaliseAssetRates(Object.fromEntries(Object.entries(rates).filter(([name]) => surviving.has(name.trim().toLowerCase())))),
  };
}

/** What Save is about to do, so the button is never a mystery. */
export function describeDraft(commit: DraftCommit, stored: readonly TagOption[], ratesChanged: boolean): string {
  const colours = new Map(stored.map((option) => [option.name, option.color]));
  const added = commit.options.filter((option) => !colours.has(option.name) && !Object.values(commit.renames).includes(option.name)).length;
  const recoloured = Object.entries(commit.renames).length === 0 ? commit.options.filter((option) => colours.has(option.name) && colours.get(option.name) !== option.color).length : 0;

  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  const renamed = Object.keys(commit.renames).length;
  if (renamed) parts.push(`${renamed} renamed`);
  if (commit.removals.length) parts.push(`${commit.removals.length} to remove`);
  if (recoloured) parts.push(`${recoloured} recoloured`);
  if (ratesChanged) parts.push("rates changed");
  return parts.length ? `Unsaved: ${parts.join(", ")}.` : "Unsaved changes.";
}

/**
 * True when the *list* has changed — a word added, renamed, recoloured or on its
 * way out.
 *
 * Asked separately from the rates because writing the list is expensive and
 * writing a rate is not: a list save rewrites every row of the list and tells
 * every board its vocabulary moved, which means re-reading the workspace's
 * items and deliverables. Filling in a rate must not pay for any of that.
 */
export function listChanged(commit: DraftCommit, stored: readonly TagOption[]): boolean {
  if (commit.removals.length > 0) return true;
  if (Object.keys(commit.renames).length > 0) return true;
  return JSON.stringify(commit.options.map((option) => [option.name, option.color])) !== JSON.stringify(stored.map((option) => [option.name, option.color]));
}

/** True when the rates differ from what is stored. */
export function ratesChangedFrom(commit: DraftCommit, storedRates: AssetRates): boolean {
  return JSON.stringify(commit.rates) !== JSON.stringify(normaliseAssetRates(storedRates));
}

/** True when the draft says something the stored list does not. */
export function draftDirty(commit: DraftCommit, stored: readonly TagOption[], storedRates: AssetRates, carriesRates: boolean): boolean {
  return listChanged(commit, stored) || (carriesRates && ratesChangedFrom(commit, storedRates));
}

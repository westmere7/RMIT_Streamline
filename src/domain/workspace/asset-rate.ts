/**
 * Output rates, and the effort they turn deliverables into.
 *
 * A count of deliverables says how many things there are, not how much work
 * they are. Three hundred photo edits and ten campaign films are not a 30:1
 * difference in output, and a chart that says so is worse than no chart. An
 * output rate records how fast the team finishes one *type* of thing — "8 photo
 * edits a day", "1 film every 2 weeks" — and effort is the count weighted by it.
 *
 * Everything here is derived at render time. No deliverable stores an hours
 * figure, nothing is written back, and the rates themselves live in workspace
 * settings — so correcting a rate re-reads history rather than rewriting it, and
 * every other number in the app goes on counting deliverables exactly as before.
 *
 * A type with no rate contributes nothing rather than a guessed default: an
 * invented rate would quietly fabricate workload, and a total nobody can trust
 * is worse than one that admits what it is missing. `unratedTypes` names them so
 * the page can say so out loud.
 */

/** Time bases a rate can be expressed against, in picker order. */
export const RATE_UNITS = ["hour", "day", "week"] as const;
export type RatePer = (typeof RATE_UNITS)[number];

/**
 * How fast one asset type is produced: `qty` finished every `every` × `per`.
 *
 * "3 posters every 2 days" is `{ qty: 3, every: 2, per: "day" }`. Both numbers
 * are always above zero — an unset rate is an *absent key*, never a stored
 * zero, so "not specified" has exactly one representation.
 */
export interface AssetRate {
  qty: number;
  every: number;
  per: RatePer;
}

/**
 * Rates keyed by asset-type name, matching the workspace's ASSET_TYPES list.
 * Keyed by name rather than id because that list is rewritten whole on every
 * save and its rows have no durable identity. An absent key means unrated.
 */
export type AssetRates = Record<string, AssetRate>;

/**
 * Hours in one working day, for turning a per-day rate into hours.
 *
 * A rate is a statement about working time, not wall-clock time: "8 a day"
 * means a day at work, so a day is eight hours and a week is five of those.
 * Both are assumptions, which is why they are named here rather than spelled as
 * bare numbers in a formula.
 */
export const HOURS_PER_WORKING_DAY = 8;

/** Working days in one week, for the same reason. */
export const WORKING_DAYS_PER_WEEK = 5;

const RATE_UNIT_HOURS: Record<RatePer, number> = {
  hour: 1,
  day: HOURS_PER_WORKING_DAY,
  week: HOURS_PER_WORKING_DAY * WORKING_DAYS_PER_WEEK,
};

/** Singular and plural for the rate unit, for the picker and the hints. */
export const RATE_UNIT_LABELS: Record<RatePer, { one: string; many: string }> = {
  hour: { one: "hour", many: "hours" },
  day: { one: "day", many: "days" },
  week: { one: "week", many: "weeks" },
};

/** The `per` unit pluralised for a span length: (2, "day") → "days". */
export function rateUnitLabel(every: number, per: RatePer): string {
  return every === 1 ? RATE_UNIT_LABELS[per].one : RATE_UNIT_LABELS[per].many;
}

/**
 * Hours one unit takes at this rate — the basis of every effort figure.
 *
 * Zero for a missing or nonsensical rate, so an unrated type contributes
 * nothing instead of a guess.
 */
export function hoursPerUnit(rate: AssetRate | undefined | null): number {
  if (!rate || !Number.isFinite(rate.qty) || !Number.isFinite(rate.every) || rate.qty <= 0 || rate.every <= 0) return 0;
  return (rate.every * RATE_UNIT_HOURS[rate.per]) / rate.qty;
}

/**
 * Cleans a stored rates value into a map that can be trusted.
 *
 * Junk-tolerant, like the workspace's other stored blobs: this reads whatever
 * is in a jsonb column, including something written by an older version or by
 * hand. An entry whose numbers do not make sense is dropped rather than
 * repaired, because a dropped rate reads as "not specified" — which is true and
 * visible — where a repaired one would be a number nobody chose. A missing
 * `every` reads as 1, so a rate written before spans existed still loads.
 */
export function normaliseAssetRates(raw: unknown): AssetRates {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: AssetRates = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!name.trim() || !value || typeof value !== "object") continue;
    const rate = value as Partial<AssetRate>;
    const qty = Number(rate.qty);
    const every = rate.every === undefined ? 1 : Number(rate.every);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!Number.isFinite(every) || every <= 0) continue;
    const per = (RATE_UNITS as readonly string[]).includes(rate.per as string) ? (rate.per as RatePer) : "day";
    out[name.trim()] = { qty, every, per };
  }
  return out;
}

/** True when at least one type has a rate — what makes an effort figure worth showing. */
export function hasAnyRate(rates: AssetRates | null | undefined): boolean {
  return !!rates && Object.keys(rates).length > 0;
}

/**
 * Effort in hours for a set of deliverables: Σ (units × hours per unit).
 *
 * `type` is matched case-insensitively against the rate keys, because the
 * ASSET_TYPES list and the tags written on a deliverable are both free text
 * that people capitalise differently.
 */
export function effortHours(lines: readonly { type: string; units: number }[], rates: AssetRates): number {
  const byName = ratesByLowerName(rates);
  let hours = 0;
  for (const line of lines) {
    const rate = byName.get(line.type.trim().toLowerCase());
    if (!rate) continue;
    const units = Number(line.units) || 0;
    if (units > 0) hours += units * hoursPerUnit(rate);
  }
  return hours;
}

/**
 * The asset types carrying volume here that have no rate.
 *
 * Exactly the types an effort total leaves out, so the page can name them
 * rather than presenting a quietly incomplete number as a complete one.
 */
export function unratedTypes(lines: readonly { type: string; units: number }[], rates: AssetRates): string[] {
  const byName = ratesByLowerName(rates);
  const out = new Map<string, string>();
  for (const line of lines) {
    const name = line.type.trim();
    if (!name) continue;
    if ((Number(line.units) || 0) <= 0) continue;
    if (byName.has(name.toLowerCase())) continue;
    if (!out.has(name.toLowerCase())) out.set(name.toLowerCase(), name);
  }
  return [...out.values()].sort((a, b) => a.localeCompare(b));
}

function ratesByLowerName(rates: AssetRates): Map<string, AssetRate> {
  return new Map(Object.entries(rates).map(([name, rate]) => [name.trim().toLowerCase(), rate]));
}

/**
 * Hours as a compact label — "1,240 h", "6.5 h". Display only.
 *
 * Rounded to whole hours once there are enough of them that a decimal is noise,
 * and to one decimal below that, where the difference between 6 and 6.5 hours
 * is the difference between a morning and a day.
 */
export function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return "0 h";
  // Real work never reads as none. A per-unit rate can be a couple of minutes
  // (a printed copy at 240 a day is 0.03 h), and rounding that to "0 h" is the
  // same lie the effort figure exists to avoid — so "0 h" is reserved for
  // genuinely nothing.
  if (hours < 0.05) return "<0.1 h";
  const value = hours >= 100 ? Math.round(hours) : Math.round(hours * 10) / 10;
  return `${value.toLocaleString()} h`;
}

/**
 * "≈ 40 min each" — one unit's time in words, for the hint beside a rate.
 *
 * Its job is to make a typo obvious: a rate that reads "≈ 2 min each" for a
 * campaign film is wrong in a way the numbers alone do not show.
 */
export function perUnitHint(rate: AssetRate | undefined | null): string | null {
  const hours = hoursPerUnit(rate);
  if (hours <= 0) return null;
  if (hours < 1) return `≈ ${Math.round(hours * 60)} min each`;
  if (hours < HOURS_PER_WORKING_DAY) return `≈ ${Math.round(hours * 10) / 10} h each`;
  const days = hours / HOURS_PER_WORKING_DAY;
  return `≈ ${Math.round(days * 10) / 10} ${days === 1 ? "day" : "days"} each`;
}

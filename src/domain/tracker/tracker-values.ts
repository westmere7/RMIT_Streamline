import type { TrackerCellValue } from "@/domain/tracker/tracker";

/**
 * Reading a cell as a date or a count whatever column it sits in: the sheet's
 * own typing (TrackerService.coerce) and the task's assets read the same way,
 * so a due date typed as text or pasted from Excel still counts.
 */

/** A Gregorian date that exists (no 2026-02-30, no month 25). */
export function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1000 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The calendar day a locally parsed date names (Date reads "Sep 14, 2026" as local midnight). */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Excel stores dates as days since 1899-12-30. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

/** Days Excel counts for 1954 to 2119: digits outside it are a number, not a date. */
const isExcelSerial = (n: number) => n >= 20000 && n <= 80000;

/**
 * A cell as a date (YYYY-MM-DD), or null when it is none. Nothing is guessed:
 * 2026-03-14, 14/03/2026 (day first), 14.3.26, an Excel day number, or a date
 * written out with its year ("14 March 2026", "Mar 14, 2026"). "Next week",
 * "14/03" and 2026-02-30 are not.
 */
export function readDate(raw: TrackerCellValue | undefined): string | null {
  if (typeof raw === "number") return Number.isFinite(raw) && isExcelSerial(raw) ? toIsoDate(excelSerialToDate(raw)) : null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return isRealDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? s : null;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (dmy) {
    const year = dmy[3]!.length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const month = Number(dmy[2]);
    const day = Number(dmy[1]);
    return isRealDate(year, month, day) ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return isExcelSerial(Number(s)) ? toIsoDate(excelSerialToDate(Number(s))) : null;
  if (!/\b\d{4}\b/.test(s)) return null;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : localIsoDate(parsed);
}

/** The largest quantity item_assets.quantity (a SQL integer) holds. */
export const MAX_QUANTITY = 2147483647;

/**
 * A cell as a whole count, or null: 3, "3", "1,200", "3 pcs", "x3", "3x".
 * Not "three", "-2", "0x10" or "1e3", and nothing past what the database holds.
 */
export function readQuantity(raw: TrackerCellValue | undefined): number | null {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string") {
    const s = raw
      .trim()
      .replace(/^[x×]\s*/i, "")
      .replace(/\s*(?:[x×]|pcs?|pieces?|units?|ea|each)\.?$/i, "")
      .replace(/[,\s]/g, "");
    if (!/^\+?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    n = Number(s);
  } else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  const whole = Math.round(n);
  return whole <= MAX_QUANTITY ? whole : null;
}

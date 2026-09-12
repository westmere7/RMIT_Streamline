import type { BoardColumn, ColumnValue, User } from "@/domain";
import { columnLabels, formatAssetsRecap } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";
import { richTextToPlain } from "@/lib/rich-text";

/**
 * How much of a value an activity line quotes.
 *
 * A status is a word and a brief is a page, and the feed reads the same
 * sentence for both — "changed Brief from … to …". Unquoted, one edit to a
 * brief prints the whole document twice in the feed and stores it twice on the
 * activity row. Eighty characters is about a line on a phone.
 */
export const ACTIVITY_VALUE_MAX = 80;

/**
 * A value as an activity line quotes it: one line, and only the start of it.
 *
 * Never used to decide *whether* something changed — two briefs that differ in
 * their last paragraph share their first line, and an edit nobody recorded is
 * worse than a long one.
 */
export function clipActivityValue(text: string | null | undefined, max = ACTIVITY_VALUE_MAX): string | null {
  if (!text) return text ?? null;
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Human-readable form of a value for activity feeds and notifications. */
export function displayValue(column: BoardColumn, value: ColumnValue | undefined, users: readonly User[]): string | null {
  if (!value) return null;
  switch (value.type) {
    case "STATUS":
    case "DROPDOWN":
    case "PRIORITY": {
      const label = columnLabels(column).find((l) => l.id === value.labelId);
      return label?.name ?? null;
    }
    case "DATE":
      return value.date ? formatShortDate(value.date) : null;
    case "TIMELINE":
      return value.start || value.end ? `${formatShortDate(value.start)} – ${formatShortDate(value.end)}` : null;
    case "PERSON":
    case "PEOPLE":
      return value.userIds.map((id) => users.find((u) => u.id === id)?.displayName ?? "Unknown").join(", ") || null;
    case "TEXT":
    case "LONG_TEXT":
      return value.text || null;
    case "RICH_TEXT":
      return richTextToPlain(value.text) || null;
    case "NUMBER":
      return value.number === null ? null : String(value.number);
    case "CHECKBOX":
      return value.checked ? "Checked" : "Unchecked";
    case "LINK":
      return value.url || null;
    case "TAGS":
      return value.tags.join(", ") || null;
    case "STAKEHOLDER":
      return value.group;
    case "SIZE":
      return value.size;
    case "ASSETS_RECAP":
      return formatAssetsRecap(value) || null;
    case "DEPENDENCY":
      return value.itemIds.length ? `${value.itemIds.length} item(s)` : null;
  }
}

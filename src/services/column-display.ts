import type { BoardColumn, ColumnValue, User } from "@/domain";
import { columnLabels } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";

/** Human-readable form of a value for activity feeds and notifications. */
export function displayValue(column: BoardColumn, value: ColumnValue | undefined, users: readonly User[]): string | null {
  if (!value) return null;
  switch (value.type) {
    case "STATUS":
    case "PRIORITY": {
      const label = columnLabels(column).find((l) => l.id === value.labelId);
      return label?.name ?? null;
    }
    case "DATE":
      return value.date ? formatShortDate(value.date) : null;
    case "TIMELINE":
      return value.start || value.end ? `${formatShortDate(value.start)} – ${formatShortDate(value.end)}` : null;
    case "PERSON":
      return value.userIds.map((id) => users.find((u) => u.id === id)?.displayName ?? "Unknown").join(", ") || null;
    case "TEXT":
    case "LONG_TEXT":
      return value.text || null;
    case "NUMBER":
      return value.number === null ? null : String(value.number);
    case "CHECKBOX":
      return value.checked ? "Checked" : "Unchecked";
    case "LINK":
      return value.url || null;
    case "TAGS":
      return value.tags.join(", ") || null;
    case "FILES":
      return value.files.length ? `${value.files.length} file(s)` : null;
    case "DEPENDENCY":
      return value.itemIds.length ? `${value.itemIds.length} item(s)` : null;
  }
}

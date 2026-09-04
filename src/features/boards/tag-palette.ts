import type { BoardColumn, TagOption } from "@/domain";
import { columnTagOptions } from "@/domain";
import type { BoardSnapshot } from "@/services";
import { tagColorFor } from "@/lib/colors";

/**
 * A TAGS column's palette, followed by any tag that items already use but the
 * palette has not defined yet (seeded data, or a tag removed from the palette).
 * Those get a deterministic colour so the board never shows a colourless tag.
 */
export function tagOptionsFor(column: BoardColumn, values: BoardSnapshot["values"]): TagOption[] {
  const options = columnTagOptions(column);
  const known = new Set(options.map((o) => o.name.toLowerCase()));
  const extras = new Set<string>();
  for (const entry of values) {
    if (entry.columnId !== column.id || entry.value.type !== "TAGS") continue;
    for (const tag of entry.value.tags) if (!known.has(tag.toLowerCase())) extras.add(tag);
  }
  return [...options, ...[...extras].sort().map((name) => ({ name, color: tagColorFor(name) }))];
}

/**
 * Tags are stored without their "#": typing "#urgent" or "urgent" both land as
 * `urgent`, so the hash shown in the UI is never doubled.
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/^#+/, "").trim();
}

/** How a tag reads in the UI. */
export function formatTag(name: string): string {
  return `#${normalizeTagName(name)}`;
}

/** Colour for one tag: the palette's choice, else its deterministic fallback. */
export function tagColor(options: TagOption[], tag: string): TagOption["color"] {
  return options.find((o) => o.name === tag)?.color ?? tagColorFor(tag);
}

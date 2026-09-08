import type { ColorToken, TagOption } from "@/domain";

/** Colours handed out to a choice question's options, in order. */
const OPTION_COLORS: readonly ColorToken[] = ["blue", "orange", "violet", "green", "sky", "amber", "teal", "pink", "rose", "cyan"];

/** "Melbourne, Hanoi, Saigon" → tag options with colours; repeats and blanks dropped. Colours of `existing` options with the same name are kept. */
export function parseOptions(text: string, existing: readonly TagOption[] = []): TagOption[] {
  const seen = new Set<string>();
  const out: TagOption[] = [];
  for (const raw of text.split(",")) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const kept = existing.find((o) => o.name.toLowerCase() === key);
    out.push({ name, color: kept?.color ?? OPTION_COLORS[out.length % OPTION_COLORS.length]! });
  }
  return out;
}

export function optionsToText(options: readonly TagOption[]): string {
  return options.map((o) => o.name).join(", ");
}

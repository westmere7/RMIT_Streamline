"use client";

import { Check, Plus, Settings2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { TagOption } from "@/domain";
import { formatTag, normalizeTagName } from "@/features/boards/tag-palette";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface TagsEditorProps {
  /** Tag names currently on the item. */
  value: string[];
  /** The column's palette, plus any tag already in use on the board. */
  options: TagOption[];
  onChange: (tags: string[]) => void;
  /** Creates a tag on the column's palette and puts it on this item. */
  onCreate?: (name: string) => void;
  onEditTags?: () => void;
}

/**
 * Picks tags from the column's palette. Typing filters the palette and offers to
 * create the tag when nothing matches, so a column's vocabulary grows in place.
 */
export function TagsEditor({ value, options, onChange, onCreate, onEditTags }: TagsEditorProps) {
  const [draft, setDraft] = React.useState("");
  // "#urgent" and "urgent" are the same tag, so match on the bare name.
  const query = normalizeTagName(draft);
  const matches = options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()));
  const exact = options.some((o) => o.name.toLowerCase() === query.toLowerCase());
  const canCreate = !!query && !exact && !!onCreate;

  const toggle = (name: string) => onChange(value.includes(name) ? value.filter((t) => t !== name) : [...value, name]);
  const create = () => {
    if (!canCreate) return;
    onCreate?.(query);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <input
        autoFocus
        aria-label="Find or create a tag"
        placeholder="Find or create a tag"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canCreate) create();
            else if (matches[0]) toggle(matches[0].name);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        className="h-9 w-full rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />

      <ul className="scrollbar-thin max-h-56 space-y-0.5 overflow-y-auto">
        {matches.map((option) => {
          const on = value.includes(option.name);
          return (
            <li key={option.name}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(option.name)}
                className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/70"
              >
                <span className={cn("inline-flex h-6 max-w-[11rem] items-center truncate rounded-md px-2 text-xs font-medium", colorClasses(option.color).soft)}>
                  {formatTag(option.name)}
                </span>
                {on && <Check className="ml-auto size-3.5 text-muted-foreground" />}
              </button>
            </li>
          );
        })}
        {matches.length === 0 && !canCreate && <li className="px-1.5 py-4 text-center text-2xs text-muted-foreground">No tags yet — type to create one.</li>}
      </ul>

      {canCreate && (
        <Button variant="outline" size="sm" className="w-full justify-start" onClick={create}>
          <Plus /> Create “{formatTag(query)}”
        </Button>
      )}
      {onEditTags && (
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onEditTags}>
          <Settings2 /> Edit tags
        </Button>
      )}
    </div>
  );
}

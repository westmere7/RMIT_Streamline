"use client";

import { X } from "lucide-react";
import * as React from "react";

export interface TagsEditorProps {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

export function TagsEditor({ value, suggestions, onChange }: TagsEditorProps) {
  const [draft, setDraft] = React.useState("");
  const add = (tag: string) => {
    const clean = tag.trim();
    if (!clean || value.includes(clean)) return;
    onChange([...value, clean]);
    setDraft("");
  };
  const remaining = suggestions.filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 items-center gap-1 rounded bg-navy-50 pr-1 pl-1.5 text-xs font-medium text-navy-800 dark:bg-navy-500/40 dark:text-navy-100">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="rounded p-0.5 hover:bg-navy-100 dark:hover:bg-navy-500/60">
              <X className="size-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}
      </div>
      <input
        autoFocus
        aria-label="Add a tag"
        placeholder="Type and press Enter"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        className="h-9 w-full rounded-lg border border-border px-2.5 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
      />
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {remaining.slice(0, 12).map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

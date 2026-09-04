"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { BoardGroup } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, columnCellStyle, leadingCellStyle } from "@/features/boards/board-model";
import { cn } from "@/lib/utils";

export function AddItemRow({ group, emptyHint, widthOverrides }: { group: BoardGroup; emptyHint: boolean; widthOverrides: Record<string, number> }) {
  const { mutations, model } = useBoardContext();
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    void mutations.createItem({ groupId: group.id, name });
    setDraft("");
  };

  return (
    <div role="row" className="flex border-b border-border/60" style={{ height: TABLE_LAYOUT.rowHeight }}>
      <div className={cn("sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-background transition-colors", focused && "bg-accent/40")} style={leadingCellStyle()}>
        <span aria-hidden className="h-full w-1.5 bg-transparent" />
        <div style={{ width: TABLE_LAYOUT.selectWidth - 6 + TABLE_LAYOUT.handleWidth }} className="flex items-center justify-end pr-1 text-muted-foreground/60">
          <Plus className="size-3.5" />
        </div>
        <input
          aria-label={`Add item to ${group.name}`}
          data-testid={`add-item-${group.name}`}
          placeholder={emptyHint ? "This group is empty. Add an item to get started." : "Add item"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setDraft("");
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-1.5 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:bg-card focus:ring-2 focus:ring-ring/25"
        />
      </div>
      {model.visibleColumns.map((column) => (
        <div key={column.id} style={columnCellStyle(widthOverrides[column.id] ?? column.width)} />
      ))}
      <div style={{ width: TABLE_LAYOUT.trailingWidth }} />
    </div>
  );
}

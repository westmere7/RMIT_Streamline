"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { BoardGroup } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, leadingWidth } from "@/features/boards/board-model";
import { cn } from "@/lib/utils";

export function AddItemRow({ group, emptyHint }: { group: BoardGroup; emptyHint: boolean }) {
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
    <div role="row" className="flex border-b" style={{ height: TABLE_LAYOUT.rowHeight }}>
      <div className={cn("sticky left-0 z-[4] flex h-full items-center border-r bg-background", focused && "bg-accent/40")} style={{ width: leadingWidth(), minWidth: leadingWidth() }}>
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
          className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/70 focus:rounded-sm focus:bg-background focus:ring-1 focus:ring-ring"
        />
      </div>
      <div style={{ width: model.visibleColumns.reduce((s, c) => s + c.width, 0) + TABLE_LAYOUT.trailingWidth }} />
    </div>
  );
}

"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { BoardGroup } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TicketSpacer } from "@/features/boards/components/table/ticket-cell";
import { columnCellStyle, leadingCellStyle } from "@/features/boards/board-model";
import { useShowTicket, useTableLayout } from "@/features/boards/components/table/table-layout";
import { cn } from "@/lib/utils";

export function AddItemRow({ group, emptyHint, widthOverrides }: { group: BoardGroup; emptyHint: boolean; widthOverrides: Record<string, number> }) {
  const { mutations, model } = useBoardContext();
  const layout = useTableLayout();
  const showTicket = useShowTicket();
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    void mutations.createItem({ groupId: group.id, name });
    setDraft("");
  };

  return (
    <div role="row" className="flex" style={{ height: layout.rowHeight }}>
      <div className={cn("sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-background transition-colors", focused && "bg-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-background))]")} style={leadingCellStyle(showTicket, layout)}>
        <span aria-hidden className="h-full w-1.5 bg-transparent" />
        <div style={{ width: layout.selectWidth - 6 + layout.handleWidth }} className="flex items-center justify-end pr-1 text-muted-foreground/60">
          <Plus className="size-3.5" />
        </div>
        <TicketSpacer />
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
          className="h-8 min-w-0 flex-1 rounded-lg bg-transparent px-1.5 text-[13px] max-md:h-10 max-md:text-[15px] outline-none placeholder:text-muted-foreground/70 focus:bg-card focus:ring-2 focus:ring-ring/25"
        />
      </div>
      {model.visibleColumns.map((column) => (
        <div key={column.id} style={columnCellStyle(widthOverrides[column.id] ?? column.width)} />
      ))}
      <div style={{ width: layout.trailingWidth }} />
    </div>
  );
}

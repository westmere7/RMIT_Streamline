"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Copy, GripVertical, MoreHorizontal, Palette, Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineEdit } from "@/components/shared/inline-edit";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardGroup, Item } from "@/domain";
import { columnLabels } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, leadingWidth } from "@/features/boards/board-model";
import { colorClasses } from "@/lib/colors";
import { cn, pluralize } from "@/lib/utils";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";
import { AddItemRow } from "./add-item-row";
import { ColumnHeaderRow } from "./column-header-row";
import { ItemRow } from "./item-row";

export interface GroupSectionProps {
  group: BoardGroup;
  dndEnabled: boolean;
  widthOverrides: Record<string, number>;
  onWidthOverride: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /** An item is being dragged somewhere on the board. */
  draggingItem?: boolean;
  /**
   * Row index the dragged item would land at in this group, or null when the
   * pointer is elsewhere. The group the drag started in passes null: dnd-kit
   * already opens a gap there.
   */
  dropIndex?: number | null;
}

/**
 * Where the dragged item will land. Drawn as a line in the group's colour across
 * the whole table, in a zero-height wrapper so no row moves when it appears —
 * shifting rows was the laggy part, and a line reads more clearly anyway.
 */
function DropLine({ color }: { color: BoardGroup["color"] }) {
  const colors = colorClasses(color);
  return (
    <div className="relative z-[8] h-0" data-testid="drop-slot" aria-hidden>
      <div className={cn("absolute inset-x-0 -top-[2px] h-[3px] rounded-full", colors.dot)} />
    </div>
  );
}

/** One shared empty list, so a group with no rows keeps a stable identity. */
const NO_ITEMS: Item[] = [];

export function GroupSection({ group, dndEnabled, widthOverrides, onWidthOverride, draggingItem = false, dropIndex = null }: GroupSectionProps) {
  const { board, model, mutations, canEdit } = useBoardContext();
  const ui = useBoardUi(board.id);
  const setSelected = useBoardUiStore((s) => s.setSelected);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const items = model.itemsByGroup.get(group.id) ?? NO_ITEMS;
  // A fresh array here would give SortableContext a new value on every render of
  // this group, and dnd-kit would re-render every row through its context — the
  // memo on ItemRow cannot stop that. Keyed on the item list, which only changes
  // when the board does.
  const itemIds = React.useMemo(() => items.map((i) => i.id), [items]);
  const colors = colorClasses(group.color);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    data: { type: "group", groupId: group.id },
    disabled: !dndEnabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `group-drop:${group.id}`, data: { type: "group-drop", groupId: group.id }, disabled: !dndEnabled });

  const selectedInGroup = items.filter((i) => ui.selectedItemIds.includes(i.id)).length;
  const allSelected = items.length > 0 && selectedInGroup === items.length;
  const toggleAll = (checked: boolean) => {
    const ids = new Set(ui.selectedItemIds);
    for (const item of items) {
      if (checked) ids.add(item.id);
      else ids.delete(item.id);
    }
    setSelected(board.id, [...ids]);
  };

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`Group ${group.name}`}
      className={cn("mb-7", isDragging && "opacity-50")}
      data-testid={`group-${group.name}`}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={!canEdit}>
          <div className="group/group sticky left-0 z-[5] flex h-11 w-fit items-center gap-1 pr-4" style={{ minWidth: leadingWidth() }}>
            <div className="flex w-9 items-center justify-center">
              <button
                type="button"
                aria-label={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
                aria-expanded={!group.collapsed}
                onClick={() => void mutations.updateGroup(group.id, { collapsed: !group.collapsed })}
                className={cn("rounded-lg p-1 transition-colors hover:bg-accent/70", colors.text)}
              >
                {group.collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </div>
            {dndEnabled && (
              <button
                ref={setActivatorNodeRef}
                type="button"
                aria-label={`Drag to reorder ${group.name}`}
                className="flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent/70 hover:text-foreground active:cursor-grabbing"
                {...attributes}
                {...listeners}
              >
                <GripVertical className="size-4" />
              </button>
            )}
            <h3 className={cn("flex min-w-0 items-center text-[15px] font-semibold tracking-tight", colors.text)}>
              <InlineEdit
                value={group.name}
                editing={renaming}
                onEditingChange={setRenaming}
                onSubmit={(name) => void mutations.updateGroup(group.id, { name })}
                trigger="doubleClick"
                disabled={!canEdit}
                ariaLabel="Group name"
                className="max-w-72 rounded-lg px-1.5 hover:bg-accent/70"
                inputClassName="h-8 w-72 text-[15px] font-semibold"
              />
            </h3>
            <span className="ml-1.5 rounded-full bg-surface px-2 py-0.5 text-2xs text-muted-foreground tabular">{pluralize(items.length, "item")}</span>
            {group.collapsed && <StatusSummary itemIds={items.map((i) => i.id)} />}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Options for ${group.name}`}
                    className="ml-1 flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity transition-colors group-hover/group:opacity-100 focus-visible:opacity-100 hover:bg-accent/70 hover:text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <Pencil /> Rename group
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Palette /> Change colour
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="p-2">
                      <ColorPicker value={group.color} onChange={(color) => void mutations.updateGroup(group.id, { color })} />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem onSelect={() => void mutations.updateGroup(group.id, { collapsed: !group.collapsed })}>
                    {group.collapsed ? <ChevronDown /> : <ChevronRight />} {group.collapsed ? "Expand group" : "Collapse group"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void mutations.duplicateGroup(group.id)}>
                    <Copy /> Duplicate group
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => setRenaming(true)}>
            <Pencil /> Rename group
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Palette /> Change colour
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="p-2">
              <ColorPicker value={group.color} onChange={(color) => void mutations.updateGroup(group.id, { color })} />
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onSelect={() => void mutations.updateGroup(group.id, { collapsed: !group.collapsed })}>
            {group.collapsed ? <ChevronDown /> : <ChevronRight />} {group.collapsed ? "Expand group" : "Collapse group"}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void mutations.duplicateGroup(group.id)}>
            <Copy /> Duplicate group
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete group
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {!group.collapsed && (
        <div
          role="grid"
          aria-label={`${group.name} items`}
          /* No overflow-hidden: it would become the scrollport and unpin the frozen
             first column. Rows share the panel background, so square corners
             behind the rounded border are invisible. */
          className="rounded-xl border border-border/60 bg-background shadow-xs"
        >
          <ColumnHeaderRow
            group={group}
            allSelected={allSelected}
            someSelected={selectedInGroup > 0 && !allSelected}
            onToggleAll={toggleAll}
            widthOverrides={widthOverrides}
            onWidthOverride={onWidthOverride}
          />
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {items.map((item, index) => (
              <React.Fragment key={item.id}>
                {dropIndex === index && <DropLine color={group.color} />}
                <ItemRow item={item} group={group} dndEnabled={dndEnabled} widthOverrides={widthOverrides} />
              </React.Fragment>
            ))}
          </SortableContext>
          {/* Landing at the end, and the only line an empty group can show. */}
          {dropIndex !== null && dropIndex >= items.length && <DropLine color={group.color} />}
          {items.length === 0 && !canEdit && dropIndex === null && (
            <div className="sticky left-0 flex h-10 items-center px-12 text-[13px] text-muted-foreground" style={{ width: leadingWidth() }}>
              This group is empty.
            </div>
          )}
          {/* While an item is in flight this strip is the drop zone, so it needs
              a target even in a group with no rows and no add-item row. */}
          <div ref={setDropRef} className={cn(draggingItem && "min-h-10", isOver && dropIndex === null && "bg-accent-soft/40")}>
            {canEdit && <AddItemRow group={group} emptyHint={items.length === 0 && dropIndex === null} widthOverrides={widthOverrides} />}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${group.name}”?`}
        description={items.length > 0 ? `This permanently deletes the group and its ${pluralize(items.length, "item")}.` : "This permanently deletes the group."}
        confirmLabel="Delete group"
        destructive
        onConfirm={() => mutations.deleteGroup(group.id).then(() => undefined)}
      />
    </section>
  );
}

/** Compact status distribution shown for collapsed groups. */
function StatusSummary({ itemIds }: { itemIds: string[] }) {
  const { model } = useBoardContext();
  const column = model.statusColumn;
  if (!column || itemIds.length === 0) return null;
  const counts = new Map<string, number>();
  for (const id of itemIds) {
    const v = model.getValue(id, column.id);
    const labelId = v?.type === "STATUS" ? (v.labelId ?? "none") : "none";
    counts.set(labelId, (counts.get(labelId) ?? 0) + 1);
  }
  const labels = columnLabels(column);
  return (
    <span className="ml-3 flex h-2 w-40 overflow-hidden rounded-full" aria-hidden>
      {labels.map((label) => {
        const count = counts.get(label.id) ?? 0;
        if (!count) return null;
        return <span key={label.id} className={colorClasses(label.color).dot} style={{ width: `${(count / itemIds.length) * 100}%` }} title={`${label.name}: ${count}`} />;
      })}
      {counts.get("none") ? <span className="bg-surface-strong" style={{ width: `${((counts.get("none") ?? 0) / itemIds.length) * 100}%` }} /> : null}
    </span>
  );
}

export { TABLE_LAYOUT, Checkbox };

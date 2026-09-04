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
import type { BoardGroup } from "@/domain";
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
}

export function GroupSection({ group, dndEnabled, widthOverrides, onWidthOverride }: GroupSectionProps) {
  const { board, model, mutations, canEdit } = useBoardContext();
  const ui = useBoardUi(board.id);
  const setSelected = useBoardUiStore((s) => s.setSelected);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const items = model.itemsByGroup.get(group.id) ?? [];
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
      className={cn("mb-6", isDragging && "opacity-50")}
      data-testid={`group-${group.name}`}
    >
      <div className="sticky left-0 z-[5] flex h-10 w-fit items-center gap-1 pr-4" style={{ minWidth: leadingWidth() }}>
        <div className="flex w-9 items-center justify-center">
          <button
            type="button"
            aria-label={group.collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
            aria-expanded={!group.collapsed}
            onClick={() => void mutations.updateGroup(group.id, { collapsed: !group.collapsed })}
            className={cn("rounded p-0.5 hover:bg-accent", colors.text)}
          >
            {group.collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
        {dndEnabled && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag to reorder ${group.name}`}
            className="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground/50 hover:bg-accent hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <h3 className={cn("flex min-w-0 items-center text-sm font-semibold", colors.text)}>
          <InlineEdit
            value={group.name}
            editing={renaming}
            onEditingChange={setRenaming}
            onSubmit={(name) => void mutations.updateGroup(group.id, { name })}
            trigger="doubleClick"
            disabled={!canEdit}
            ariaLabel="Group name"
            className="max-w-72 rounded px-1 hover:bg-accent/70"
            inputClassName="h-7 w-72 text-sm font-semibold"
          />
        </h3>
        <span className="ml-1 text-xs text-muted-foreground tabular">{pluralize(items.length, "item")}</span>
        {group.collapsed && <StatusSummary itemIds={items.map((i) => i.id)} />}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Options for ${group.name}`} className="ml-1 flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
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

      {!group.collapsed && (
        <div role="grid" aria-label={`${group.name} items`} className="border-t">
          <ColumnHeaderRow group={group} allSelected={allSelected} someSelected={selectedInGroup > 0 && !allSelected} onToggleAll={toggleAll} widthOverrides={widthOverrides} onWidthOverride={onWidthOverride} />
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <ItemRow key={item.id} item={item} group={group} dndEnabled={dndEnabled} widthOverrides={widthOverrides} />
            ))}
          </SortableContext>
          {items.length === 0 && !canEdit && (
            <div className="sticky left-0 flex h-9 items-center px-12 text-[13px] text-muted-foreground" style={{ width: leadingWidth() }}>
              This group is empty.
            </div>
          )}
          <div ref={setDropRef} className={cn(isOver && "bg-blue-50/60")}>
            {canEdit && <AddItemRow group={group} emptyHint={items.length === 0} />}
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
    <span className="ml-3 flex h-5 w-40 overflow-hidden rounded-sm" aria-hidden>
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

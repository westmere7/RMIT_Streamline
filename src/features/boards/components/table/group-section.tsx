"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, CircleHelp, Copy, GripVertical, MoreHorizontal, Palette, Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { ColorPicker } from "@/components/shared/color-picker";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineEdit } from "@/components/shared/inline-edit";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { intakeGroupOf } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, leadingCellStyle, leadingWidth } from "@/features/boards/board-model";
import { useShowTicket, useTableLayout } from "@/features/boards/components/table/table-layout";
import { colorClasses } from "@/lib/colors";
import { cn, pluralize } from "@/lib/utils";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

/** One array, so the store selector does not hand back a new one on every render. */
const NO_OVERRIDES: string[] = [];
import { GroupRows } from "./virtual-rows";
import { AddItemRow } from "./add-item-row";
import { ColumnHeaderRow } from "./column-header-row";
import { GroupSummaryRow } from "./group-summary-row";

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
  /** Boundary a dragged column header would land at, or null when none is moving. */
  columnDropIndex?: number | null;
}

/**
 * Where the dragged item will land. Drawn as a line in the group's colour across
 * the whole table, in a zero-height wrapper so no row moves when it appears —
 * shifting rows was the laggy part, and a line reads more clearly anyway.
 */
/** One shared empty list, so a group with no rows keeps a stable identity. */
const NO_ITEMS: Item[] = [];

export function GroupSection({
  group,
  dndEnabled,
  widthOverrides,
  onWidthOverride,
  draggingItem = false,
  dropIndex = null,
  columnDropIndex = null,
}: GroupSectionProps) {
  const { board, model, mutations, canEdit } = useBoardContext();
  const layout = useTableLayout();
  const showTicket = useShowTicket();
  // Folding a group is the board's setting when someone may change the board,
  // and this visit's own business when they may not.
  const overrides = useBoardUiStore((s) => s.boards[board.id]?.collapsedGroupOverrides ?? NO_OVERRIDES);
  const toggleLocally = useBoardUiStore((s) => s.toggleGroupCollapsedLocally);
  const collapsed = canEdit ? group.collapsed : overrides.includes(group.id) !== group.collapsed;
  // Task Allocation's intake group: bookings arrive here, so it can be renamed but not deleted.
  const intake = board.system === "TASK_ALLOCATION" && intakeGroupOf(model.groups)?.id === group.id;
  const toggleCollapsed = () => (canEdit ? void mutations.updateGroup(group.id, { collapsed: !collapsed }) : toggleLocally(board.id, group.id));
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
    // Off while the name is a text field, so dragging across it selects text.
    disabled: !dndEnabled || renaming,
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

  // The group's heading: on its own above the open rows, or as the first
  // cell of the summary row when the group is folded, so a folded group is
  // one line and nothing else.
  const header = (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!canEdit}>
        {/* Opaque: this is pinned to the left, so the row scrolls underneath it. */}
        <div
          className={cn("group/group sticky left-0 z-[5] flex h-11 items-center gap-1 pr-4", intake ? cn(INTAKE_FILL, "rounded-tl-xl") : "bg-background", collapsed ? "h-full rounded-l-xl border-r border-border/60" : "w-fit")}
          style={collapsed ? leadingCellStyle(showTicket, layout) : { minWidth: leadingWidth(showTicket, layout) }}
        >
          <div className="flex w-9 items-center justify-center">
            <button
              type="button"
              aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
              className={cn("rounded-lg p-1 transition-colors hover:bg-accent/70", colors.text)}
            >
              {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
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
          {/* h2: a group is the first division of a board under its name,
              and nothing on the page sits between the two. */}
          <h2 className={cn("flex min-w-0 items-center text-[15px] font-semibold tracking-tight", colors.text)}>
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
          </h2>
          {intake && <IntakeHelp />}
          <span className="ml-1.5 rounded-full bg-surface px-2 py-0.5 text-2xs text-muted-foreground tabular">{pluralize(items.length, "item")}</span>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options for ${group.name}`}
                  className="ml-1 flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity transition-colors group-hover/group:opacity-100 focus-visible:opacity-100 hover:bg-accent/70 hover:text-foreground pointer-coarse:opacity-100"
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
                <DropdownMenuItem onSelect={() => void mutations.duplicateGroup(group.id)}>
                  <Copy /> Duplicate group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {intake ? (
                  <DropdownMenuItem disabled data-testid="group-delete-intake">
                    <Trash2 /> Bookings arrive here
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete group
                  </DropdownMenuItem>
                )}
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
        <ContextMenuItem onSelect={() => void mutations.duplicateGroup(group.id)}>
          <Copy /> Duplicate group
        </ContextMenuItem>
        <ContextMenuSeparator />
        {intake ? (
          <ContextMenuItem disabled>
            <Trash2 /> Bookings arrive here
          </ContextMenuItem>
        ) : (
          <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 /> Delete group
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );

  return (
    <section
      ref={setNodeRef}
      aria-label={`Group ${group.name}`}
      // The intake group sits in a frame of its own colour, header and rows: where bookings arrive.
      // mt-2: as the first group it would start on the scroll area's top edge, which cuts off the frame's top.
      className={cn("mb-7", intake && "mt-2 rounded-2xl border border-[color-mix(in_oklab,var(--intake)_35%,transparent)] px-2 pb-2", intake && INTAKE_FILL, isDragging && "opacity-50")}
      style={{ transform: CSS.Transform.toString(transform), transition, ...(intake ? ({ "--intake": colors.hex } as React.CSSProperties) : {}) }}
      data-testid={`group-${group.name}`}
      data-intake={intake || undefined}
    >
      {/* An open group's title pins to the top of the board while its rows
          scroll past, and the column headers pin under it (top-11). The band
          is full width and opaque, in the board's own backdrop, so rows pass
          behind it rather than showing through beside the title. */}
      {collapsed && items.length > 0 ? (
        <GroupSummaryRow leading={header} items={items} widthOverrides={widthOverrides} />
      ) : (
        <div className={cn("sticky top-0 z-[8]", intake ? cn(INTAKE_FILL, "rounded-t-xl") : "bg-[color-mix(in_srgb,var(--color-surface)_50%,var(--color-background))]")}>{header}</div>
      )}

      {!collapsed && (
        <div
          role="grid"
          aria-label={`${group.name} items`}
          /* No overflow-hidden: it would become the scrollport and unpin the frozen
             first column. Rows share the panel background, so square corners
             behind the rounded border are invisible. */
          className="rounded-xl border border-border/60 bg-background shadow-xs"
        >
          <ColumnHeaderRow
            dropIndex={columnDropIndex}
            group={group}
            allSelected={allSelected}
            someSelected={selectedInGroup > 0 && !allSelected}
            onToggleAll={toggleAll}
            widthOverrides={widthOverrides}
            onWidthOverride={onWidthOverride}
          />
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            <GroupRows group={group} items={items} dndEnabled={dndEnabled} widthOverrides={widthOverrides} dropIndex={dropIndex} dragging={draggingItem} />
          </SortableContext>
          {items.length === 0 && !canEdit && dropIndex === null && (
            <div className="sticky left-0 flex h-10 items-center bg-background px-12 text-[13px] text-muted-foreground" style={{ width: leadingWidth(showTicket, layout) }}>
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

/** The intake frame's fill: opaque, so rows scrolling under the pinned header do not show through. */
const INTAKE_FILL = "bg-[color-mix(in_oklab,var(--intake)_6%,var(--color-background))]";

/** The "?" beside Task Allocation's intake group: what it is, and why not every booking is in it. */
function IntakeHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="About this group" className="ml-0.5 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground" data-testid="intake-help">
          <CircleHelp className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-1.5 text-[13px]" data-testid="intake-help-text">
        <p className="font-medium">New bookings land here.</p>
        <p className="text-muted-foreground">Some skip it and go straight to a team&rsquo;s board, if their service is set to.</p>
        <p className="text-muted-foreground">You can rename it, but not delete it.</p>
      </PopoverContent>
    </Popover>
  );
}

export { TABLE_LAYOUT, Checkbox };

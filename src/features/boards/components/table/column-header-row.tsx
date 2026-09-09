"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ChevronDown, EyeOff, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardColumn, BoardGroup } from "@/domain";
import { COLUMN_TYPE_LABELS } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { ReferenceHeaderCell } from "@/features/boards/components/table/reference-cell";
import { ADDABLE_COLUMN_TYPES, COLUMN_TYPE_PICKER_WIDTH, ColumnTypePicker } from "@/features/boards/components/table/column-type-picker";
import { useSortable } from "@dnd-kit/sortable";
import { TABLE_LAYOUT, columnAlign, columnCellStyle, leadingCellStyle } from "@/features/boards/board-model";
import { colorClasses } from "@/lib/colors";
import { columnSortField, useBoardUi, useBoardUiStore, type SortField } from "@/stores/board-ui-store";
import type { DragData } from "./board-table";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 80;
const MAX_WIDTH = 600;

export interface ColumnHeaderRowProps {
  group: BoardGroup;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  widthOverrides: Record<string, number>;
  onWidthOverride: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /** Boundary a dragged column would land at, or null when none is moving. */
  dropIndex?: number | null;
}

export function ColumnHeaderRow({
  group,
  allSelected,
  someSelected,
  onToggleAll,
  widthOverrides,
  onWidthOverride,
  dropIndex = null,
}: ColumnHeaderRowProps) {
  const { model, canEdit, showReference } = useBoardContext();
  const colors = colorClasses(group.color);
  return (
    <div role="row" className="sticky top-0 z-[6] flex h-10 border-b border-border/60 bg-background text-xs font-medium text-muted-foreground">
      <div className="sticky left-0 z-[7] flex h-full items-center border-r border-border/60 bg-background" style={leadingCellStyle(showReference)}>
        <span aria-hidden className={cn("my-1.5 h-[calc(100%-12px)] w-1 rounded-full", colors.dot)} />
        <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.selectWidth - 6 }}>
          <Checkbox
            aria-label={`Select all items in ${group.name}`}
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(next) => onToggleAll(next === true)}
            disabled={!canEdit}
          />
        </div>
        <div style={{ width: TABLE_LAYOUT.handleWidth }} />
        <ReferenceHeaderCell />
        <ItemHeader />
      </div>
      {model.visibleColumns.map((column, index) => (
        <ColumnHeaderCell
          key={column.id}
          column={column}
          index={index}
          group={group}
          width={widthOverrides[column.id] ?? column.width}
          onWidthOverride={onWidthOverride}
          dropBefore={dropIndex === index}
          dropAfter={dropIndex === model.visibleColumns.length && index === model.visibleColumns.length - 1}
        />
      ))}
      <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.trailingWidth }}>
        {canEdit && <AddColumnMenu />}
      </div>
    </div>
  );
}

/**
 * Clicking a header sorts by that column, the way the members table does: once
 * for ascending, again for descending. The active column shows its arrow; the
 * others reveal a faint one on hover.
 */
function useHeaderSort(field: SortField) {
  const { board } = useBoardContext();
  const sort = useBoardUi(board.id).sort;
  const setSort = useBoardUiStore((s) => s.setSort);
  const active = sort?.field === field;
  const direction = active ? sort.direction : null;
  const toggle = () => setSort(board.id, { field, direction: active && sort.direction === "asc" ? "desc" : "asc" });
  return { active, direction, toggle, ariaSort: (active ? (sort.direction === "asc" ? "ascending" : "descending") : "none") as "ascending" | "descending" | "none" };
}

function SortIcon({ active, direction }: { active: boolean; direction: "asc" | "desc" | null }) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  // Floats beside the label rather than reserving space, so a centred label stays centred.
  return <Icon aria-hidden className={cn("absolute top-1/2 -right-3.5 size-3 -translate-y-1/2", active ? "opacity-100" : "opacity-0 group-hover/sort:opacity-60")} />;
}

function ItemHeader() {
  const { active, direction, toggle, ariaSort } = useHeaderSort("name");
  return (
    <div role="columnheader" aria-sort={ariaSort} className="flex flex-1 items-center px-1">
      <button
        type="button"
        onClick={toggle}
        data-testid="sort-item"
        // Lines up with the item names below, which sit after the subitem chevron.
        className={cn("group/sort relative ml-4 flex h-7 items-center rounded-lg px-2 transition-colors hover:bg-accent/70 hover:text-foreground", active && "text-foreground")}
      >
        Item
        <SortIcon active={active} direction={direction} />
      </button>
    </div>
  );
}

/**
 * Where a dragged column will land: a line in the group's colour down the header
 * boundary, matching the one a row drag draws across the table.
 */
function ColumnDropLine({ color, side }: { color: BoardGroup["color"]; side: "left" | "right" }) {
  return (
    <span
      aria-hidden
      data-testid="column-drop-line"
      className={cn(
        "pointer-events-none absolute inset-y-0 z-[9] w-[3px] rounded-full",
        colorClasses(color).dot,
        side === "left" ? "-left-[2px]" : "-right-[2px]",
      )}
    />
  );
}

function ColumnHeaderCell({
  column,
  index,
  group,
  width,
  onWidthOverride,
  dropBefore,
  dropAfter,
}: {
  column: BoardColumn;
  index: number;
  group: BoardGroup;
  width: number;
  onWidthOverride: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  /** The dragged column would land immediately before this one. */
  dropBefore: boolean;
  /** ...or after it, when it is the last column. */
  dropAfter: boolean;
}) {
  const { model, mutations, canEdit, openEditLabels } = useBoardContext();
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(column.name);
  /** Set while the rename field is being opened from the menu. */
  const renameRequested = React.useRef(false);

  // autoFocus alone is not enough: the menu this was chosen from is still
  // closing, and its focus juggling lands after the field has mounted.
  const renameInput = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!renaming) return;
    const frame = requestAnimationFrame(() => {
      renameInput.current?.focus();
      renameInput.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renaming]);

  const commitRename = () => {
    const name = draft.trim();
    setRenaming(false);
    if (!name || name === column.name) return;
    void mutations.updateColumn(column.id, { name });
  };
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const visible = model.visibleColumns;

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    // A pointer reports fractional pixels on a scaled display; a stored width is
    // a whole number of them, so round before it travels anywhere.
    const widthAt = (e: PointerEvent) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX))));
    const onMove = (e: PointerEvent) => {
      const next = widthAt(e);
      onWidthOverride((prev) => ({ ...prev, [column.id]: next }));
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = widthAt(e);
      onWidthOverride((prev) => {
        const copy = { ...prev };
        delete copy[column.id];
        return copy;
      });
      if (next !== column.width) void mutations.updateColumn(column.id, { width: next });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const move = (delta: number) => {
    const ids = visible.map((c) => c.id);
    const from = ids.indexOf(column.id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, column.id);
    const hidden = model.columns.filter((c) => c.hidden).map((c) => c.id);
    void mutations.reorderColumns([...next, ...hidden]);
  };

  // Dragging a header moves the column. The transform is ignored on purpose:
  // nothing shifts while dragging, a line shows where it will land — the same
  // preview a row drag uses.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: `column:${group.id}:${column.id}`,
    data: { type: "column", columnId: column.id, groupId: group.id, index } satisfies DragData,
    disabled: !canEdit,
  });

  // The header is both the drag handle and the menu button, so the two have to
  // be told apart. Radix opens its menu on pointer down, which would put a menu
  // in front of every drag; the menu is controlled here and opens on a click
  // that did not turn into a drag instead.
  const [menuOpen, setMenuOpen] = React.useState(false);
  const dragged = React.useRef(false);

  const headerSort = useHeaderSort(columnSortField(column.id));

  // Priority is a fixed scale, so there is nothing to edit on it.
  const hasLabels = column.type === "STATUS";
  const hasTags = column.type === "TAGS";
  const insertColumn = (type: (typeof ADDABLE_COLUMN_TYPES)[number]) =>
    void mutations.addColumn(COLUMN_TYPE_LABELS[type], type, { afterColumnId: column.id });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!canEdit}>
        <div
          ref={setNodeRef}
          role="columnheader"
          aria-sort={headerSort.ariaSort}
          className={cn(
            "group/col relative flex h-full shrink-0 items-center border-r border-border/60 px-1",
            columnAlign(column.type) === "center" ? "justify-center" : "justify-start",
            isDragging && "opacity-40",
          )}
          style={columnCellStyle(width)}
        >
          {dropBefore && <ColumnDropLine color={group.color} side="left" />}
          {dropAfter && <ColumnDropLine color={group.color} side="right" />}
          {renaming ? (
            <form
              className="w-full px-0.5"
              onSubmit={(event) => {
                event.preventDefault();
                commitRename();
              }}
            >
              <input
                ref={renameInput}
                aria-label="Column name"
                data-testid="column-name-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setDraft(column.name);
                    setRenaming(false);
                  }
                }}
                className="h-7 w-full rounded-lg border border-ring bg-card px-2 text-center text-xs font-medium outline-none ring-2 ring-ring/20"
              />
            </form>
          ) : (
            <div className="flex min-w-0 max-w-full items-center">
              <button
                type="button"
                className={cn(
                  "group/sort relative flex h-7 min-w-0 items-center rounded-lg px-2 transition-colors hover:bg-accent/70 hover:text-foreground",
                  headerSort.active && "text-foreground",
                  canEdit && "cursor-grab active:cursor-grabbing",
                  // The options chevron floats at the left edge; left-aligned labels move over to make room.
                  canEdit && columnAlign(column.type) !== "center" && "ml-6",
                )}
                data-testid="column-sort"
                {...attributes}
                // Only the pointer starts a drag; a click that did not turn
                // into one sorts by this column.
                onPointerDown={(event) => {
                  dragged.current = false;
                  listeners?.onPointerDown?.(event as unknown as PointerEvent);
                  event.preventDefault();
                }}
                onPointerMove={(event) => {
                  // Four pixels is dnd-kit's own threshold for "this is a
                  // drag, not a click".
                  if (event.buttons === 1) dragged.current = true;
                }}
                onClick={() => {
                  if (!dragged.current) headerSort.toggle();
                }}
              >
                <span className="truncate">{column.name}</span>
                <SortIcon active={headerSort.active} direction={headerSort.direction} />
              </button>
              {canEdit && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${column.name} column options`}
                      className="absolute top-1/2 left-1 flex size-6 shrink-0 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent/70 hover:text-foreground focus-visible:opacity-100 group-hover/col:opacity-100 data-[state=open]:opacity-100"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  className="w-56"
                  // The menu puts focus back on its trigger as it closes, which
                  // would take it straight off the rename field that has just
                  // replaced that trigger. When Rename is what was chosen, the
                  // menu leaves focus alone.
                  onCloseAutoFocus={(event) => {
                    if (renameRequested.current) {
                      event.preventDefault();
                      renameRequested.current = false;
                    }
                  }}
                >
                  <DropdownMenuLabel>{COLUMN_TYPE_LABELS[column.type]} column</DropdownMenuLabel>
                  <DropdownMenuItem
                    onSelect={() => {
                      renameRequested.current = true;
                      setDraft(column.name);
                      setRenaming(true);
                    }}
                  >
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  {hasLabels && (
                    <DropdownMenuItem onSelect={() => openEditLabels(column)}>
                      <Tags /> Edit labels
                    </DropdownMenuItem>
                  )}
                  {hasTags && (
                    <DropdownMenuItem onSelect={() => openEditLabels(column)}>
                      <Tags /> Edit tags
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Plus /> Insert column right
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className={COLUMN_TYPE_PICKER_WIDTH}>
                      <ColumnTypePicker onPick={insertColumn} />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem disabled={index === 0} onSelect={() => move(-1)}>
                    <ArrowLeft /> Move left
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={index === visible.length - 1} onSelect={() => move(1)}>
                    <ArrowRight /> Move right
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void mutations.updateColumn(column.id, { hidden: true })}>
                    <EyeOff /> Hide column
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 /> Delete column
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              )}
            </div>
          )}
          {canEdit && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${column.name}`}
              onPointerDown={startResize}
              className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize rounded-full opacity-0 transition-opacity hover:bg-ring/70 group-hover/col:opacity-100"
            />
          )}
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete the “${column.name}” column?`}
            description="All values stored in this column are permanently removed from every item on the board."
            confirmLabel="Delete column"
            destructive
            onConfirm={() => mutations.deleteColumn(column.id).then(() => undefined)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-56"
        onCloseAutoFocus={(event) => {
          if (!renameRequested.current) return;
          renameRequested.current = false;
          event.preventDefault();
        }}
      >
        <ContextMenuLabel>{COLUMN_TYPE_LABELS[column.type]} column</ContextMenuLabel>
        <ContextMenuItem
          onSelect={() => {
            renameRequested.current = true;
            setDraft(column.name);
            setRenaming(true);
          }}
        >
          <Pencil /> Rename
        </ContextMenuItem>
        {hasLabels && (
          <ContextMenuItem onSelect={() => openEditLabels(column)}>
            <Tags /> Edit labels
          </ContextMenuItem>
        )}
        {hasTags && (
          <ContextMenuItem onSelect={() => openEditLabels(column)}>
            <Tags /> Edit tags
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus /> Insert column right
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className={COLUMN_TYPE_PICKER_WIDTH}>
            <ColumnTypePicker variant="context" onPick={insertColumn} />
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem disabled={index === 0} onSelect={() => move(-1)}>
          <ArrowLeft /> Move left
        </ContextMenuItem>
        <ContextMenuItem disabled={index === visible.length - 1} onSelect={() => move(1)}>
          <ArrowRight /> Move right
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void mutations.updateColumn(column.id, { hidden: true })}>
          <EyeOff /> Hide column
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
          <Trash2 /> Delete column
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function AddColumnMenu() {
  const { model, mutations } = useBoardContext();
  const hidden = model.columns.filter((c) => c.hidden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Add column" className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground" data-testid="add-column">
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={COLUMN_TYPE_PICKER_WIDTH}>
        <DropdownMenuLabel>Add column</DropdownMenuLabel>
        <ColumnTypePicker onPick={(type) => void mutations.addColumn(COLUMN_TYPE_LABELS[type], type)} />
        {hidden.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Hidden columns</DropdownMenuLabel>
            {hidden.map((column) => (
              <DropdownMenuItem key={column.id} onSelect={() => void mutations.updateColumn(column.id, { hidden: false })}>
                <EyeOff /> Show {column.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

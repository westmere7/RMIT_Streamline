"use client";

import { ArrowLeft, ArrowRight, EyeOff, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { BoardColumn, BoardGroup, ColumnType } from "@/domain";
import { COLUMN_TYPES, COLUMN_TYPE_LABELS } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, leadingWidth } from "@/features/boards/board-model";
import { colorClasses } from "@/lib/colors";
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
}

export function ColumnHeaderRow({ group, allSelected, someSelected, onToggleAll, widthOverrides, onWidthOverride }: ColumnHeaderRowProps) {
  const { model, canEdit } = useBoardContext();
  const colors = colorClasses(group.color);
  return (
    <div role="row" className="sticky top-0 z-[6] flex h-9 border-b bg-background text-xs font-medium text-muted-foreground">
      <div className="sticky left-0 z-[7] flex h-full items-center border-r bg-background" style={{ width: leadingWidth(), minWidth: leadingWidth() }}>
        <span aria-hidden className={cn("h-full w-1.5 rounded-l-sm", colors.dot)} />
        <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.selectWidth - 6 }}>
          <Checkbox
            aria-label={`Select all items in ${group.name}`}
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(next) => onToggleAll(next === true)}
            disabled={!canEdit}
          />
        </div>
        <div style={{ width: TABLE_LAYOUT.handleWidth }} />
        <div role="columnheader" className="flex-1 px-2">
          Item
        </div>
      </div>
      {model.visibleColumns.map((column, index) => (
        <ColumnHeaderCell
          key={column.id}
          column={column}
          index={index}
          width={widthOverrides[column.id] ?? column.width}
          onWidthOverride={onWidthOverride}
        />
      ))}
      <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.trailingWidth }}>
        {canEdit && <AddColumnMenu />}
      </div>
    </div>
  );
}

function ColumnHeaderCell({
  column,
  index,
  width,
  onWidthOverride,
}: {
  column: BoardColumn;
  index: number;
  width: number;
  onWidthOverride: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  const { model, mutations, canEdit, openEditLabels } = useBoardContext();
  const [renaming, setRenaming] = React.useState(false);
  const [draft, setDraft] = React.useState(column.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const visible = model.visibleColumns;

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (e: PointerEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)));
      onWidthOverride((prev) => ({ ...prev, [column.id]: next }));
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (e.clientX - startX)));
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

  const hasLabels = column.type === "STATUS" || column.type === "PRIORITY";

  return (
    <div role="columnheader" className="group/col relative flex h-full shrink-0 items-center justify-center border-r px-1" style={{ width, minWidth: width }}>
      {canEdit ? (
        <Popover open={renaming} onOpenChange={setRenaming}>
          <DropdownMenu>
            <PopoverTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex h-7 max-w-full items-center gap-1 truncate rounded px-1.5 hover:bg-accent hover:text-foreground" aria-label={`${column.name} column options`}>
                  <span className="truncate">{column.name}</span>
                </button>
              </DropdownMenuTrigger>
            </PopoverTrigger>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuLabel>{COLUMN_TYPE_LABELS[column.type]} column</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => {
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
              <DropdownMenuSeparator />
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
          <PopoverContent className="w-56 p-2" align="center">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (draft.trim() && draft.trim() !== column.name) void mutations.updateColumn(column.id, { name: draft.trim() });
                setRenaming(false);
              }}
            >
              <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Column name" onKeyDown={(e) => e.key === "Escape" && setRenaming(false)} />
            </form>
          </PopoverContent>
        </Popover>
      ) : (
        <span className="truncate px-1.5">{column.name}</span>
      )}
      {canEdit && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${column.name}`}
          onPointerDown={startResize}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize opacity-0 transition-opacity hover:bg-ring group-hover/col:opacity-100"
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
  );
}

const ADDABLE_TYPES: ColumnType[] = COLUMN_TYPES.filter((t) => t !== "FILES");

export function AddColumnMenu() {
  const { model, mutations } = useBoardContext();
  const hidden = model.columns.filter((c) => c.hidden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Add column" className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground" data-testid="add-column">
          <Plus className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Add column</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-0.5">
          {ADDABLE_TYPES.map((type) => (
            <DropdownMenuItem key={type} onSelect={() => void mutations.addColumn(COLUMN_TYPE_LABELS[type], type)}>
              {COLUMN_TYPE_LABELS[type]}
            </DropdownMenuItem>
          ))}
        </div>
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

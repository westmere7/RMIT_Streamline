"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Columns3,
  Copy,
  Eraser,
  ExternalLink,
  ListPlus,
  PanelTop,
  Pencil,
  Plus,
  Redo2,
  Rows3,
  SlidersHorizontal,
  Snowflake,
  Trash2,
  Type,
  Undo2,
  WrapText,
} from "lucide-react";
import * as React from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TRACKER_COLUMN_TYPES,
  TRACKER_COLUMN_TYPE_LABELS,
  columnLetter,
  type TrackerCellValue,
  type TrackerColumn,
  type TrackerColumnType,
  type TrackerRow,
  type TrackerRowKind,
  type TrackerSheet,
} from "@/domain";
import { type CellAddress, type CellRange, clampAddress, clearRange, formatCell, frozenOffsets, inRange, parseTsv, pasteBlock, rangeBetween, rangeToTsv } from "@/features/trackers/grid-model";
import { Chip, ChipColorPicker } from "@/features/trackers/chip";
import { STATUS_COLORS, TEMPLATE_STYLE, chipColor, nextChipColor, resolveOptionColors } from "@/features/trackers/tracker-template";
import { cn } from "@/lib/utils";
import { TrackerService } from "@/services/tracker-service";
import { type TrackerViewSettings, useUiStore } from "@/stores/ui-store";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";

const ROW_HEIGHTS: Record<TrackerViewSettings["density"], number> = { compact: 26, default: 32, comfortable: 40 };
const HEADER_HEIGHT = 34;
const GUTTER = 44;
const MIN_COLUMN_WIDTH = 60;

export interface TrackerGridProps {
  sheet: TrackerSheet;
  canEdit: boolean;
  commit: (updater: (sheet: TrackerSheet) => TrackerSheet) => void;
  onUndo: () => void;
  onRedo: () => void;
}

interface EditingState {
  row: number;
  col: number;
  /** Text the editor opens with; `undefined` keeps the current value. */
  initial?: string;
}

/**
 * The spreadsheet. Everything Excel-like the team relies on day to day: click
 * and arrow-key selection, type-to-edit, Enter/Tab to move, copy and paste of
 * blocks (also from Excel), delete to clear, undo/redo, dropdown and date
 * editors, frozen columns, phase/channel bands, and right-click row and column
 * menus. No formulas — trackers are lists, not models.
 */
export function TrackerGrid({ sheet, canEdit, commit, onUndo, onRedo }: TrackerGridProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<CellAddress | null>(null);
  const [anchor, setAnchor] = React.useState<CellAddress | null>(null);
  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const [widthOverrides, setWidthOverrides] = React.useState<Record<string, number>>({});
  const [hoverCol, setHoverCol] = React.useState<number | null>(null);
  const dragging = React.useRef(false);
  const view = useUiStore((s) => s.trackerView);
  const setView = useUiStore((s) => s.setTrackerView);
  const rowHeight = ROW_HEIGHTS[view.density];

  const columns = sheet.columns.map((c) => ({ ...c, width: widthOverrides[c.id] ?? c.width }));
  const frozen = Math.min(sheet.frozenColumns, columns.length);
  const offsets = frozenOffsets(columns, frozen, GUTTER);
  const totalWidth = GUTTER + columns.reduce((sum, c) => sum + c.width, 0) + 40;
  const range: CellRange | null = active ? rangeBetween(active, anchor ?? active) : null;

  const focusGrid = () => containerRef.current?.focus({ preventScroll: true });
  const select = (address: CellAddress, extend = false) => {
    const next = clampAddress(sheet, address);
    setActive(next);
    if (!extend) setAnchor(next);
  };
  const cellOf = (address: CellAddress): { row: TrackerRow; column: TrackerColumn } | null => {
    const row = sheet.rows[address.row];
    const column = columns[address.col];
    return row && column ? { row, column } : null;
  };

  // ---- editing ---------------------------------------------------------------

  const startEdit = (address: CellAddress, initial?: string) => {
    if (!canEdit) return;
    const target = cellOf(address);
    if (!target || target.row.kind !== "data") return;
    if (target.column.type === "checkbox") {
      toggleCheckbox(address);
      return;
    }
    setEditing({ row: address.row, col: address.col, initial });
  };

  const toggleCheckbox = (address: CellAddress) => {
    const target = cellOf(address);
    if (!target) return;
    const current = target.row.cells[target.column.id] === true;
    commit((s) => TrackerService.applyEdits(s, [{ rowId: target.row.id, columnId: target.column.id, value: !current }]));
  };

  const commitEdit = (address: CellAddress, raw: string, move: "down" | "right" | "none") => {
    const target = cellOf(address);
    setEditing(null);
    if (target && target.row.kind === "data") {
      const value = TrackerService.coerce(target.column, raw);
      if (value !== (target.row.cells[target.column.id] ?? null)) commit((s) => TrackerService.applyEdits(s, [{ rowId: target.row.id, columnId: target.column.id, value }]));
    }
    if (move === "down") select({ row: address.row + 1, col: address.col });
    if (move === "right") select({ row: address.row, col: address.col + 1 });
    requestAnimationFrame(focusGrid);
  };

  const cancelEdit = () => {
    setEditing(null);
    requestAnimationFrame(focusGrid);
  };

  // ---- clipboard -------------------------------------------------------------

  const copySelection = (event?: React.ClipboardEvent) => {
    if (!range) return;
    const text = rangeToTsv(sheet, range);
    if (event) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    } else void navigator.clipboard?.writeText(text);
  };

  const pasteText = (text: string) => {
    if (!canEdit || !active || !text) return;
    const block = parseTsv(text);
    commit((s) => pasteBlock(s, active, block, range));
  };

  // ---- keyboard --------------------------------------------------------------

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) onRedo();
      else onUndo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      onRedo();
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setActive({ row: 0, col: 0 });
      setAnchor({ row: sheet.rows.length - 1, col: columns.length - 1 });
      return;
    }
    if (mod && e.key.toLowerCase() === "c") {
      copySelection();
      return;
    }
    if (mod && e.key.toLowerCase() === "v") {
      // The paste event carries the data; when it does not fire (no focus in some browsers) fall back to the async API.
      void navigator.clipboard
        ?.readText?.()
        .then((text) => text && pasteText(text))
        .catch(() => undefined);
      return;
    }
    if (!active) {
      if (e.key.startsWith("Arrow") || e.key === "Tab") {
        e.preventDefault();
        select({ row: 0, col: 0 });
      }
      return;
    }
    const step = (dr: number, dc: number) => {
      e.preventDefault();
      select({ row: active.row + dr, col: active.col + dc }, e.shiftKey);
    };
    switch (e.key) {
      case "ArrowUp":
        return step(-1, 0);
      case "ArrowDown":
        return step(1, 0);
      case "ArrowLeft":
        return step(0, -1);
      case "ArrowRight":
        return step(0, 1);
      case "Home":
        e.preventDefault();
        return select({ row: mod ? 0 : active.row, col: 0 }, e.shiftKey);
      case "End":
        e.preventDefault();
        return select({ row: mod ? sheet.rows.length - 1 : active.row, col: columns.length - 1 }, e.shiftKey);
      case "Tab":
        e.preventDefault();
        return select({ row: active.row, col: active.col + (e.shiftKey ? -1 : 1) });
      case "Enter":
      case "F2":
        e.preventDefault();
        return startEdit(active);
      case "Escape":
        setAnchor(active);
        return;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        if (canEdit && range) commit((s) => clearRange(s, range));
        return;
      case " ":
        if (cellOf(active)?.column.type === "checkbox") {
          e.preventDefault();
          toggleCheckbox(active);
        }
        return;
    }
    // Printable character: start typing into the cell, replacing its content.
    if (e.key.length === 1 && !mod && !e.altKey) {
      e.preventDefault();
      startEdit(active, e.key);
    }
  };

  // ---- structure edits -------------------------------------------------------

  const insertRow = (index: number, kind: TrackerRowKind = "data") => commit((s) => TrackerService.insertRows(s, index, 1, kind));
  const selectedRowIds = () => (range ? sheet.rows.slice(range.top, range.bottom + 1).map((r) => r.id) : []);
  // Toolbar actions work on the selection, or on the end of the sheet when nothing is selected.
  const toolbar = {
    insertRow: () => insertRow(range ? range.bottom + 1 : sheet.rows.length),
    insertColumn: () => commit((s) => TrackerService.insertColumn(s, active ? active.col + 1 : s.columns.length)),
    deleteRows: () => range && commit((s) => TrackerService.deleteRows(s, selectedRowIds())),
    clear: () => range && commit((s) => clearRange(s, range)),
    setKind: (kind: TrackerRowKind) => range && commit((s) => TrackerService.setRowKind(s, selectedRowIds(), kind)),
    freeze: () => active && commit((s) => ({ ...s, frozenColumns: s.frozenColumns === active.col + 1 ? 0 : active.col + 1 })),
  };

  const resizeColumn = (column: TrackerColumn, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = column.width;
    const onMove = (e: PointerEvent) => setWidthOverrides((prev) => ({ ...prev, [column.id]: Math.max(MIN_COLUMN_WIDTH, startWidth + (e.clientX - startX)) }));
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (e.clientX - startX)));
      setWidthOverrides((prev) => {
        const next = { ...prev };
        delete next[column.id];
        return next;
      });
      if (width !== column.width) commit((s) => TrackerService.updateColumn(s, column.id, { width }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  React.useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <GridToolbar canEdit={canEdit} hasSelection={!!range} activeCol={active?.col ?? null} frozen={frozen} view={view} onView={setView} onUndo={onUndo} onRedo={onRedo} actions={toolbar} />
      <div
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-label={`${sheet.name} sheet`}
        aria-rowcount={sheet.rows.length + 1}
        aria-colcount={columns.length + 1}
        data-testid="tracker-grid"
        className="scrollbar-thin flex-1 overflow-auto outline-none focus-visible:[&_[data-active=true]]:ring-2"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHoverCol(null)}
        onCopy={(e) => copySelection(e)}
        onPaste={(e) => {
          if (editing) return;
          const text = e.clipboardData.getData("text/plain");
          if (text) {
            e.preventDefault();
            pasteText(text);
          }
        }}
      >
        <table className="border-separate border-spacing-0 text-[13px]" style={{ width: totalWidth, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: GUTTER }} />
            {columns.map((c) => (
              <col key={c.id} style={{ width: c.width }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr style={{ height: HEADER_HEIGHT }}>
              <th className="sticky top-0 left-0 z-30 border-r border-b border-white/15" style={{ backgroundColor: `#${TEMPLATE_STYLE.headerFill}` }} aria-label="Row numbers" />
              {columns.map((column, index) => (
                <ColumnHeader
                  key={column.id}
                  column={column}
                  index={index}
                  count={columns.length}
                  frozen={index < frozen}
                  isFrozenEdge={index === frozen - 1}
                  left={offsets[index]}
                  canEdit={canEdit}
                  selected={(!!range && range.left <= index && index <= range.right) || hoverCol === index}
                  onSelectColumn={(extend) => {
                    setActive({ row: 0, col: index });
                    setAnchor(extend && anchor ? { row: sheet.rows.length - 1, col: anchor.col } : { row: sheet.rows.length - 1, col: index });
                    focusGrid();
                  }}
                  onResize={(e) => resizeColumn(column, e)}
                  onChange={(patch) => commit((s) => TrackerService.updateColumn(s, column.id, patch))}
                  onInsert={(side) => commit((s) => TrackerService.insertColumn(s, side === "left" ? index : index + 1))}
                  onMove={(delta) => commit((s) => TrackerService.moveColumn(s, column.id, index + delta))}
                  onDelete={() => commit((s) => TrackerService.deleteColumn(s, column.id))}
                  onFreeze={() => commit((s) => ({ ...s, frozenColumns: s.frozenColumns === index + 1 ? 0 : index + 1 }))}
                />
              ))}
              <th className="sticky top-0 z-20 border-b border-white/15" style={{ backgroundColor: `#${TEMPLATE_STYLE.headerFill}` }}>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Add column"
                    onClick={() => commit((s) => TrackerService.insertColumn(s, s.columns.length))}
                    className="flex size-7 items-center justify-center rounded text-white/70 hover:bg-white/10 hover:text-white"
                    data-testid="add-column"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, r) => (
              <GridRow
                key={row.id}
                row={row}
                index={r}
                columns={columns}
                frozen={frozen}
                offsets={offsets}
                range={range}
                active={active}
                editing={editing?.row === r ? editing : null}
                canEdit={canEdit}
                onMouseDownCell={(c, e) => {
                  if (e.button !== 0) {
                    if (!range || !inRange(range, r, c)) select({ row: r, col: c });
                    return;
                  }
                  dragging.current = true;
                  select({ row: r, col: c }, e.shiftKey);
                  focusGrid();
                }}
                onMouseEnterCell={(c) => {
                  setHoverCol(c);
                  if (dragging.current && active) {
                    setAnchor({ row: r, col: c });
                  }
                }}
                view={view}
                rowHeight={rowHeight}
                striped={view.stripes && r % 2 === 1}
                onDoubleClickCell={(c) => startEdit({ row: r, col: c })}
                onSelectRow={(extend) => {
                  setActive({ row: r, col: 0 });
                  setAnchor(extend && anchor ? { row: anchor.row, col: columns.length - 1 } : { row: r, col: columns.length - 1 });
                  focusGrid();
                }}
                onCommitEdit={(c, raw, move) => commitEdit({ row: r, col: c }, raw, move)}
                onCancelEdit={cancelEdit}
                onLabelChange={(label) => commit((s) => TrackerService.setRowLabel(s, row.id, label))}
                onToggleCheckbox={(c) => toggleCheckbox({ row: r, col: c })}
                onAddOption={(c, option) => {
                  const column = columns[c];
                  if (!column) return;
                  commit((s) =>
                    TrackerService.updateColumn(s, column.id, { options: [...(column.options ?? []), option], optionColors: { ...resolveOptionColors(column), [option]: nextChipColor(column) } }),
                  );
                }}
                rowMenu={
                  canEdit
                    ? {
                        insertAbove: () => insertRow(r),
                        insertBelow: () => insertRow(r + 1),
                        insertSection: (kind) => insertRow(r, kind),
                        duplicate: () => commit((s) => TrackerService.duplicateRows(s, selectedRowIds().length ? selectedRowIds() : [row.id])),
                        setKind: (kind) => commit((s) => TrackerService.setRowKind(s, selectedRowIds().length ? selectedRowIds() : [row.id], kind)),
                        remove: () => commit((s) => TrackerService.deleteRows(s, selectedRowIds().length ? selectedRowIds() : [row.id])),
                        clear: () => range && commit((s) => clearRange(s, range)),
                        copy: () => copySelection(),
                        selectedCount: selectedRowIds().length || 1,
                      }
                    : null
                }
              />
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="sticky left-0 px-3 py-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => commit((s) => TrackerService.insertRows(s, s.rows.length, 5))} data-testid="add-rows">
              <Plus /> Add 5 rows
            </Button>
          </div>
        )}
      </div>
      <div className="flex h-7 items-center gap-3 border-t px-3 text-2xs text-muted-foreground">
        <span>
          {sheet.rows.filter((r) => r.kind === "data").length} rows · {columns.length} columns
        </span>
        {active && (
          <span className="tabular">
            {columnLetter(active.col)}
            {active.row + 1}
            {range && (range.top !== range.bottom || range.left !== range.right) ? ` · ${range.bottom - range.top + 1}×${range.right - range.left + 1} selected` : ""}
          </span>
        )}
        {canEdit && <span className="ml-auto hidden md:inline">Type to edit · Enter/Tab to move · Ctrl+C/V for blocks · Right-click for rows and columns</span>}
      </div>
    </div>
  );
}

// ---- header -------------------------------------------------------------------

interface ColumnHeaderProps {
  column: TrackerColumn;
  index: number;
  count: number;
  frozen: boolean;
  isFrozenEdge: boolean;
  left: number | undefined;
  canEdit: boolean;
  selected: boolean;
  onSelectColumn: (extend: boolean) => void;
  onResize: (e: React.PointerEvent) => void;
  onChange: (patch: Partial<Omit<TrackerColumn, "id">>) => void;
  onInsert: (side: "left" | "right") => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  onFreeze: () => void;
}

function ColumnHeader({ column, index, count, frozen, isFrozenEdge, left, canEdit, selected, onSelectColumn, onResize, onChange, onInsert, onMove, onDelete, onFreeze }: ColumnHeaderProps) {
  const [renaming, setRenaming] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(column.name);

  const menu = (
    <>
      <DropdownMenuLabel>
        {columnLetter(index)} · {TRACKER_COLUMN_TYPE_LABELS[column.type]}
      </DropdownMenuLabel>
      <DropdownMenuItem
        onSelect={() => {
          setDraft(column.name);
          setRenaming(true);
        }}
      >
        <Pencil /> Rename
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Type /> Column type
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={column.type} onValueChange={(type) => onChange({ type: type as TrackerColumnType, ...(type === "list" && !column.options ? { options: [] } : {}) })}>
            {TRACKER_COLUMN_TYPES.map((type) => (
              <DropdownMenuRadioItem key={type} value={type}>
                {TRACKER_COLUMN_TYPE_LABELS[type]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {column.type === "list" && (
        <DropdownMenuItem onSelect={() => setOptionsOpen(true)}>
          <ListPlus /> Edit dropdown options
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onInsert("left")}>
        <ArrowLeft /> Insert column left
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onInsert("right")}>
        <ArrowRight /> Insert column right
      </DropdownMenuItem>
      <DropdownMenuItem disabled={index === 0} onSelect={() => onMove(-1)}>
        Move left
      </DropdownMenuItem>
      <DropdownMenuItem disabled={index === count - 1} onSelect={() => onMove(1)}>
        Move right
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onFreeze}>
        <Snowflake /> {isFrozenEdge ? "Unfreeze columns" : `Freeze up to ${columnLetter(index)}`}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled={count <= 1} onSelect={onDelete}>
        <Trash2 /> Delete column
      </DropdownMenuItem>
    </>
  );

  return (
    <th
      scope="col"
      className={cn(
        "group/col sticky top-0 border-r border-b border-white/15 p-0 text-left text-xs font-semibold text-white",
        frozen ? "z-30" : "z-20",
        isFrozenEdge && "shadow-[2px_0_0_0_rgba(255,255,255,0.25)]",
      )}
      style={{ backgroundColor: selected ? "#1a1d78" : `#${TEMPLATE_STYLE.headerFill}`, left: frozen ? left : undefined }}
      aria-colindex={index + 2}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={!canEdit}>
          <div className="flex h-full items-center gap-1 pr-6 pl-2" style={{ height: HEADER_HEIGHT }} onMouseDown={(e) => e.button === 0 && onSelectColumn(e.shiftKey)}>
            {renaming ? (
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft.trim() && draft.trim() !== column.name) onChange({ name: draft.trim() });
                  setRenaming(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="h-6 bg-white px-1 text-xs text-foreground"
                aria-label="Column name"
              />
            ) : (
              <span className="truncate" title={column.name}>
                {column.name}
              </span>
            )}
          </div>
        </ContextMenuTrigger>
        {canEdit && <ContextMenuContent className="w-56">{contextFromDropdown(menu)}</ContextMenuContent>}
      </ContextMenu>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${column.name} column options`}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-white/60 opacity-0 hover:bg-white/15 hover:text-white group-hover/col:opacity-100 data-[state=open]:opacity-100"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canEdit && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize ${column.name}`}
          onPointerDown={onResize}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-white/40"
        />
      )}
      <OptionsDialog column={column} open={optionsOpen} onOpenChange={setOptionsOpen} onSave={(options, optionColors) => onChange({ options, optionColors })} />
    </th>
  );
}

/** Same menu entries as the header dropdown, rendered as right-click items. */
function contextFromDropdown(menu: React.ReactNode): React.ReactNode {
  // Radix menus share item semantics; the simplest faithful mapping is to re-render the dropdown tree with context primitives.
  const map = (node: React.ReactNode): React.ReactNode =>
    React.Children.map(node, (child) => {
      if (!React.isValidElement(child)) return child;
      const el = child as React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
      const swap: Record<string, React.ElementType> = {
        [String(DropdownMenuLabel)]: ContextMenuLabel,
        [String(DropdownMenuItem)]: ContextMenuItem,
        [String(DropdownMenuSeparator)]: ContextMenuSeparator,
        [String(DropdownMenuSub)]: ContextMenuSub,
        [String(DropdownMenuSubTrigger)]: ContextMenuSubTrigger,
        [String(DropdownMenuSubContent)]: ContextMenuSubContent,
      };
      const Replacement = swap[String(el.type)];
      if (el.type === DropdownMenuRadioGroup) {
        const group = el.props as { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode };
        return React.Children.map(group.children, (item) => {
          if (!React.isValidElement(item)) return item;
          const radio = item as React.ReactElement<{ value: string; children?: React.ReactNode }>;
          return (
            <ContextMenuItem key={radio.props.value} onSelect={() => group.onValueChange?.(radio.props.value)}>
              <Check className={cn("size-3.5", radio.props.value === group.value ? "opacity-100" : "opacity-0")} /> {radio.props.children}
            </ContextMenuItem>
          );
        });
      }
      if (!Replacement) return el.type === React.Fragment ? map(el.props.children) : el;
      const { children, ...rest } = el.props;
      return <Replacement {...rest}>{map(children)}</Replacement>;
    });
  return map(menu);
}

function OptionsDialog({
  column,
  open,
  onOpenChange,
  onSave,
}: {
  column: TrackerColumn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (options: string[], optionColors?: Record<string, string>) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <OptionsForm column={column} onSave={onSave} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so it always starts from the current options. */
function OptionsForm({ column, onSave, onClose }: { column: TrackerColumn; onSave: (options: string[], optionColors?: Record<string, string>) => void; onClose: () => void }) {
  const [rows, setRows] = React.useState<Array<{ name: string; color: string }>>(() => {
    const colors = resolveOptionColors(column);
    return (column.options ?? []).map((name) => ({ name, color: colors[name]! }));
  });
  const [draft, setDraft] = React.useState("");
  const add = () => {
    const name = draft.trim();
    if (!name || rows.some((r) => r.name.toLowerCase() === name.toLowerCase())) return;
    const color = STATUS_COLORS[name.toUpperCase()] ?? nextChipColor({ options: rows.map((r) => r.name), optionColors: Object.fromEntries(rows.map((r) => [r.name, r.color])) });
    setRows([...rows, { name, color }]);
    setDraft("");
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Dropdown options — {column.name}</DialogTitle>
        <DialogDescription>Each option is a chip. Pick its colour, rename it, or drop it; values typed into cells that are not listed here stay as neutral chips.</DialogDescription>
      </DialogHeader>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1" data-testid="chip-options">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <ChipColorPicker value={row.color} label={row.name || "option"} onChange={(color) => setRows(rows.map((r, j) => (j === i ? { ...r, color } : r)))} />
            <Input
              value={row.name}
              onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
              aria-label={`Option ${i + 1}`}
              className="h-8"
              onMouseDown={(e) => e.stopPropagation()}
            />
            <Chip label={row.name || "…"} color={row.color} className="hidden shrink-0 sm:inline-flex" />
            <Button variant="ghost" size="icon-xs" aria-label={`Remove ${row.name}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-center text-2xs text-muted-foreground">No options yet.</li>}
      </ul>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="New option…"
          aria-label="New option"
          className="h-8"
          onMouseDown={(e) => e.stopPropagation()}
        />
        <Button variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
          <Plus /> Add
        </Button>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            const seen = new Set<string>();
            const cleaned = rows.map((r) => ({ ...r, name: r.name.trim() })).filter((r) => r.name && !seen.has(r.name.toLowerCase()) && seen.add(r.name.toLowerCase()));
            onSave(
              cleaned.map((r) => r.name),
              Object.fromEntries(cleaned.map((r) => [r.name, r.color])),
            );
            onClose();
          }}
        >
          Save options
        </Button>
      </DialogFooter>
    </>
  );
}

// ---- rows ---------------------------------------------------------------------

interface RowMenuHandlers {
  insertAbove: () => void;
  insertBelow: () => void;
  insertSection: (kind: TrackerRowKind) => void;
  duplicate: () => void;
  setKind: (kind: TrackerRowKind) => void;
  remove: () => void;
  clear: () => void;
  copy: () => void;
  selectedCount: number;
}

interface GridRowProps {
  row: TrackerRow;
  index: number;
  columns: TrackerColumn[];
  frozen: number;
  offsets: number[];
  range: CellRange | null;
  active: CellAddress | null;
  editing: EditingState | null;
  canEdit: boolean;
  onMouseDownCell: (col: number, e: React.MouseEvent) => void;
  onMouseEnterCell: (col: number) => void;
  onDoubleClickCell: (col: number) => void;
  onSelectRow: (extend: boolean) => void;
  onCommitEdit: (col: number, raw: string, move: "down" | "right" | "none") => void;
  onCancelEdit: () => void;
  onLabelChange: (label: string) => void;
  onToggleCheckbox: (col: number) => void;
  /** Adds a typed value to the column's dropdown before storing it. */
  onAddOption: (col: number, option: string) => void;
  rowMenu: RowMenuHandlers | null;
  view: TrackerViewSettings;
  rowHeight: number;
  striped: boolean;
}

const GridRow = React.memo(function GridRow({
  row,
  index,
  columns,
  frozen,
  offsets,
  range,
  active,
  editing,
  canEdit,
  onMouseDownCell,
  onMouseEnterCell,
  onDoubleClickCell,
  onSelectRow,
  onCommitEdit,
  onCancelEdit,
  onLabelChange,
  onToggleCheckbox,
  onAddOption,
  rowMenu,
  view,
  rowHeight,
  striped,
}: GridRowProps) {
  const rowSelected = !!range && range.top <= index && index <= range.bottom;
  const inActiveRow = view.crosshair && active?.row === index;
  const gutter = (
    <td
      className={cn(
        "sticky left-0 z-20 border-r border-b bg-surface text-center text-2xs text-muted-foreground tabular select-none transition-colors group-hover/row:bg-accent group-hover/row:text-foreground",
        (rowSelected || inActiveRow) && "bg-accent text-foreground",
      )}
      style={{ width: GUTTER }}
      onMouseDown={(e) => e.button === 0 && onSelectRow(e.shiftKey)}
      role="rowheader"
    >
      {index + 1}
    </td>
  );

  const content =
    row.kind !== "data" ? (
      <tr style={{ height: rowHeight }} aria-rowindex={index + 2} className="group/row" data-testid="grid-section-row">
        {gutter}
        <SectionCell row={row} span={columns.length + 1} canEdit={canEdit} selected={rowSelected} onChange={onLabelChange} onMouseDown={(e) => onMouseDownCell(0, e)} />
      </tr>
    ) : (
      <tr style={{ height: view.wrap ? undefined : rowHeight, minHeight: rowHeight }} aria-rowindex={index + 2} className="group/row">
        {gutter}
        {columns.map((column, c) => (
          <GridCell
            key={column.id}
            column={column}
            value={row.cells[column.id]}
            frozen={c < frozen}
            isFrozenEdge={c === frozen - 1}
            left={offsets[c]}
            selected={!!range && inRange(range, index, c)}
            active={!!active && active.row === index && active.col === c}
            crosshair={view.crosshair && !!active && (active.row === index || active.col === c)}
            gridLines={view.gridLines}
            wrap={view.wrap}
            striped={striped}
            rowHeight={rowHeight}
            editing={editing?.col === c ? editing : null}
            canEdit={canEdit}
            onMouseDown={(e) => onMouseDownCell(c, e)}
            onMouseEnter={() => onMouseEnterCell(c)}
            onDoubleClick={() => onDoubleClickCell(c)}
            onCommit={(raw, move) => onCommitEdit(c, raw, move)}
            onCancel={onCancelEdit}
            onToggle={() => onToggleCheckbox(c)}
            onAddOption={(option) => onAddOption(c, option)}
          />
        ))}
        <td className={cn(view.gridLines && "border-b")} />
      </tr>
    );

  if (!rowMenu) return content;
  const n = rowMenu.selectedCount;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>
          Row {index + 1}
          {n > 1 ? ` · ${n} selected` : ""}
        </ContextMenuLabel>
        <ContextMenuItem onSelect={rowMenu.copy}>
          <Copy /> Copy
        </ContextMenuItem>
        <ContextMenuItem onSelect={rowMenu.clear}>Clear contents</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={rowMenu.insertAbove}>
          <Plus /> Insert row above
        </ContextMenuItem>
        <ContextMenuItem onSelect={rowMenu.insertBelow}>
          <Plus /> Insert row below
        </ContextMenuItem>
        <ContextMenuItem onSelect={rowMenu.duplicate}>
          <Rows3 /> Duplicate row{n > 1 ? "s" : ""}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Row type</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem onSelect={() => rowMenu.setKind("data")}>
              <Check className={cn("size-3.5", row.kind === "data" ? "opacity-100" : "opacity-0")} /> Data row
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => rowMenu.setKind("section")}>
              <Check className={cn("size-3.5", row.kind === "section" ? "opacity-100" : "opacity-0")} /> Phase band
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => rowMenu.setKind("subsection")}>
              <Check className={cn("size-3.5", row.kind === "subsection" ? "opacity-100" : "opacity-0")} /> Channel band
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => rowMenu.insertSection("section")}>Insert phase band above</ContextMenuItem>
        <ContextMenuItem onSelect={() => rowMenu.insertSection("subsection")}>Insert channel band above</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={rowMenu.remove}>
          <Trash2 /> Delete row{n > 1 ? "s" : ""}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

function SectionCell({
  row,
  span,
  canEdit,
  selected,
  onChange,
  onMouseDown,
}: {
  row: TrackerRow;
  span: number;
  canEdit: boolean;
  selected: boolean;
  onChange: (label: string) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(row.label ?? "");
  const section = row.kind === "section";
  return (
    <td
      colSpan={span}
      className={cn("sticky left-[44px] z-10 border-b px-3 font-semibold", selected && "ring-2 ring-inset ring-ring")}
      style={{ backgroundColor: `#${section ? TEMPLATE_STYLE.sectionFill : TEMPLATE_STYLE.subsectionFill}`, color: `#${section ? TEMPLATE_STYLE.sectionText : TEMPLATE_STYLE.subsectionText}` }}
      onMouseDown={onMouseDown}
      onDoubleClick={() => {
        if (!canEdit) return;
        setDraft(row.label ?? "");
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== (row.label ?? "")) onChange(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
            e.stopPropagation();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Band label"
          className="h-6 w-80 max-w-full rounded bg-white/90 px-1.5 text-[13px] text-foreground outline-none"
        />
      ) : (
        <span className="block max-w-[60vw] truncate">{row.label || (canEdit ? "Double-click to name this band" : "")}</span>
      )}
    </td>
  );
}

// ---- cells --------------------------------------------------------------------

interface GridCellProps {
  column: TrackerColumn;
  value: TrackerCellValue | undefined;
  frozen: boolean;
  isFrozenEdge: boolean;
  left: number | undefined;
  selected: boolean;
  active: boolean;
  editing: EditingState | null;
  canEdit: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onDoubleClick: () => void;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
  onToggle: () => void;
  onAddOption: (option: string) => void;
  crosshair: boolean;
  gridLines: boolean;
  wrap: boolean;
  striped: boolean;
  rowHeight: number;
}

const GridCell = React.memo(function GridCell({
  column,
  value,
  frozen,
  isFrozenEdge,
  left,
  selected,
  active,
  editing,
  canEdit,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onCommit,
  onCancel,
  onToggle,
  onAddOption,
  crosshair,
  gridLines,
  wrap,
  striped,
  rowHeight,
}: GridCellProps) {
  const text = formatCell(column, value);
  const isChip = column.type === "list" && typeof value === "string" && value !== "";
  const tint: string | undefined = undefined;
  return (
    <td
      role="gridcell"
      data-active={active || undefined}
      data-testid="grid-cell"
      className={cn(
        "p-0 align-middle transition-colors",
        gridLines ? "border-r border-b" : "border-b border-transparent",
        frozen ? "sticky z-10 bg-background" : "relative bg-background",
        isFrozenEdge && "shadow-[2px_0_0_0_var(--border)]",
        !tint && striped && "bg-foreground/[0.03]",
        !tint && crosshair && "bg-ring/[0.06]",
        !tint && "hover:bg-accent",
        selected && !tint && "bg-ring/10",
        active && "ring-2 ring-inset ring-ring",
      )}
      style={{ left: frozen ? left : undefined, ...(tint ? { backgroundColor: `#${tint}`, color: "#1c1d2b" } : {}) }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={onDoubleClick}
    >
      {editing ? (
        <CellEditor column={column} value={value} initial={editing.initial} onCommit={onCommit} onCancel={onCancel} onAddOption={onAddOption} />
      ) : (
        <div
          className={cn(
            "flex items-center gap-1 overflow-hidden px-2",
            wrap && column.type === "longText" ? "py-1.5 leading-snug whitespace-normal" : "whitespace-nowrap",
            column.type === "number" && "justify-end tabular",
            selected && tint && "brightness-95",
          )}
          style={{ minHeight: rowHeight - 2, height: wrap && column.type === "longText" ? undefined : rowHeight - 2 }}
        >
          {column.type === "list" ? (
            <span className="group/chip flex min-w-0 flex-1 items-center justify-between gap-1">
              {isChip ? (
                <Chip label={value} color={chipColor(column, value)} size={rowHeight < 30 ? "sm" : "md"} title={chipColor(column, value) ? undefined : "Custom value (not in the dropdown)"} />
              ) : (
                <span />
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label="Open dropdown"
                  onClick={onDoubleClick}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/chip:opacity-100 hover:bg-foreground/10 hover:text-foreground"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              )}
            </span>
          ) : column.type === "checkbox" ? (
            <button
              type="button"
              aria-label={value === true ? "Checked" : "Unchecked"}
              disabled={!canEdit}
              onClick={onToggle}
              onMouseDown={(e) => e.stopPropagation()}
              className={cn("flex size-4 items-center justify-center rounded-[4px] border", value === true ? "border-green-600 bg-green-600 text-white" : "border-input")}
            >
              {value === true && <Check className="size-3" strokeWidth={3} />}
            </button>
          ) : column.type === "url" && typeof value === "string" && /^https?:\/\//i.test(value) ? (
            <>
              <ExternalLink className="size-3 shrink-0 text-blue-600 dark:text-blue-300" />
              <a
                href={value}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="truncate text-blue-700 hover:underline dark:text-blue-300"
              >
                {text.replace(/^https?:\/\//i, "")}
              </a>
            </>
          ) : (
            <span className={cn(wrap && column.type === "longText" ? "line-clamp-3" : "truncate")}>{text}</span>
          )}
        </div>
      )}
    </td>
  );
});

// ---- toolbar ------------------------------------------------------------------

interface GridToolbarProps {
  canEdit: boolean;
  hasSelection: boolean;
  activeCol: number | null;
  frozen: number;
  view: TrackerViewSettings;
  onView: (patch: Partial<TrackerViewSettings>) => void;
  onUndo: () => void;
  onRedo: () => void;
  actions: {
    insertRow: () => void;
    insertColumn: () => void;
    deleteRows: () => void;
    clear: () => void;
    setKind: (kind: TrackerRowKind) => void;
    freeze: () => void;
  };
}

/** Editing actions and view settings, Excel-ribbon style but small. */
function GridToolbar({ canEdit, hasSelection, activeCol, frozen, view, onView, onUndo, onRedo, actions }: GridToolbarProps) {
  const frozenHere = activeCol !== null && frozen === activeCol + 1;
  return (
    <div role="toolbar" aria-label="Sheet tools" className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5" data-testid="grid-toolbar">
      {canEdit && (
        <>
          <ToolButton label="Undo (Ctrl+Z)" onClick={onUndo}>
            <Undo2 />
          </ToolButton>
          <ToolButton label="Redo (Ctrl+Y)" onClick={onRedo}>
            <Redo2 />
          </ToolButton>
          <Divider />
          <Button variant="ghost" size="sm" onClick={actions.insertRow} data-testid="toolbar-insert-row">
            <Rows3 /> Insert row
          </Button>
          <Button variant="ghost" size="sm" onClick={actions.insertColumn} data-testid="toolbar-insert-column">
            <Columns3 /> Insert column
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!hasSelection}>
                <PanelTop /> Row type <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onSelect={() => actions.setKind("data")}>Data row</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.setKind("section")}>Phase band</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.setKind("subsection")}>Channel band</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolButton label={frozenHere ? "Unfreeze columns" : "Freeze columns up to the active one"} onClick={actions.freeze} disabled={activeCol === null} pressed={frozenHere}>
            <Snowflake />
          </ToolButton>
          <Divider />
          <ToolButton label="Clear contents (Delete)" onClick={actions.clear} disabled={!hasSelection}>
            <Eraser />
          </ToolButton>
          <ToolButton label="Delete selected rows" onClick={actions.deleteRows} disabled={!hasSelection} destructive>
            <Trash2 />
          </ToolButton>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <ToolButton label={view.wrap ? "Unwrap long text" : "Wrap long text"} onClick={() => onView({ wrap: !view.wrap })} pressed={view.wrap}>
          <WrapText />
        </ToolButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" data-testid="toolbar-view">
              <SlidersHorizontal /> View <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Show</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={view.gridLines} onCheckedChange={(v) => onView({ gridLines: v === true })}>
              Gridlines
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={view.stripes} onCheckedChange={(v) => onView({ stripes: v === true })}>
              Zebra stripes
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={view.crosshair} onCheckedChange={(v) => onView({ crosshair: v === true })}>
              Highlight active row &amp; column
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={view.wrap} onCheckedChange={(v) => onView({ wrap: v === true })}>
              Wrap long text
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Row height</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={view.density} onValueChange={(density) => onView({ density: density as TrackerViewSettings["density"] })}>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="default">Default</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled,
  pressed,
  destructive,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SimpleTooltip label={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(pressed && "bg-accent text-foreground", destructive && "hover:text-destructive")}
      >
        {children}
      </Button>
    </SimpleTooltip>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px bg-border" />;
}

function CellEditor({
  column,
  value,
  initial,
  onCommit,
  onCancel,
  onAddOption,
}: {
  column: TrackerColumn;
  value: TrackerCellValue | undefined;
  initial?: string;
  onCommit: (raw: string, move: "down" | "right" | "none") => void;
  onCancel: () => void;
  onAddOption: (option: string) => void;
}) {
  const current = initial ?? (column.type === "date" && typeof value === "string" ? value : formatCell(column, value));
  const [draft, setDraft] = React.useState(current);
  const committed = React.useRef(false);
  const finish = (move: "down" | "right" | "none", raw = draft) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(raw, move);
  };
  const keys = (e: React.KeyboardEvent, multiline = false) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      committed.current = true;
      onCancel();
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish("right");
    } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      finish("down");
    }
  };
  const base = "absolute inset-0 z-30 w-full border-2 border-ring bg-background px-2 text-[13px] text-foreground outline-none";

  if (column.type === "list") {
    return (
      <ListEditor
        column={column}
        value={typeof value === "string" ? value : ""}
        initial={initial}
        onCommit={(v) => finish("down", v)}
        onAddOption={(option) => {
          onAddOption(option);
          finish("down", option);
        }}
        onCancel={onCancel}
      />
    );
  }
  if (column.type === "longText") {
    return (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish("none")}
        onKeyDown={(e) => keys(e, true)}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(base, "h-28 min-w-[320px] resize-none py-1.5 leading-snug shadow-lg")}
        style={{ bottom: "auto" }}
        aria-label={column.name}
        onFocus={(e) => !initial && e.target.select()}
      />
    );
  }
  if (column.type === "date") {
    return (
      <input
        autoFocus
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(draft) ? draft : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish("none")}
        onKeyDown={keys}
        onMouseDown={(e) => e.stopPropagation()}
        className={base}
        aria-label={column.name}
      />
    );
  }
  return (
    <input
      autoFocus
      type={column.type === "number" ? "text" : "text"}
      inputMode={column.type === "number" ? "decimal" : undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish("none")}
      onKeyDown={keys}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => !initial && e.target.select()}
      className={cn(base, column.type === "number" && "text-right tabular")}
      aria-label={column.name}
    />
  );
}

function ListEditor({
  column,
  value,
  initial,
  onCommit,
  onAddOption,
  onCancel,
}: {
  column: TrackerColumn;
  value: string;
  initial?: string;
  onCommit: (value: string) => void;
  onAddOption: (option: string) => void;
  onCancel: () => void;
}) {
  const options = column.options ?? [];
  const colors = resolveOptionColors(column);
  const [filter, setFilter] = React.useState(initial ?? "");
  const query = filter.trim();
  const visible = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const exact = options.some((o) => o.toLowerCase() === query.toLowerCase());
  // Rows the arrow keys walk: the matching options, then the two "custom value" actions.
  const extra = query && !exact ? ["__add__", "__use__"] : [];
  const items = [...visible, ...extra];
  const [highlight, setHighlight] = React.useState(Math.max(0, options.indexOf(value)));
  const inputRef = React.useRef<HTMLInputElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const pick = (item: string | undefined) => {
    if (item === undefined) return;
    if (item === "__add__") onAddOption(query);
    else if (item === "__use__") onCommit(query);
    else onCommit(item);
  };
  return (
    <div
      ref={rootRef}
      className="absolute top-0 left-0 z-40 w-72 overflow-hidden rounded-lg border bg-popover shadow-xl"
      onMouseDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) onCancel();
      }}
      role="listbox"
      aria-label={`Choose ${column.name}`}
      data-testid="chip-picker"
    >
      <div className="flex items-center gap-2 border-b px-2.5">
        <input
          ref={inputRef}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") onCancel();
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(items.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(items[highlight] ?? (query ? query : ""));
            } else if (e.key === "Backspace" && filter === "" && value) onCommit("");
          }}
          placeholder="Search or type a new value…"
          aria-label="Search options"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
        />
        {value && (
          <button type="button" onClick={() => onCommit("")} className="shrink-0 rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground">
            Clear
          </button>
        )}
      </div>
      <ul className="max-h-64 overflow-y-auto p-1.5">
        {visible.map((option, i) => (
          <li key={option}>
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              onClick={() => pick(option)}
              onMouseEnter={() => setHighlight(i)}
              className={cn("flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left", i === highlight && "bg-accent")}
            >
              <Chip label={option} color={colors[option]} />
              {option === value && <Check className="ml-auto size-3.5 text-muted-foreground" />}
            </button>
          </li>
        ))}
        {visible.length === 0 && !query && <li className="px-2 py-3 text-center text-2xs text-muted-foreground">No options yet — type to add one.</li>}
        {extra.length > 0 && (
          <>
            {visible.length > 0 && <li className="my-1 h-px bg-border" aria-hidden />}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick("__add__")}
                onMouseEnter={() => setHighlight(visible.length)}
                className={cn("flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px]", highlight === visible.length && "bg-accent")}
                data-testid="chip-add-option"
              >
                <Plus className="size-3.5 text-muted-foreground" />
                <span className="truncate">
                  Add <Chip label={query} color={nextChipColor(column)} size="sm" className="mx-0.5 align-middle" /> to the dropdown
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick("__use__")}
                onMouseEnter={() => setHighlight(visible.length + 1)}
                className={cn("flex h-8 w-full items-center gap-2 rounded-md px-1.5 text-left text-[13px]", highlight === visible.length + 1 && "bg-accent")}
              >
                <span className="size-3.5" />
                <span className="truncate text-muted-foreground">
                  Use <Chip label={query} size="sm" className="mx-0.5 align-middle" /> once
                </span>
              </button>
            </li>
          </>
        )}
      </ul>
    </div>
  );
}

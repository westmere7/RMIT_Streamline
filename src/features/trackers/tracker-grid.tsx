"use client";

import { ALargeSmall, ArrowDownAZ, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpAZ, Bold, Check, ChevronDown, Columns3, Copy, Eraser, ExternalLink, Filter, Hash, Italic, Link2, ListPlus, MoveHorizontal, Package, PanelTop, Pencil, PencilLine, Plus, Redo2, Rows3, Sigma, SlidersHorizontal, Snowflake, Trash2, Type, Underline, Undo2, WrapText } from "lucide-react";
import { toast } from "sonner";
import * as React from "react";
import { flushSync } from "react-dom";
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
import { useEditFocus } from "@/components/shared/inline-edit";
import {
  TRACKER_COLUMN_TYPES,
  TRACKER_COLUMN_TYPE_LABELS,
  TRACKER_NUMBER_FORMATS,
  TRACKER_NUMBER_FORMAT_LABELS,
  TRACKER_SUMMARY_LABELS,
  TRACKER_TEXT_SIZES,
  TRACKER_TEXT_SIZE_LABELS,
  TRACKER_TEXT_SIZE_PX,
  ASSET_ROLES,
  columnLetter,
  type TrackerNumberFormat,
  type TrackerSummaryKind,
  type TrackerCellFormat,
  type TrackerCellValue,
  type TrackerColumn,
  type TrackerColumnType,
  type TrackerRow,
  type TrackerRowKind,
  type TrackerSheet,
  type TrackerTextSize,
  type User,
} from "@/domain";
import { ASSET_ROLE_LABELS, PeopleCellView, PeopleEditor, assetFallbacks, assetRoles, type AssetRole } from "@/features/trackers/tracker-asset-ui";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { type CellAddress, type CellRange, clampAddress, formatCell, frozenOffsets, inRange, parseTsv, rangeBetween, rangeToTsv } from "@/features/trackers/grid-model";
import { EMPTY_VIEW, clearVisible, effectiveSummary, fillDown, fillRange, formatNumber, isViewActive, isViewFiltering, jumpTarget, pasteVisible, projectSheet, selectionStats, summaryKindsFor, type SheetView } from "@/features/trackers/sheet-view";
import { FilterValuesDialog, HeaderViewMarks, SheetViewBar, SummaryCell } from "@/features/trackers/tracker-grid-extras";
import { Chip, ChipColorPicker } from "@/features/trackers/chip";
import { STATUS_COLORS, TEMPLATE_STYLE, chipColor, nextChipColor, resolveOptionColors } from "@/features/trackers/tracker-template";
import { cn } from "@/lib/utils";
import { normalizeLinkHref } from "@/lib/rich-text";
import { MobileRowEditor } from "@/features/trackers/mobile-row-editor";
import { useIsMobile } from "@/hooks/use-mobile";
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
  /** Gives a column a part in the sheet's assets (or none), from its header menu. */
  onAssetRole?: (column: TrackerColumn, role: AssetRole | null) => void;
}

/**
 * What a held mouse button is doing: stretching the selection, pulling the
 * fill handle, picking whole columns or rows, or carrying a block of them.
 */
type Drag =
  | { kind: "cells"; moves: "anchor" | "active"; row: number; col: number }
  | { kind: "fill"; source: CellRange; target: CellRange }
  | { kind: "cols" }
  | { kind: "rows" }
  | { kind: "moveCols"; left: number; right: number; clicked: number; to: number | null; moved: boolean; x: number }
  | { kind: "moveRows"; top: number; bottom: number; clicked: number; to: number | null; moved: boolean; y: number };

const sameRange = (a: CellRange, b: CellRange) => a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;

/** Where the fill handle reaches: along whichever axis the pointer has gone further, as in Excel. */
function fillTargetOf(source: CellRange, row: number, col: number): CellRange {
  const dr = row < source.top ? row - source.top : row > source.bottom ? row - source.bottom : 0;
  const dc = col < source.left ? col - source.left : col > source.right ? col - source.right : 0;
  if (dr === 0 && dc === 0) return source;
  if (Math.abs(dr) >= Math.abs(dc)) return { ...source, top: Math.min(source.top, row), bottom: Math.max(source.bottom, row) };
  return { ...source, left: Math.min(source.left, col), right: Math.max(source.right, col) };
}

/** Which sides of a range a cell sits on: 1 top, 2 right, 4 bottom, 8 left. */
function edgesOf(range: CellRange | null, row: number, col: number): number {
  if (!range || !inRange(range, row, col)) return 0;
  return (row === range.top ? 1 : 0) | (col === range.right ? 2 : 0) | (row === range.bottom ? 4 : 0) | (col === range.left ? 8 : 0);
}

function edgeShadows(edges: number, width: number, color: string): string[] {
  const out: string[] = [];
  if (edges & 1) out.push(`inset 0 ${width}px 0 0 ${color}`);
  if (edges & 2) out.push(`inset -${width}px 0 0 0 ${color}`);
  if (edges & 4) out.push(`inset 0 -${width}px 0 0 ${color}`);
  if (edges & 8) out.push(`inset ${width}px 0 0 0 ${color}`);
  return out;
}

/** A cell's link, when it is one that may be opened. */
const safeLink = (format: TrackerCellFormat | undefined) => (format?.link ? normalizeLinkHref(format.link) : null);
const openLink = (href: string) => void window.open(href, "_blank", "noopener,noreferrer");

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
export function TrackerGrid({ sheet, canEdit, commit, onUndo, onRedo, onAssetRole }: TrackerGridProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState<CellAddress | null>(null);
  const [rowEditorOpen, setRowEditorOpen] = React.useState(false);
  const [anchor, setAnchor] = React.useState<CellAddress | null>(null);
  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const [widthOverrides, setWidthOverrides] = React.useState<Record<string, number>>({});
  const [hoverCol, setHoverCol] = React.useState<number | null>(null);
  const drag = React.useRef<Drag | null>(null);
  const pointer = React.useRef<{ x: number; y: number } | null>(null);
  const scrollFrame = React.useRef<number | null>(null);
  const stopDrag = React.useRef<(() => void) | null>(null);
  const [fillPreview, setFillPreview] = React.useState<CellRange | null>(null);
  const [dropLine, setDropLine] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [linkDraft, setLinkDraft] = React.useState<string | null>(null);
  const view = useUiStore((s) => s.trackerView);
  const setView = useUiStore((s) => s.setTrackerView);
  const rowHeight = ROW_HEIGHTS[view.density];

  // The view (search, filters, sort) is per open sheet and never saved: it
  // narrows what is shown, and every edit below goes through `rows` so it lands
  // on the right real row.
  const [sheetView, setSheetView] = React.useState<SheetView>(EMPTY_VIEW);
  const [filterColumnId, setFilterColumnId] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const projection = React.useMemo(() => projectSheet(sheet, sheetView), [sheet, sheetView]);
  const rows = projection.rows;
  const filtering = isViewFiltering(sheetView);
  const visibleRowsOf = (s: TrackerSheet) => projectSheet(s, sheetView).rows;
  const dataRowCount = (list: TrackerRow[]) => list.filter((r) => r.kind === "data").length;

  const ws = useWorkspace();
  const users = ws.users;
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const roles = React.useMemo(() => assetRoles(sheet.assetMapping), [sheet.assetMapping]);
  // Which column holds each one-column part, by letter, for the header menu.
  const roleHolders = React.useMemo(() => {
    const map = new Map<AssetRole, string>();
    sheet.columns.forEach((c, i) => {
      const role = roles.get(c.id);
      if (role && role !== "spec" && role !== "link") map.set(role, columnLetter(i));
    });
    return map;
  }, [sheet.columns, roles]);
  const fallbacks = React.useMemo(() => assetFallbacks(sheet.assetMapping), [sheet.assetMapping]);
  // The column a linked sheet reads asset types from offers the workspace's
  // asset types, so a row's type is one the dashboard counts.
  const columns = sheet.columns.map((c) => {
    const sized = { ...c, width: widthOverrides[c.id] ?? c.width };
    if (roles.get(c.id) !== "type" || c.type !== "list") return sized;
    const options = [...(c.options ?? [])];
    for (const t of assetTypes) if (!options.some((o) => o.toLowerCase() === t.name.toLowerCase())) options.push(t.name);
    return { ...sized, options };
  });
  const frozen = Math.min(sheet.frozenColumns, columns.length);
  const offsets = frozenOffsets(columns, frozen, GUTTER);
  const totalWidth = GUTTER + columns.reduce((sum, c) => sum + c.width, 0) + 40;
  const range: CellRange | null = active ? rangeBetween(active, anchor ?? active) : null;

  const focusGrid = () => containerRef.current?.focus({ preventScroll: true });
  const select = (address: CellAddress, extend = false) => {
    const next = clampAddress({ rows, columns }, address);
    setActive(next);
    if (!extend) setAnchor(next);
  };
  const cellOf = (address: CellAddress): { row: TrackerRow; column: TrackerColumn } | null => {
    const row = rows[address.row];
    const column = columns[address.col];
    return row && column ? { row, column } : null;
  };
  const selectColumns = (from: number, to: number) => {
    setActive({ row: 0, col: from });
    setAnchor({ row: Math.max(0, rows.length - 1), col: to });
  };
  const selectRows = (from: number, to: number) => {
    setActive({ row: from, col: 0 });
    setAnchor({ row: to, col: Math.max(0, columns.length - 1) });
  };

  // ---- dragging --------------------------------------------------------------

  /** The row and column under a point, held inside the body so a drag past the edge keeps to the edge. */
  const hitAt = (x: number, y: number) => {
    const container = containerRef.current;
    if (!container) return { row: null, col: null, x, y };
    const box = container.getBoundingClientRect();
    const px = Math.min(Math.max(x, box.left + GUTTER + 2), box.right - 14);
    const py = Math.min(Math.max(y, box.top + HEADER_HEIGHT + 2), box.bottom - 34);
    const rowEl = document.elementFromPoint(px, py)?.closest<HTMLElement>("[data-r]");
    let row = rowEl ? Number(rowEl.dataset.r) : null;
    // Below the last row of a short sheet: the last row.
    if (row === null && rows.length > 0) {
      const last = container.querySelector<HTMLElement>(`tbody tr[data-r="${rows.length - 1}"]`);
      if (last && py > last.getBoundingClientRect().bottom) row = rows.length - 1;
    }
    // The column from the headers, which every column has (a band row spans them all).
    // Frozen headers come first, so one sitting over a scrolled column wins.
    let col: number | null = null;
    for (const th of container.querySelectorAll<HTMLElement>("[data-hc]")) {
      const rect = th.getBoundingClientRect();
      if (px >= rect.left && px < rect.right) {
        col = Number(th.dataset.hc);
        break;
      }
    }
    return { row, col, x: px, y: py };
  };

  const track = () => {
    const d = drag.current;
    const p = pointer.current;
    const container = containerRef.current;
    if (!d || !p || !container) return;
    const hit = hitAt(p.x, p.y);
    switch (d.kind) {
      case "cells": {
        const row = hit.row ?? d.row;
        const col = hit.col ?? d.col;
        if (row === d.row && col === d.col) return;
        d.row = row;
        d.col = col;
        if (d.moves === "anchor") setAnchor({ row, col });
        else setActive({ row, col });
        return;
      }
      case "fill": {
        if (hit.row === null && hit.col === null) return;
        const next = fillTargetOf(d.source, hit.row ?? d.source.bottom, hit.col ?? d.source.right);
        if (sameRange(next, d.target)) return;
        d.target = next;
        setFillPreview(sameRange(next, d.source) ? null : next);
        return;
      }
      case "cols":
        if (hit.col !== null) setAnchor({ row: Math.max(0, rows.length - 1), col: hit.col });
        return;
      case "rows":
        if (hit.row !== null) setAnchor({ row: hit.row, col: Math.max(0, columns.length - 1) });
        return;
      case "moveCols": {
        if (!d.moved && Math.abs(p.x - d.x) < 4) return;
        d.moved = true;
        if (hit.col === null) return;
        const th = container.querySelector<HTMLElement>(`[data-hc="${hit.col}"]`);
        if (!th) return;
        const rect = th.getBoundingClientRect();
        const to = hit.x < rect.left + rect.width / 2 ? hit.col : hit.col + 1;
        d.to = to >= d.left && to <= d.right + 1 ? null : to;
        if (d.to === null) return setDropLine(null);
        const edge = d.to < columns.length ? container.querySelector<HTMLElement>(`[data-hc="${d.to}"]`)?.getBoundingClientRect().left : rect.right;
        if (edge === undefined) return;
        const box = container.getBoundingClientRect();
        setDropLine({ left: edge - box.left + container.scrollLeft - 1.5, top: container.scrollTop, width: 3, height: container.clientHeight });
        return;
      }
      case "moveRows": {
        if (!d.moved && Math.abs(p.y - d.y) < 4) return;
        d.moved = true;
        // Rows keep their place while a sort or filter is on.
        if (hit.row === null || isViewActive(sheetView)) return;
        const tr = container.querySelector<HTMLElement>(`tbody tr[data-r="${hit.row}"]`);
        if (!tr) return;
        const rect = tr.getBoundingClientRect();
        const to = hit.y < rect.top + rect.height / 2 ? hit.row : hit.row + 1;
        d.to = to >= d.top && to <= d.bottom + 1 ? null : to;
        if (d.to === null) return setDropLine(null);
        const edge = d.to < rows.length ? container.querySelector<HTMLElement>(`tbody tr[data-r="${d.to}"]`)?.getBoundingClientRect().top : rect.bottom;
        if (edge === undefined) return;
        const box = container.getBoundingClientRect();
        setDropLine({ left: container.scrollLeft, top: edge - box.top + container.scrollTop - 1.5, width: container.clientWidth, height: 3 });
        return;
      }
    }
  };

  /** Scrolls while a drag holds the pointer near (or past) an edge of the body. */
  const autoScroll = () => {
    scrollFrame.current = null;
    const container = containerRef.current;
    const d = drag.current;
    const p = pointer.current;
    if (!container || !d || !p) return;
    const box = container.getBoundingClientRect();
    const edge = 24;
    const speed = (over: number) => Math.min(28, Math.ceil(over / 3));
    const frozenWidth = GUTTER + columns.slice(0, frozen).reduce((sum, c) => sum + c.width, 0);
    let dx = 0;
    let dy = 0;
    if (d.kind !== "cols" && d.kind !== "moveCols") {
      if (p.y > box.bottom - 30 - edge) dy = speed(p.y - (box.bottom - 30 - edge));
      else if (p.y < box.top + HEADER_HEIGHT + edge) dy = -speed(box.top + HEADER_HEIGHT + edge - p.y);
    }
    if (d.kind !== "rows" && d.kind !== "moveRows") {
      if (p.x > box.right - edge) dx = speed(p.x - (box.right - edge));
      else if (p.x < box.left + frozenWidth + edge) dx = -speed(box.left + frozenWidth + edge - p.x);
    }
    if (!dx && !dy) return;
    const left = container.scrollLeft;
    const top = container.scrollTop;
    container.scrollLeft += dx;
    container.scrollTop += dy;
    if (container.scrollLeft === left && container.scrollTop === top) return;
    track();
    scrollFrame.current = requestAnimationFrame(() => live.current.autoScroll());
  };

  const finishDrag = () => {
    const d = drag.current;
    drag.current = null;
    pointer.current = null;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    setDropLine(null);
    setFillPreview(null);
    if (!d) return;
    if (d.kind === "fill") {
      if (sameRange(d.source, d.target)) return;
      const { source, target } = d;
      commit((s) => fillRange(s, visibleRowsOf(s), source, target));
      setActive({ row: target.top, col: target.left });
      setAnchor({ row: target.bottom, col: target.right });
    } else if (d.kind === "moveCols") {
      if (!d.moved) return selectColumns(d.clicked, d.clicked);
      if (d.to === null) return;
      const ids = columns.slice(d.left, d.right + 1).map((c) => c.id);
      const at = d.to > d.right ? d.to - ids.length : d.to;
      commit((s) => TrackerService.moveColumns(s, ids, at));
      selectColumns(at, at + ids.length - 1);
    } else if (d.kind === "moveRows") {
      if (!d.moved) return selectRows(d.clicked, d.clicked);
      if (isViewActive(sheetView)) {
        toast.info("Clear the sort, search and filters to move rows.");
        return;
      }
      if (d.to === null) return;
      const ids = rows.slice(d.top, d.bottom + 1).map((r) => r.id);
      const at = d.to > d.bottom ? d.to - ids.length : d.to;
      commit((s) => TrackerService.moveRows(s, ids, at));
      selectRows(at, at + ids.length - 1);
    }
  };

  // Window listeners outlive a render, so they call the latest of these.
  const live = React.useRef({ track, autoScroll, finishDrag });
  React.useLayoutEffect(() => {
    live.current = { track, autoScroll, finishDrag };
  });

  const beginDrag = (d: Drag, e: React.MouseEvent) => {
    stopDrag.current?.();
    drag.current = d;
    pointer.current = { x: e.clientX, y: e.clientY };
    const move = (ev: MouseEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      live.current.track();
      if (scrollFrame.current === null) scrollFrame.current = requestAnimationFrame(() => live.current.autoScroll());
    };
    const stop = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      stopDrag.current = null;
    };
    const up = () => {
      stop();
      live.current.finishDrag();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    stopDrag.current = stop;
  };
  // A drag still running when the grid goes stops with it.
  React.useEffect(() => () => stopDrag.current?.(), []);

  const onCellMouseDown = (r: number, c: number, e: React.MouseEvent) => {
    if (editing && editing.row === r && editing.col === c) return;
    if (e.button !== 0) {
      if (!range || !inRange(range, r, c)) select({ row: r, col: c });
      return;
    }
    // No text selection while dragging across cells.
    e.preventDefault();
    focusGrid();
    if (canEdit && range && (e.target as HTMLElement).closest("[data-fill-handle]")) return beginDrag({ kind: "fill", source: range, target: range }, e);
    const link = e.ctrlKey || e.metaKey ? safeLink(rows[r]?.formats?.[columns[c]?.id ?? ""]) : null;
    if (link) return openLink(link);
    select({ row: r, col: c }, e.shiftKey);
    beginDrag({ kind: "cells", moves: e.shiftKey ? "active" : "anchor", row: r, col: c }, e);
  };

  const columnBlock = (index: number) => (range && range.top === 0 && range.bottom === rows.length - 1 && range.left <= index && index <= range.right ? range : null);
  const rowBlock = (index: number) => (range && range.left === 0 && range.right === columns.length - 1 && range.top <= index && index <= range.bottom ? range : null);

  /** A header: a click picks the column (Shift stretches), a drag picks more, and a drag from a picked block moves it. */
  const onColumnMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    focusGrid();
    const block = columnBlock(index);
    if (block && canEdit && !e.shiftKey) return beginDrag({ kind: "moveCols", left: block.left, right: block.right, clicked: index, to: null, moved: false, x: e.clientX }, e);
    selectColumns(e.shiftKey && active ? active.col : index, index);
    beginDrag({ kind: "cols" }, e);
  };
  const onRowMouseDown = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    focusGrid();
    const block = rowBlock(index);
    if (block && canEdit && !e.shiftKey) return beginDrag({ kind: "moveRows", top: block.top, bottom: block.bottom, clicked: index, to: null, moved: false, y: e.clientY }, e);
    selectRows(e.shiftKey && active ? active.row : index, index);
    beginDrag({ kind: "rows" }, e);
  };

  // ---- formatting ------------------------------------------------------------

  const activeFormat: TrackerCellFormat = (active && rows[active.row]?.formats?.[columns[active.col]?.id ?? ""]) || {};
  const formatTargets = () =>
    range
      ? rows
          .slice(range.top, range.bottom + 1)
          .filter((r) => r.kind === "data")
          .flatMap((r) => columns.slice(range.left, range.right + 1).map((c) => ({ rowId: r.id, columnId: c.id })))
      : [];
  const applyFormat = (patch: Partial<TrackerCellFormat>) => {
    if (!canEdit) return;
    const cells = formatTargets();
    if (cells.length) commit((s) => TrackerService.setFormats(s, cells, patch));
  };
  // The grid keeps the keys after a toolbar button, so Delete or typing still lands on the cells.
  const formatting = {
    toggle: (key: "bold" | "italic" | "underline") => {
      applyFormat({ [key]: !activeFormat[key] });
      focusGrid();
    },
    size: (size: TrackerTextSize) => {
      applyFormat({ size: size === "md" ? undefined : size });
      focusGrid();
    },
    link: () => {
      if (range) setLinkDraft(activeFormat.link ?? "");
    },
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
    // Rendered at once, so the editor is mounted and focused before the next
    // key: typing "5", Tab, "6" quickly otherwise lands the 6 on the grid while
    // it still thinks nothing is being edited, and it is lost.
    flushSync(() => setEditing({ row: address.row, col: address.col, initial: target.column.type === "person" ? undefined : initial }));
  };

  const toggleCheckbox = (address: CellAddress) => {
    const target = cellOf(address);
    if (!target) return;
    const current = target.row.cells[target.column.id] === true;
    commit((s) => TrackerService.applyEdits(s, [{ rowId: target.row.id, columnId: target.column.id, value: !current }]));
  };

  const commitEdit = (address: CellAddress, raw: string, move: EditMove) => {
    const target = cellOf(address);
    // Closed, saved and moved in one synchronous render, and the grid takes the
    // keys back straight away: a key typed right after Tab or Enter starts the
    // next cell instead of falling on the page while the editor goes.
    flushSync(() => {
      setEditing(null);
      if (target && target.row.kind === "data") {
        const value = TrackerService.coerce(target.column, raw);
        if (value !== (target.row.cells[target.column.id] ?? null)) commit((s) => TrackerService.applyEdits(s, [{ rowId: target.row.id, columnId: target.column.id, value }]));
      }
      if (move === "down") select({ row: address.row + 1, col: address.col });
      if (move === "up") select({ row: address.row - 1, col: address.col });
      if (move === "right") select({ row: address.row, col: address.col + 1 });
      if (move === "left") select({ row: address.row, col: address.col - 1 });
    });
    focusGrid();
  };

  const cancelEdit = () => {
    flushSync(() => setEditing(null));
    focusGrid();
  };

  // ---- clipboard -------------------------------------------------------------

  const copySelection = (event?: React.ClipboardEvent) => {
    if (!range) return;
    const text = rangeToTsv({ ...sheet, rows }, range);
    if (event) {
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    } else void navigator.clipboard?.writeText(text);
  };

  const pasteText = (text: string) => {
    if (!canEdit || !active || !text) return;
    const block = parseTsv(text);
    commit((s) => pasteVisible(s, visibleRowsOf(s), active, block, range));
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
      setAnchor({ row: rows.length - 1, col: columns.length - 1 });
      return;
    }
    if (mod && e.key.toLowerCase() === "f") {
      // Search this sheet, not the workspace.
      e.preventDefault();
      e.stopPropagation();
      searchRef.current?.focus();
      searchRef.current?.select();
      return;
    }
    if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      fillSelection();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && ["b", "i", "u", "k"].includes(e.key.toLowerCase())) {
      // The sheet's own: Ctrl+K is not the app's search here.
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit || !range) return;
      const key = e.key.toLowerCase();
      if (key === "k") formatting.link();
      else formatting.toggle(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
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
    const step = (dr: -1 | 0 | 1, dc: -1 | 0 | 1) => {
      e.preventDefault();
      // Ctrl+Arrow jumps to the edge of the filled block, as in Excel.
      const target = mod ? jumpTarget({ columns }, rows, active, dr, dc) : { row: active.row + dr, col: active.col + dc };
      select(target, e.shiftKey);
    };
    const page = Math.max(1, Math.floor(((containerRef.current?.clientHeight ?? 600) - HEADER_HEIGHT) / rowHeight) - 1);
    switch (e.key) {
      case "ArrowUp":
        return step(-1, 0);
      case "ArrowDown":
        return step(1, 0);
      case "ArrowLeft":
        return step(0, -1);
      case "ArrowRight":
        return step(0, 1);
      case "PageUp":
        e.preventDefault();
        return select({ row: active.row - page, col: active.col }, e.shiftKey);
      case "PageDown":
        e.preventDefault();
        return select({ row: active.row + page, col: active.col }, e.shiftKey);
      case "Home":
        e.preventDefault();
        return select({ row: mod ? 0 : active.row, col: 0 }, e.shiftKey);
      case "End":
        e.preventDefault();
        return select({ row: mod ? rows.length - 1 : active.row, col: columns.length - 1 }, e.shiftKey);
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
        if (canEdit && range) commit((s) => clearVisible(s, visibleRowsOf(s), range));
        return;
      case " ":
        if (e.shiftKey) {
          // Shift+Space selects the row, Ctrl+Space the column — Excel's habits.
          e.preventDefault();
          setActive({ row: active.row, col: 0 });
          setAnchor({ row: active.row, col: columns.length - 1 });
          return;
        }
        if (mod) {
          e.preventDefault();
          setActive({ row: 0, col: active.col });
          setAnchor({ row: rows.length - 1, col: active.col });
          return;
        }
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

  // Rows are inserted relative to the real position of the visible row, so a
  // filtered view still puts the new row where the person pointed.
  const sourceOf = (visibleIndex: number) => projection.sourceIndex[visibleIndex];
  const hiddenRowHint = () => {
    if (filtering) toast.info("Row added, but the current filter hides it. Clear the filter to see it.");
  };
  const insertAbove = (visibleIndex: number, kind: TrackerRowKind = "data") => {
    const at = sourceOf(visibleIndex) ?? sheet.rows.length;
    commit((s) => TrackerService.insertRows(s, at, 1, kind));
    if (kind === "data") hiddenRowHint();
  };
  const insertBelow = (visibleIndex: number, kind: TrackerRowKind = "data") => {
    const source = sourceOf(visibleIndex);
    const at = source === undefined ? sheet.rows.length : source + 1;
    commit((s) => TrackerService.insertRows(s, at, 1, kind));
    if (kind === "data") hiddenRowHint();
  };
  const selectedRowIds = () => (range ? rows.slice(range.top, range.bottom + 1).map((r) => r.id) : []);
  const fillSelection = () => {
    if (!canEdit || !range) return;
    commit((s) => fillDown(s, visibleRowsOf(s), range));
  };
  // Toolbar actions work on the selection, or on the end of the sheet when nothing is selected.
  const toolbar = {
    insertRow: () => (range ? insertBelow(range.bottom) : insertAbove(rows.length)),
    insertColumn: () => commit((s) => TrackerService.insertColumn(s, active ? active.col + 1 : s.columns.length)),
    deleteRows: () => range && commit((s) => TrackerService.deleteRows(s, selectedRowIds())),
    clear: () => range && commit((s) => clearVisible(s, visibleRowsOf(s), range)),
    fillDown: fillSelection,
    setKind: (kind: TrackerRowKind) => range && commit((s) => TrackerService.setRowKind(s, selectedRowIds(), kind)),
    freeze: () => active && commit((s) => ({ ...s, frozenColumns: s.frozenColumns === active.col + 1 ? 0 : active.col + 1 })),
  };

  // Keep the active cell in view when the keyboard moves it under the sticky
  // header, the frozen columns or the summary footer.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !active) return;
    const cell = container.querySelector<HTMLElement>('[data-active="true"]');
    if (!cell) return;
    const box = container.getBoundingClientRect();
    const rect = cell.getBoundingClientRect();
    const frozenWidth = GUTTER + columns.slice(0, frozen).reduce((sum, c) => sum + c.width, 0);
    const footer = 30;
    if (rect.top < box.top + HEADER_HEIGHT) container.scrollTop -= box.top + HEADER_HEIGHT - rect.top;
    else if (rect.bottom > box.bottom - footer) container.scrollTop += rect.bottom - (box.bottom - footer);
    if (active.col >= frozen) {
      if (rect.left < box.left + frozenWidth) container.scrollLeft -= box.left + frozenWidth - rect.left;
      else if (rect.right > box.right) container.scrollLeft += rect.right - box.right;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the active cell moves; widths are read live
  }, [active]);

  /** Double-clicking a column's edge: as wide as its longest value, as in Excel. */
  const autoFit = (column: TrackerColumn) => {
    const width = fitWidth(column, sheet.rows);
    if (width !== column.width) commit((s) => TrackerService.updateColumn(s, column.id, { width }));
  };

  const resizeColumn = (column: TrackerColumn, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = column.width;
    const onMove = (e: PointerEvent) => setWidthOverrides((prev) => ({ ...prev, [column.id]: Math.round(Math.max(MIN_COLUMN_WIDTH, startWidth + (e.clientX - startX))) }));
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

  // The touch alternative to editing in the grid: the selected data row as a
  // stack of labelled fields. Only offered below md, and only for a data row —
  // a section or total row has nothing to fill in.
  const activeDataRow = active ? (rows[active.row]?.kind === "data" ? rows[active.row]! : null) : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <GridToolbar
        canEdit={canEdit}
        hasSelection={!!range}
        activeCol={active?.col ?? null}
        frozen={frozen}
        view={view}
        onView={setView}
        onUndo={onUndo}
        onRedo={onRedo}
        actions={toolbar}
        format={activeFormat}
        formatting={formatting}
        onEditRow={canEdit && activeDataRow ? () => setRowEditorOpen(true) : null}
      />
      <SheetViewBar sheet={sheet} view={sheetView} hidden={projection.hiddenDataRows} visibleDataRows={dataRowCount(rows)} onChange={setSheetView} searchRef={searchRef} />
      <MobileRowEditor sheet={sheet} row={activeDataRow} open={rowEditorOpen} onOpenChange={setRowEditorOpen} commit={commit} users={users} />
      <div
        ref={containerRef}
        tabIndex={0}
        role="grid"
        aria-label={`${sheet.name} sheet`}
        aria-rowcount={rows.length + 2}
        aria-colcount={columns.length + 1}
        data-testid="tracker-grid"
        className="scrollbar-thin relative flex-1 overflow-auto outline-none"
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
                  movable={canEdit && !!columnBlock(index)}
                  sort={sheetView.sort?.columnId === column.id ? sheetView.sort.direction : null}
                  filtered={column.id in sheetView.filters}
                  onSort={(direction) => setSheetView((v) => ({ ...v, sort: direction ? { columnId: column.id, direction } : null }))}
                  onFilter={() => setFilterColumnId(column.id)}
                  onHeaderMouseDown={(e) => onColumnMouseDown(index, e)}
                  onResize={(e) => resizeColumn(column, e)}
                  onAutoFit={() => autoFit(column)}
                  role={roles.get(column.id) ?? null}
                  onAssetRole={onAssetRole ? (role) => onAssetRole(column, role) : undefined}
                  roleHolders={roleHolders}
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
            {rows.map((row, r) => (
              <GridRow
                key={row.id}
                row={row}
                index={r}
                columns={columns}
                frozen={frozen}
                offsets={offsets}
                range={range}
                fillPreview={fillPreview}
                active={active}
                editing={editing?.row === r ? editing : null}
                canEdit={canEdit}
                onMouseDownCell={(c, e) => onCellMouseDown(r, c, e)}
                onMouseEnterCell={setHoverCol}
                view={view}
                rowHeight={rowHeight}
                users={users}
                fallbacks={fallbacks}
                striped={view.stripes && r % 2 === 1}
                onDoubleClickCell={(c) => startEdit({ row: r, col: c })}
                onGutterMouseDown={(e) => onRowMouseDown(r, e)}
                movable={canEdit && !!rowBlock(r)}
                sourceIndex={sourceOf(r) ?? r}
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
                        insertAbove: () => insertAbove(r),
                        insertBelow: () => insertBelow(r),
                        insertSection: (kind) => insertAbove(r, kind),
                        duplicate: () => commit((s) => TrackerService.duplicateRows(s, selectedRowIds().length ? selectedRowIds() : [row.id])),
                        setKind: (kind) => commit((s) => TrackerService.setRowKind(s, selectedRowIds().length ? selectedRowIds() : [row.id], kind)),
                        remove: () => commit((s) => TrackerService.deleteRows(s, selectedRowIds().length ? selectedRowIds() : [row.id])),
                        clear: () => range && commit((s) => clearVisible(s, visibleRowsOf(s), range)),
                        fillDown: fillSelection,
                        copy: () => copySelection(),
                        selectedCount: selectedRowIds().length || 1,
                      }
                    : null
                }
              />
            ))}
          </tbody>
          <tfoot>
            <tr style={{ height: 30 }} data-testid="summary-row">
              <td className="sticky bottom-0 left-0 z-30 border-t border-r bg-surface text-center text-2xs text-muted-foreground" aria-label="Summary">
                <Sigma className="mx-auto size-3" aria-hidden />
              </td>
              {columns.map((column, c) => (
                <SummaryCell
                  key={column.id}
                  column={column}
                  rows={rows}
                  canEdit={canEdit}
                  frozen={c < frozen}
                  isFrozenEdge={c === frozen - 1}
                  left={offsets[c]}
                  onChangeSummary={(kind) => commit((s) => TrackerService.updateColumn(s, column.id, { summary: kind }))}
                />
              ))}
              <td className="sticky bottom-0 border-t bg-surface" />
            </tr>
          </tfoot>
        </table>
        {dropLine && <div aria-hidden className="pointer-events-none absolute z-40 rounded-full bg-ring" style={dropLine} data-testid="grid-drop-line" />}
        {canEdit && (
          <div className="sticky left-0 px-3 py-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => commit((s) => TrackerService.insertRows(s, s.rows.length, 5))} data-testid="add-rows">
              <Plus /> Add 5 rows
            </Button>
          </div>
        )}
      </div>
      <div className="flex h-7 items-center gap-3 border-t px-3 text-2xs text-muted-foreground">
        <span data-testid="row-count">
          {filtering ? `${dataRowCount(rows)} of ${dataRowCount(sheet.rows)} rows` : `${dataRowCount(sheet.rows)} rows`} · {columns.length} columns
        </span>
        {active && (
          <span className="tabular">
            {columnLetter(active.col)}
            {(sourceOf(active.row) ?? active.row) + 1}
            {range && (range.top !== range.bottom || range.left !== range.right) ? ` · ${range.bottom - range.top + 1}×${range.right - range.left + 1} selected` : ""}
          </span>
        )}
        {range && (range.top !== range.bottom || range.left !== range.right) && <SelectionStats sheet={sheet} rows={rows.slice(range.top, range.bottom + 1)} left={range.left} right={range.right} />}
        {canEdit && <span className="ml-auto hidden lg:inline">Type to edit · Drag the corner to fill · Drag picked headers to move · Right-click for more</span>}
      </div>
      <LinkDialog
        value={linkDraft}
        onClose={() => {
          setLinkDraft(null);
          focusGrid();
        }}
        onApply={(link) => applyFormat({ link: link ?? undefined })}
      />
      {filterColumnId && sheet.columns.some((c) => c.id === filterColumnId) && (
        <FilterValuesDialog
          sheet={sheet}
          column={sheet.columns.find((c) => c.id === filterColumnId)!}
          selected={sheetView.filters[filterColumnId] ?? []}
          open
          onOpenChange={(open) => !open && setFilterColumnId(null)}
          onApply={(values) =>
            setSheetView((v) => {
              const filters = { ...v.filters };
              if (values) filters[filterColumnId] = values;
              else delete filters[filterColumnId];
              return { ...v, filters };
            })
          }
        />
      )}
    </div>
  );
}

type EditMove = "down" | "up" | "right" | "left" | "none";

/** Excel's status-bar habit: count, sum and average of what is selected. */
function SelectionStats({ sheet, rows, left, right }: { sheet: TrackerSheet; rows: TrackerRow[]; left: number; right: number }) {
  const stats = selectionStats(sheet, rows, left, right);
  if (stats.count === 0) return null;
  return (
    <span className="tabular" data-testid="selection-stats">
      Count {stats.count}
      {stats.sum !== null && ` · Sum ${formatNumber(stats.sum, "plain")} · Avg ${formatNumber(stats.average ?? 0, "plain")}`}
    </span>
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
  /** Part of a picked block of whole columns, so a drag from here moves them. */
  movable: boolean;
  sort: "asc" | "desc" | null;
  filtered: boolean;
  onSort: (direction: "asc" | "desc" | null) => void;
  onFilter: () => void;
  onHeaderMouseDown: (e: React.MouseEvent) => void;
  onResize: (e: React.PointerEvent) => void;
  onAutoFit: () => void;
  /** The part the column plays in the sheet's assets, when it plays one. */
  role: AssetRole | null;
  onAssetRole?: (role: AssetRole | null) => void;
  /** The letter of the column holding each one-column part. */
  roleHolders?: ReadonlyMap<AssetRole, string>;
  onChange: (patch: Partial<Omit<TrackerColumn, "id">>) => void;
  onInsert: (side: "left" | "right") => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  onFreeze: () => void;
}

function ColumnHeader({ column, index, count, frozen, isFrozenEdge, left, canEdit, selected, movable, sort, filtered, onSort, onFilter, onHeaderMouseDown, onResize, onAutoFit, role, onAssetRole, roleHolders, onChange, onInsert, onMove, onDelete, onFreeze }: ColumnHeaderProps) {
  const [renaming, setRenaming] = React.useState(false);
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(column.name);
  const renameRef = React.useRef<HTMLInputElement>(null);
  const settling = useEditFocus(renaming, renameRef);
  const startRename = () => {
    if (!canEdit) return;
    setDraft(column.name);
    setRenaming(true);
  };
  const finishRename = () => {
    if (draft.trim() && draft.trim() !== column.name) onChange({ name: draft.trim() });
    setRenaming(false);
  };

  // Sorting and filtering change only what is shown, so viewers get them too.
  const viewMenu = (
    <>
      <DropdownMenuLabel>
        {columnLetter(index)} · {TRACKER_COLUMN_TYPE_LABELS[column.type]}
      </DropdownMenuLabel>
      <DropdownMenuItem onSelect={() => onSort(sort === "asc" ? null : "asc")}>
        <ArrowDownAZ /> {sort === "asc" ? "Remove sort" : "Sort A → Z"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSort(sort === "desc" ? null : "desc")}>
        <ArrowUpAZ /> {sort === "desc" ? "Remove sort" : "Sort Z → A"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onFilter}>
        <Filter /> {filtered ? "Change filter…" : "Filter by value…"}
      </DropdownMenuItem>
    </>
  );

  const menu = (
    <>
      <DropdownMenuLabel>
        {columnLetter(index)} · {TRACKER_COLUMN_TYPE_LABELS[column.type]}
      </DropdownMenuLabel>
      <DropdownMenuItem onSelect={startRename}>
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
      {column.type === "number" && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Hash /> Number format
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={column.numberFormat ?? "plain"} onValueChange={(format) => onChange({ numberFormat: format as TrackerNumberFormat })}>
              {TRACKER_NUMBER_FORMATS.map((format) => (
                <DropdownMenuRadioItem key={format} value={format}>
                  {TRACKER_NUMBER_FORMAT_LABELS[format]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Sigma /> Summary
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={effectiveSummary(column)} onValueChange={(kind) => onChange({ summary: kind as TrackerSummaryKind })}>
            {summaryKindsFor(column).map((kind) => (
              <DropdownMenuRadioItem key={kind} value={kind}>
                {TRACKER_SUMMARY_LABELS[kind]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {onAssetRole && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Package /> Asset role
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={role ?? "none"} onValueChange={(next) => onAssetRole(next === "none" ? null : (next as AssetRole))}>
              <DropdownMenuRadioItem value="none">None</DropdownMenuRadioItem>
              {ASSET_ROLES.map((r) => (
                <DropdownMenuRadioItem key={r} value={r} data-testid={`asset-role-${r}`}>
                  {ASSET_ROLE_LABELS[r]}
                  {/* Held by another column: picking it here moves it. */}
                  {r !== role && roleHolders?.get(r) && <span className="ml-auto pl-3 font-mono text-2xs text-muted-foreground">{roleHolders.get(r)}</span>}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => onSort(sort === "asc" ? null : "asc")}>
        <ArrowDownAZ /> {sort === "asc" ? "Remove sort" : "Sort A → Z"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onSort(sort === "desc" ? null : "desc")}>
        <ArrowUpAZ /> {sort === "desc" ? "Remove sort" : "Sort Z → A"}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onFilter}>
        <Filter /> {filtered ? "Change filter…" : "Filter by value…"}
      </DropdownMenuItem>
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
      <DropdownMenuItem onSelect={onAutoFit}>
        <MoveHorizontal /> Fit width to contents
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
      data-hc={index}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn("flex h-full items-center gap-1 pr-6 pl-2 select-none", movable && "cursor-grab active:cursor-grabbing")}
            style={{ height: HEADER_HEIGHT }}
            onMouseDown={(e) => e.button === 0 && !renaming && onHeaderMouseDown(e)}
            onDoubleClick={(e) => {
              if (renaming) return;
              e.preventDefault();
              startRename();
            }}
          >
            {renaming ? (
              <Input
                ref={renameRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  // A closing menu takes focus back for a moment; that is not leaving the field.
                  if (settling()) return;
                  finishRename();
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") finishRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                className="h-6 border-white/40 bg-white/15 px-1 text-xs font-semibold text-white caret-white selection:bg-white/35 selection:text-white focus-visible:border-white/70 dark:bg-white/15"
                aria-label="Column name"
              />
            ) : (
              <>
                {role && (
                  <SimpleTooltip label={`${ASSET_ROLE_LABELS[role]} of each asset`}>
                    <Package className="size-3 shrink-0 text-white/70" aria-label={`Asset ${ASSET_ROLE_LABELS[role].toLowerCase()}`} data-testid="asset-role-mark" />
                  </SimpleTooltip>
                )}
                <span className="truncate" title={column.name}>
                  {column.name}
                </span>
                <HeaderViewMarks sorted={sort} filtered={filtered} />
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
          {contextFromDropdown(canEdit ? menu : viewMenu)}
        </ContextMenuContent>
      </ContextMenu>
      {(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${column.name} column options`}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-white/60 opacity-0 hover:bg-white/15 hover:text-white group-hover/col:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(e) => renaming && e.preventDefault()}>
            {canEdit ? menu : viewMenu}
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
          onDoubleClick={(e) => {
            e.stopPropagation();
            onAutoFit();
          }}
          title="Drag to resize, double-click to fit"
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
  fillDown: () => void;
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
  /** Where the fill handle is being pulled to. */
  fillPreview: CellRange | null;
  active: CellAddress | null;
  editing: EditingState | null;
  canEdit: boolean;
  onMouseDownCell: (col: number, e: React.MouseEvent) => void;
  onMouseEnterCell: (col: number) => void;
  onDoubleClickCell: (col: number) => void;
  onGutterMouseDown: (e: React.MouseEvent) => void;
  /** Part of a picked block of whole rows, so a drag from the number moves them. */
  movable: boolean;
  /** Position in the real sheet, shown in the gutter (visible index differs under a filter or sort). */
  sourceIndex: number;
  onCommitEdit: (col: number, raw: string, move: EditMove) => void;
  onCancelEdit: () => void;
  onLabelChange: (label: string) => void;
  onToggleCheckbox: (col: number) => void;
  /** Adds a typed value to the column's dropdown before storing it. */
  onAddOption: (col: number, option: string) => void;
  rowMenu: RowMenuHandlers | null;
  view: TrackerViewSettings;
  rowHeight: number;
  striped: boolean;
  users: User[];
  /** What empty cells of a mapped column stand for (see assetFallbacks). */
  fallbacks: Map<string, string>;
}

const GridRow = React.memo(function GridRow({
  row,
  index,
  columns,
  frozen,
  offsets,
  range,
  fillPreview,
  active,
  editing,
  canEdit,
  onMouseDownCell,
  onMouseEnterCell,
  onDoubleClickCell,
  onGutterMouseDown,
  movable,
  sourceIndex,
  onCommitEdit,
  onCancelEdit,
  onLabelChange,
  onToggleCheckbox,
  onAddOption,
  rowMenu,
  view,
  rowHeight,
  striped,
  users,
  fallbacks,
}: GridRowProps) {
  const rowSelected = !!range && range.top <= index && index <= range.bottom;
  const inActiveRow = view.crosshair && active?.row === index;
  const gutter = (
    <td
      className={cn(
        "sticky left-0 z-20 border-r border-b bg-surface text-center text-2xs text-muted-foreground tabular select-none transition-colors group-hover/row:bg-accent group-hover/row:text-foreground",
        (rowSelected || inActiveRow) && "bg-accent text-foreground",
        movable && "cursor-grab active:cursor-grabbing",
      )}
      style={{ width: GUTTER }}
      onMouseDown={(e) => e.button === 0 && onGutterMouseDown(e)}
      role="rowheader"
    >
      {sourceIndex + 1}
    </td>
  );

  const content =
    row.kind !== "data" ? (
      <tr style={{ height: rowHeight }} aria-rowindex={index + 2} className="group/row" data-testid="grid-section-row" data-r={index}>
        {gutter}
        <SectionCell row={row} span={columns.length + 1} canEdit={canEdit} selected={rowSelected} onChange={onLabelChange} onMouseDown={(e) => onMouseDownCell(0, e)} />
      </tr>
    ) : (
      <tr style={{ height: view.wrap ? undefined : rowHeight, minHeight: rowHeight }} aria-rowindex={index + 2} className="group/row" data-r={index}>
        {gutter}
        {columns.map((column, c) => (
          <GridCell
            key={column.id}
            column={column}
            col={c}
            value={row.cells[column.id]}
            format={row.formats?.[column.id]}
            frozen={c < frozen}
            isFrozenEdge={c === frozen - 1}
            left={offsets[c]}
            selected={!!range && inRange(range, index, c)}
            edges={edgesOf(range, index, c)}
            fillEdges={edgesOf(fillPreview, index, c)}
            handle={canEdit && !!range && range.bottom === index && range.right === c && !editing}
            active={!!active && active.row === index && active.col === c}
            crosshair={view.crosshair && !!active && (active.row === index || active.col === c)}
            gridLines={view.gridLines}
            wrap={view.wrap}
            striped={striped}
            rowHeight={rowHeight}
            users={users}
            fallback={fallbacks.get(column.id)}
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
        <ContextMenuItem onSelect={rowMenu.fillDown}>
          <ArrowDownToLine /> Fill down
          <span className="ml-auto text-2xs text-muted-foreground">Ctrl+D</span>
        </ContextMenuItem>
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
  /** The column's place, read back by a drag. */
  col: number;
  value: TrackerCellValue | undefined;
  format: TrackerCellFormat | undefined;
  frozen: boolean;
  isFrozenEdge: boolean;
  left: number | undefined;
  selected: boolean;
  /** The selection's sides this cell sits on (see edgesOf). */
  edges: number;
  /** The same for the fill handle's reach. */
  fillEdges: number;
  /** The fill handle: the selection's bottom-right corner. */
  handle: boolean;
  active: boolean;
  editing: EditingState | null;
  canEdit: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onDoubleClick: () => void;
  onCommit: (raw: string, move: EditMove) => void;
  onCancel: () => void;
  onToggle: () => void;
  onAddOption: (option: string) => void;
  crosshair: boolean;
  gridLines: boolean;
  wrap: boolean;
  striped: boolean;
  rowHeight: number;
  users: User[];
  /** Shown faintly while the cell is empty: the value every empty cell of this column counts as. */
  fallback?: string;
}

const GridCell = React.memo(function GridCell({
  column,
  col,
  value,
  format,
  frozen,
  isFrozenEdge,
  left,
  selected,
  edges,
  fillEdges,
  handle,
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
  users,
  fallback,
}: GridCellProps) {
  const text = column.type === "number" && typeof value === "number" && column.numberFormat && column.numberFormat !== "plain" ? formatNumber(value, column.numberFormat) : formatCell(column, value);
  const isChip = column.type === "list" && typeof value === "string" && value !== "";
  const tint: string | undefined = undefined;
  const link = safeLink(format);
  // The selection's outline and the fill handle's reach are drawn inside the
  // cells on the range's edges; the active cell stays clear, as in Excel.
  const shadows = [...edgeShadows(edges, 2, "var(--ring)"), ...edgeShadows(fillEdges, 2, "color-mix(in srgb, var(--ring) 55%, transparent)")];
  if (isFrozenEdge) shadows.push("2px 0 0 0 var(--border)");
  const shaded = selected && !active;
  return (
    <td
      role="gridcell"
      aria-label={text ? `${column.name}: ${text}` : `${column.name}: empty`}
      aria-selected={selected || undefined}
      data-active={active || undefined}
      data-c={col}
      data-testid="grid-cell"
      className={cn(
        "p-0 align-middle transition-colors",
        gridLines ? "border-r border-b" : "border-b border-transparent",
        frozen ? "sticky z-10 bg-background" : "relative bg-background",
        // An open editor (dropdown list, long-text box) spills over neighbouring
        // cells, which paint later and would otherwise draw their borders across it.
        editing && "z-50",
        !tint && striped && "bg-foreground/[0.03]",
        !tint && crosshair && "bg-ring/[0.06]",
        !tint && !shaded && "hover:bg-accent",
      )}
      style={{
        left: frozen ? left : undefined,
        boxShadow: shadows.length ? shadows.join(", ") : undefined,
        ...(shaded ? { backgroundColor: "color-mix(in srgb, var(--ring) 13%, var(--background))" } : {}),
        ...(tint ? { backgroundColor: `#${tint}`, color: "#1c1d2b" } : {}),
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onDoubleClick={onDoubleClick}
    >
      {editing ? (
        <CellEditor column={column} value={value} initial={editing.initial} onCommit={onCommit} onCancel={onCancel} onAddOption={onAddOption} users={users} />
      ) : (
        <div
          className={cn(
            "flex items-center gap-1 overflow-hidden px-2",
            wrap && column.type === "longText" ? "py-1.5 leading-snug whitespace-normal" : "whitespace-nowrap",
            column.type === "number" && "justify-end tabular",
            selected && tint && "brightness-95",
            format?.bold && "font-bold",
            format?.italic && "italic",
            format?.underline && "underline underline-offset-2",
          )}
          style={{ minHeight: rowHeight - 2, height: wrap && column.type === "longText" ? undefined : rowHeight - 2, fontSize: format?.size ? TRACKER_TEXT_SIZE_PX[format.size] : undefined }}
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
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover/chip:opacity-100 hover:bg-foreground/10 hover:text-foreground pointer-coarse:opacity-100"
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
          ) : column.type === "person" ? (
            <PeopleCellView value={value || fallback} users={users} faded={!value && !!fallback} />
          ) : !text && fallback ? (
            <span className="truncate text-muted-foreground/60 italic" title="Every empty cell in this column counts as this">
              {formatCell(column, fallback)}
            </span>
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
          ) : link ? (
            <>
              <span className={cn("text-blue-700 dark:text-blue-300", wrap && column.type === "longText" ? "line-clamp-3" : "truncate")} title={link}>
                {text}
              </span>
              {active && (
                <button
                  type="button"
                  aria-label="Open link"
                  title={link}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => openLink(link)}
                  className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-blue-700 hover:bg-foreground/10 dark:text-blue-300"
                  data-testid="cell-open-link"
                >
                  <ExternalLink className="size-3.5" />
                </button>
              )}
            </>
          ) : (
            <span className={cn(wrap && column.type === "longText" ? "line-clamp-3" : "truncate")}>{text}</span>
          )}
        </div>
      )}
      {handle && <span data-fill-handle aria-hidden className="absolute -right-[4px] -bottom-[4px] z-[15] size-[8px] cursor-crosshair rounded-[1px] border border-background bg-ring after:absolute after:-inset-1.5 after:content-['']" data-testid="fill-handle" />}
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
    fillDown: () => void;
    setKind: (kind: TrackerRowKind) => void;
    freeze: () => void;
  };
  /** The active cell's formatting, shown as pressed buttons. */
  format: TrackerCellFormat;
  formatting: {
    toggle: (key: "bold" | "italic" | "underline") => void;
    size: (size: TrackerTextSize) => void;
    link: () => void;
  };
  /** Opens the row editor; null when there is no data row selected or no phone. */
  onEditRow?: (() => void) | null;
}

/** Editing actions and view settings, Excel-ribbon style but small. */
function GridToolbar({ canEdit, hasSelection, activeCol, frozen, view, onView, onUndo, onRedo, actions, format, formatting, onEditRow }: GridToolbarProps) {
  const frozenHere = activeCol !== null && frozen === activeCol + 1;
  const isMobile = useIsMobile();
  return (
    <div role="toolbar" aria-label="Sheet tools" className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5" data-testid="grid-toolbar">
      {isMobile && (
        <Button size="sm" variant="outline" disabled={!onEditRow} onClick={() => onEditRow?.()} className="mr-1" data-testid="mobile-edit-row">
          <PencilLine /> Edit row
        </Button>
      )}
      {canEdit && (
        <>
          <ToolButton label="Undo (Ctrl+Z)" onClick={onUndo}>
            <Undo2 />
          </ToolButton>
          <ToolButton label="Redo (Ctrl+Y)" onClick={onRedo}>
            <Redo2 />
          </ToolButton>
          <Divider />
          <ToolButton label="Bold (Ctrl+B)" onClick={() => formatting.toggle("bold")} disabled={!hasSelection} pressed={!!format.bold}>
            <Bold />
          </ToolButton>
          <ToolButton label="Italic (Ctrl+I)" onClick={() => formatting.toggle("italic")} disabled={!hasSelection} pressed={!!format.italic}>
            <Italic />
          </ToolButton>
          <ToolButton label="Underline (Ctrl+U)" onClick={() => formatting.toggle("underline")} disabled={!hasSelection} pressed={!!format.underline}>
            <Underline />
          </ToolButton>
          <ToolButton label="Link (Ctrl+K)" onClick={formatting.link} disabled={!hasSelection} pressed={!!format.link}>
            <Link2 />
          </ToolButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={!hasSelection} title="Text size" data-testid="toolbar-text-size">
                <ALargeSmall /> {TRACKER_TEXT_SIZE_LABELS[format.size ?? "md"]} <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36" onCloseAutoFocus={(e) => e.preventDefault()}>
              <DropdownMenuRadioGroup value={format.size ?? "md"} onValueChange={(size) => formatting.size(size as TrackerTextSize)}>
                {TRACKER_TEXT_SIZES.map((size) => (
                  <DropdownMenuRadioItem key={size} value={size}>
                    <span style={{ fontSize: TRACKER_TEXT_SIZE_PX[size] }}>{TRACKER_TEXT_SIZE_LABELS[size]}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
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
          <ToolButton label="Fill down (Ctrl+D)" onClick={actions.fillDown} disabled={!hasSelection}>
            <ArrowDownToLine />
          </ToolButton>
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

/** A link on the selected cells: the text stays, the link opens from the cell. */
function LinkDialog({ value, onClose, onApply }: { value: string | null; onClose: () => void; onApply: (link: string | null) => void }) {
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">{value !== null && <LinkForm initial={value} onClose={onClose} onApply={onApply} />}</DialogContent>
    </Dialog>
  );
}

function LinkForm({ initial, onClose, onApply }: { initial: string; onClose: () => void; onApply: (link: string | null) => void }) {
  const [draft, setDraft] = React.useState(initial);
  const [invalid, setInvalid] = React.useState(false);
  const apply = () => {
    const href = normalizeLinkHref(draft);
    if (!href) return setInvalid(true);
    onApply(href);
    onClose();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Link</DialogTitle>
        <DialogDescription>Opens from the cell.</DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="https://…"
        aria-label="Link address"
        aria-invalid={invalid || undefined}
        data-testid="cell-link-input"
      />
      {invalid && <p className="text-xs text-destructive">Not a web address.</p>}
      <DialogFooter>
        {initial && (
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              onApply(null);
              onClose();
            }}
          >
            Remove link
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={apply} disabled={!draft.trim()}>
          Apply
        </Button>
      </DialogFooter>
    </>
  );
}

function CellEditor({
  column,
  value,
  initial,
  onCommit,
  onCancel,
  onAddOption,
  users,
}: {
  column: TrackerColumn;
  value: TrackerCellValue | undefined;
  initial?: string;
  onCommit: (raw: string, move: EditMove) => void;
  onCancel: () => void;
  onAddOption: (option: string) => void;
  users: User[];
}) {
  const current = initial ?? (column.type === "date" && typeof value === "string" ? value : formatCell(column, value));
  const [draft, setDraft] = React.useState(current);
  const committed = React.useRef(false);
  const finish = (move: EditMove, raw = draft) => {
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
      finish(e.shiftKey ? "left" : "right");
    } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      finish(e.shiftKey ? "up" : "down");
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
  if (column.type === "person") {
    return <PeopleEditor value={typeof value === "string" ? value : ""} users={users} onCommit={(ids) => finish("none", ids ?? "")} onCancel={onCancel} />;
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

let measureCanvas: HTMLCanvasElement | null = null;

/** How wide a text is in the grid's font, in pixels. */
function textWidth(text: string, font: string): number {
  if (typeof document === "undefined") return text.length * 7;
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 7;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/**
 * The width a column needs for its name and its longest value, the way Excel
 * fits a column on a double-click of its edge. Chips, faces and the header's
 * menu button are allowed for; very long text stops at a sensible width.
 */
export function fitWidth(column: TrackerColumn, rows: TrackerRow[]): number {
  const family = typeof document === "undefined" ? "sans-serif" : getComputedStyle(document.body).fontFamily || "sans-serif";
  let widest = textWidth(column.name, `600 12px ${family}`) + 44;
  const extra = column.type === "list" ? 34 : column.type === "person" ? 52 : column.type === "url" ? 34 : 20;
  for (const row of rows) {
    if (row.kind !== "data") continue;
    const value = row.cells[column.id];
    if (value === undefined || value === null || value === "") continue;
    const shown = column.type === "number" && typeof value === "number" && column.numberFormat && column.numberFormat !== "plain" ? formatNumber(value, column.numberFormat) : formatCell(column, value);
    const longest = column.type === "longText" ? shown.split("\n").reduce((a, b) => (b.length > a.length ? b : a), "") : shown;
    widest = Math.max(widest, textWidth(longest, `13px ${family}`) + extra);
  }
  if (column.type === "checkbox") widest = Math.max(widest, 70);
  return Math.round(Math.min(480, Math.max(MIN_COLUMN_WIDTH, widest)));
}

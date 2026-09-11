"use client";

import { ArchiveRestore, CornerDownRight, Maximize2, MoreHorizontal, RefreshCw, Trash2 } from "lucide-react";
import * as React from "react";
import { renderContext, renderDropdown, useMenuFocusGuard, type MenuAction } from "@/components/layout/row-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { BoardGroup, Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, columnCellStyle, leadingCellStyle } from "@/features/boards/board-model";
import { CellRenderer } from "@/features/boards/components/cells/cell-renderer";
import { ReferenceCell, ReferenceHeaderCell } from "@/features/boards/components/table/reference-cell";
import { colorClasses } from "@/lib/colors";
import { formatDateTime, formatRelative } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

/**
 * Two columns the board itself has no use for.
 *
 * Where a row came from is the board's grouping, which the archive does not
 * have: with no groups to sit under, every row says for itself where restoring
 * would put it back. When it was archived is the order the list is in, so it is
 * on the row that is being ordered.
 */
const RESTORES_TO_WIDTH = 160;
const ARCHIVED_AT_WIDTH = 150;

export interface ArchiveTableProps {
  /** The rows of the page, in the order the query returned them. */
  items: Item[];
  groupsById: Map<string, BoardGroup>;
  selectedIds: string[];
  /**
   * Takes an updater rather than a list: two ticks in the same tick of the
   * clock both read the selection as it was when the rows rendered, so a plain
   * list has the second overwrite the first and only one row ends up ticked.
   */
  onSelectedChange: React.Dispatch<React.SetStateAction<string[]>>;
  onRestore: (itemIds: string[]) => void;
  onDelete: (itemIds: string[]) => void;
  /** True while the next page is being fetched; the rows on screen are the previous page. */
  busy: boolean;
  canManage: boolean;
}

/**
 * The archive's table: one flat list, read-only, and no groups.
 *
 * A page is at most fifty rows, so there is nothing to window and nothing to
 * drag — the order is the query's, not the board's, and rearranging rows that
 * are not on a board would mean nothing. Cells are the board's own, rendered
 * read-only, so an archived task looks like the task it was.
 */
export function ArchiveTable({ items, groupsById, selectedIds, onSelectedChange, onRestore, onDelete, busy, canManage }: ArchiveTableProps) {
  const { model, showReference } = useBoardContext();
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id));

  const toggle = (itemId: string, next: boolean) => {
    onSelectedChange((current) => (next ? [...current, itemId] : current.filter((id) => id !== itemId)));
  };

  const width =
    TABLE_LAYOUT.selectWidth +
    (showReference ? TABLE_LAYOUT.referenceWidth : 0) +
    TABLE_LAYOUT.nameWidth +
    model.visibleColumns.reduce((sum, c) => sum + c.width, 0) +
    RESTORES_TO_WIDTH +
    ARCHIVED_AT_WIDTH +
    TABLE_LAYOUT.trailingWidth;

  return (
    <div className="scrollbar-thin ml-6 min-h-0 flex-1 overflow-auto" data-testid="archive-table">
      <div style={{ minWidth: width }} className={cn("pb-10 transition-opacity", busy && "opacity-60")}>
        <div role="row" className="sticky top-0 z-[6] flex h-9 border-b border-border/70 bg-surface/95 backdrop-blur">
          <div className="sticky left-0 z-[7] flex h-full items-center border-r border-border/60 bg-surface/95" style={leadingCellStyle(showReference)}>
            <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.selectWidth }}>
              <Checkbox
                aria-label={allSelected ? "Clear selection" : "Select every item on this page"}
                checked={allSelected}
                onCheckedChange={(next) => onSelectedChange(next === true ? items.map((i) => i.id) : [])}
                disabled={items.length === 0 || !canManage}
              />
            </div>
            <ReferenceHeaderCell />
            <span className="px-2 text-xs font-medium text-muted-foreground">Item</span>
          </div>
          {model.visibleColumns.map((column) => (
            <div key={column.id} style={columnCellStyle(column.width)} className="flex h-full items-center justify-center border-r border-border/40 px-2 text-xs font-medium text-muted-foreground">
              <span className="truncate">{column.name}</span>
            </div>
          ))}
          <HeaderCell width={RESTORES_TO_WIDTH} label="Restores to" />
          <HeaderCell width={ARCHIVED_AT_WIDTH} label="Archived" />
          <div style={{ width: TABLE_LAYOUT.trailingWidth }} />
        </div>

        {items.map((item) => (
          <ArchiveRow
            key={item.id}
            item={item}
            group={groupsById.get(item.groupId) ?? null}
            selected={selected.has(item.id)}
            onToggle={(next) => toggle(item.id, next)}
            onRestore={() => onRestore([item.id])}
            onDelete={() => onDelete([item.id])}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  );
}

function HeaderCell({ width, label }: { width: number; label: string }) {
  return (
    <div style={{ width, minWidth: width }} className="flex h-full items-center justify-center border-r border-border/40 px-2 text-xs font-medium text-muted-foreground">
      {label}
    </div>
  );
}

function ArchiveRow({
  item,
  group,
  selected,
  onToggle,
  onRestore,
  onDelete,
  canManage,
}: {
  item: Item;
  group: BoardGroup | null;
  selected: boolean;
  onToggle: (next: boolean) => void;
  onRestore: () => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const { model, openItem, showReference } = useBoardContext();
  const viewing = model.itemById.has(item.id);
  const menuFocus = useMenuFocusGuard();
  const linkCount = model.linksByItem.get(item.id)?.length ?? 0;
  const subitems = model.subitemsByParent.get(item.id) ?? [];

  const actions: MenuAction[] = [
    { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
    ...(canManage
      ? ([
          { type: "separator" },
          { type: "item", label: "Restore to board", icon: <ArchiveRestore />, onSelect: onRestore },
          { type: "item", label: "Delete permanently", icon: <Trash2 />, destructive: true, onSelect: onDelete },
        ] as MenuAction[])
      : []),
  ];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="row"
          aria-selected={selected}
          data-testid="archive-row"
          data-item-name={item.name}
          style={{ height: TABLE_LAYOUT.rowHeight }}
          className={cn("group/row flex border-b border-border/60 bg-background transition-colors hover:bg-accent/45", selected && "bg-accent-soft/60 hover:bg-accent-soft/80")}
        >
          <div
            className={cn(
              "sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-background transition-colors group-hover/row:bg-accent/45",
              selected && "bg-accent-soft/60 group-hover/row:bg-accent-soft/80",
            )}
            style={leadingCellStyle(showReference)}
          >
            <span aria-hidden className={cn("my-1 h-[calc(100%-8px)] w-1 rounded-full", group ? colorClasses(group.color).dot : "bg-muted")} />
            <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.selectWidth - 6 }}>
              <Checkbox aria-label={`Select ${item.name}`} checked={selected} onCheckedChange={(next) => onToggle(next === true)} disabled={!canManage} />
            </div>
            <ReferenceCell code={item.reference} />
            <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-1">
              <button
                type="button"
                onClick={() => openItem(item.id)}
                title={item.name}
                data-testid="archive-item-name"
                className="min-w-0 truncate rounded px-1 text-left text-[13px] hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {item.name}
              </button>
              {subitems.length > 0 && (
                <SimpleTooltip label={`${subitems.length} subitems come back with it`}>
                  <span className="flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground">
                    <CornerDownRight className="size-3" />
                    {subitems.length}
                  </span>
                </SimpleTooltip>
              )}
              {linkCount > 0 && (
                <SimpleTooltip label={linkCount === 1 ? "Still linked to an item on another board" : `Still linked to ${linkCount} items on other boards`}>
                  <span className="flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground" data-testid="archive-link-indicator">
                    <RefreshCw className="size-3" />
                    {linkCount > 1 && linkCount}
                  </span>
                </SimpleTooltip>
              )}
              <div className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
                {canManage && (
                  <SimpleTooltip label="Restore to board">
                    <button
                      type="button"
                      aria-label={`Restore ${item.name}`}
                      onClick={onRestore}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    >
                      <ArchiveRestore className="size-3.5" />
                    </button>
                  </SimpleTooltip>
                )}
                <SimpleTooltip label="Open">
                  <button
                    type="button"
                    aria-label={`Open ${item.name}`}
                    onClick={() => openItem(item.id)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                  >
                    <Maximize2 className="size-3.5" />
                  </button>
                </SimpleTooltip>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`More actions for ${item.name}`}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
                    {renderDropdown(actions)}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Read-only: an archived task is a record of what it was, and editing
              one would be editing something nobody can see on the board. */}
          {model.visibleColumns.map((column) => (
            <CellRenderer
              key={column.id}
              item={item}
              column={column}
              width={column.width}
              value={model.getValue(item.id, column.id)}
              onChange={() => undefined}
              readOnly
              isDone={model.isDone(item.id)}
            />
          ))}

          <div style={{ width: RESTORES_TO_WIDTH, minWidth: RESTORES_TO_WIDTH }} className="flex h-full items-center justify-center gap-1.5 border-r border-border/40 px-2 text-[13px]">
            {group ? (
              <>
                <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colorClasses(group.color).dot)} />
                <span className="truncate text-muted-foreground">{group.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </div>
          <div style={{ width: ARCHIVED_AT_WIDTH, minWidth: ARCHIVED_AT_WIDTH }} className="flex h-full items-center justify-center border-r border-border/40 px-2 text-[13px] text-muted-foreground">
            {item.archivedAt ? <span title={formatDateTime(item.archivedAt)}>{formatRelative(item.archivedAt)}</span> : "—"}
          </div>
          <div style={{ width: TABLE_LAYOUT.trailingWidth }} aria-hidden={viewing ? undefined : true} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
        {renderContext(actions)}
      </ContextMenuContent>
    </ContextMenu>
  );
}

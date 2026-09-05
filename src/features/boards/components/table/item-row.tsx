"use client";

import { useSortable } from "@dnd-kit/sortable";
import { Archive, ChevronDown, ChevronRight, Copy, CornerDownRight, GripVertical, Link2, Maximize2, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";
import { type MenuAction, renderContext, renderDropdown } from "@/components/layout/row-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { InlineEdit } from "@/components/shared/inline-edit";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { BoardGroup, Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TABLE_LAYOUT, columnCellStyle, leadingCellStyle } from "@/features/boards/board-model";
import { CellRenderer } from "@/features/boards/components/cells/cell-renderer";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { EMPTY_BOARD_UI, useBoardUiStore } from "@/stores/board-ui-store";

export interface ItemRowProps {
  item: Item;
  group: BoardGroup;
  dndEnabled: boolean;
  widthOverrides: Record<string, number>;
}

export const ItemRow = React.memo(function ItemRow({ item, group, dndEnabled, widthOverrides }: ItemRowProps) {
  const { board, model, mutations, canEdit, openItem } = useBoardContext();
  // Boolean selectors, not the whole UI slice: on a board of a few hundred rows
  // subscribing to the slice re-rendered every row whenever anything was
  // selected, expanded or opened.
  const selected = useBoardUiStore((s) => (s.boards[board.id]?.selectedItemIds ?? EMPTY_BOARD_UI.selectedItemIds).includes(item.id));
  const expanded = useBoardUiStore((s) => (s.boards[board.id]?.expandedItemIds ?? EMPTY_BOARD_UI.expandedItemIds).includes(item.id));
  const viewing = useBoardUiStore((s) => s.openItemId === item.id);
  const toggleSelected = useBoardUiStore((s) => s.toggleSelected);
  const toggleExpanded = useBoardUiStore((s) => s.toggleExpanded);
  const setLinkDialogItem = useBoardUiStore((s) => s.setLinkDialogItem);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [addingSubitem, setAddingSubitem] = React.useState(false);

  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const done = model.isDone(item.id);
  const blocked = model.isBlocked(item.id);
  const linkCount = model.linksByItem.get(item.id)?.length ?? 0;
  const colors = colorClasses(group.color);

  // `transform`/`transition` are deliberately unused: a drop line marks the
  // landing position instead of shifting every row (see GroupSection).
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", itemId: item.id, groupId: group.id },
    disabled: !dndEnabled,
  });

  // Shared by the hover "…" button and the right-click menu on the row.
  const actions: MenuAction[] = canEdit
    ? [
        { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
        { type: "item", label: "Rename", icon: <Pencil />, onSelect: () => setRenaming(true) },
        {
          type: "item",
          label: "Add subitem",
          icon: <Plus />,
          onSelect: () => {
            setAddingSubitem(true);
            if (!expanded) toggleExpanded(board.id, item.id);
          },
        },
        { type: "item", label: "Duplicate", icon: <Copy />, onSelect: () => void mutations.duplicateItem(item.id) },
        {
          type: "item",
          label: "Link to another item…",
          icon: <Link2 />,
          onSelect: () => {
            setLinkDialogItem(item.id);
            openItem(item.id);
          },
        },
        {
          type: "sub",
          label: "Move to group",
          icon: <CornerDownRight />,
          items: model.groups
            .filter((g) => g.id !== group.id)
            .map((g) => ({
              type: "item" as const,
              label: g.name,
              icon: <span className={cn("size-2.5 rounded-full", colorClasses(g.color).dot)} />,
              onSelect: () => void mutations.moveItemsToGroup([item.id], g.id),
            })),
        },
        { type: "separator" },
        { type: "item", label: "Archive", icon: <Archive />, onSelect: () => void mutations.archiveItems([item.id]) },
        { type: "item", label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => setConfirmDelete(true) },
      ]
    : [{ type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) }];

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={{ height: TABLE_LAYOUT.rowHeight }}
            role="row"
            aria-selected={selected}
            aria-current={viewing ? "true" : undefined}
            data-testid="item-row"
            data-item-name={item.name}
            className={cn(
              "group/row flex border-b border-border/60 bg-background transition-colors hover:bg-accent/45",
              selected && "bg-accent-soft/60 hover:bg-accent-soft/80",
              viewing && "bg-accent/80 ring-1 ring-inset ring-ring/35 hover:bg-accent/80",
              isDragging && "opacity-40",
              done && "text-muted-foreground",
            )}
          >
            <div
              role="gridcell"
              className={cn(
                "sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-background transition-colors group-hover/row:bg-accent/45",
                selected && "bg-accent-soft/60 group-hover/row:bg-accent-soft/80",
                viewing && "bg-accent/80 group-hover/row:bg-accent/80",
              )}
              style={leadingCellStyle()}
            >
              <span aria-hidden className={cn("my-1 h-[calc(100%-8px)] w-1 rounded-full", colors.dot)} />
              <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.selectWidth - 6 }}>
                <Checkbox aria-label={`Select ${item.name}`} checked={selected} onCheckedChange={(next) => toggleSelected(board.id, item.id, next === true)} disabled={!canEdit} />
              </div>
              <div className="flex items-center justify-center" style={{ width: TABLE_LAYOUT.handleWidth }}>
                {dndEnabled && (
                  <button
                    ref={setActivatorNodeRef}
                    type="button"
                    aria-label={`Drag ${item.name}`}
                    className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground/0 group-hover/row:text-muted-foreground/70 hover:!text-foreground focus-visible:text-muted-foreground active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-1">
                <button
                  type="button"
                  aria-label={expanded ? "Hide subitems" : subitems.length ? `Show ${subitems.length} subitems` : "Add subitem"}
                  onClick={() => {
                    if (subitems.length === 0) {
                      if (!canEdit) return;
                      setAddingSubitem(true);
                      if (!expanded) toggleExpanded(board.id, item.id);
                    } else toggleExpanded(board.id, item.id);
                  }}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
                    subitems.length === 0 && "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  {expanded ? <ChevronDown className="size-3.5" /> : subitems.length ? <ChevronRight className="size-3.5" /> : <CornerDownRight className="size-3.5" />}
                </button>
                <div className="flex h-full min-w-0 items-center">
                  {renaming ? (
                    <InlineEdit
                      value={item.name}
                      editing
                      onEditingChange={setRenaming}
                      onSubmit={(name) => void mutations.renameItem(item.id, name)}
                      ariaLabel="Item name"
                      inputClassName="h-7 text-[13px]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => openItem(item.id)}
                      onDoubleClick={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        setRenaming(true);
                      }}
                      title={item.name}
                      data-testid="item-name"
                      className={cn(
                        "min-w-0 truncate rounded px-1 text-left text-[13px] hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                        done && "line-through decoration-muted-foreground/40",
                      )}
                    >
                      {item.name}
                    </button>
                  )}
                </div>
                {linkCount > 0 && <LinkIndicator count={linkCount} onClick={() => openItem(item.id)} />}
                {blocked && (
                  <SimpleTooltip label="Blocked: depends on items that are not done">
                    <span className="shrink-0 text-amber-600 dark:text-amber-400" aria-label="Blocked">
                      <TriangleAlert className="size-3.5" />
                    </span>
                  </SimpleTooltip>
                )}
                {subitems.length > 0 && <span className="shrink-0 rounded-full bg-surface-strong/80 px-1.5 text-2xs text-muted-foreground tabular">{subitems.length}</span>}
                <div className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
                  {canEdit && (
                    <SimpleTooltip label="Rename">
                      <button
                        type="button"
                        aria-label={`Rename ${item.name}`}
                        onClick={() => setRenaming(true)}
                        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </SimpleTooltip>
                  )}
                  <SimpleTooltip label="Open">
                    <button
                      type="button"
                      aria-label={`Open ${item.name}`}
                      onClick={() => openItem(item.id)}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
                    >
                      <Maximize2 className="size-3.5" />
                    </button>
                  </SimpleTooltip>
                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`More actions for ${item.name}`}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        {renderDropdown(actions)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </div>

            {model.visibleColumns.map((column) => (
              <CellRenderer
                key={column.id}
                item={item}
                column={column}
                width={widthOverrides[column.id] ?? column.width}
                value={model.getValue(item.id, column.id)}
                onChange={(value) => void mutations.setValue(item, column, value)}
                readOnly={!canEdit}
                isDone={done}
              />
            ))}
            <div style={{ width: TABLE_LAYOUT.trailingWidth }} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">{renderContext(actions)}</ContextMenuContent>
      </ContextMenu>

      {expanded && <SubitemRows parent={item} group={group} subitems={subitems} widthOverrides={widthOverrides} adding={addingSubitem} onAddingChange={setAddingSubitem} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${item.name}”?`}
        description={subitems.length ? `This also deletes its ${subitems.length} subitems and all updates.` : "This permanently deletes the item and its updates."}
        confirmLabel="Delete item"
        destructive
        onConfirm={() => mutations.deleteItems([item.id]).then(() => undefined)}
      />
    </>
  );
});

/** Small chain icon on rows that are kept in sync with items on other boards. */
function LinkIndicator({ count, onClick }: { count: number; onClick: () => void }) {
  const label = count === 1 ? "Linked to an item on another board" : `Linked to ${count} items on other boards`;
  return (
    <SimpleTooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        data-testid="link-indicator"
        className="flex h-5 shrink-0 items-center gap-0.5 rounded-md px-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
      >
        <RefreshCw className="size-3.5" />
        {count > 1 && <span className="text-2xs tabular">{count}</span>}
      </button>
    </SimpleTooltip>
  );
}

function SubitemRows({
  parent,
  group,
  subitems,
  widthOverrides,
  adding,
  onAddingChange,
}: {
  parent: Item;
  group: BoardGroup;
  subitems: Item[];
  widthOverrides: Record<string, number>;
  adding: boolean;
  onAddingChange: (adding: boolean) => void;
}) {
  const { model, mutations, canEdit } = useBoardContext();
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (adding) requestAnimationFrame(() => inputRef.current?.focus());
  }, [adding]);

  const submit = () => {
    const name = draft.trim();
    if (!name) return;
    void mutations.createItem({ groupId: group.id, parentItemId: parent.id, name });
    setDraft("");
  };

  return (
    <div className="bg-surface/60" data-testid="subitems">
      {subitems.map((sub) => (
        <SubitemRow key={sub.id} item={sub} widthOverrides={widthOverrides} />
      ))}
      {canEdit && (adding || subitems.length > 0) && (
        <div role="row" className="flex border-b" style={{ height: 32 }}>
          <div className="sticky left-0 z-[4] flex h-full items-center border-r bg-surface/60 pl-16" style={leadingCellStyle()}>
            <CornerDownRight className="mr-1.5 size-3 text-muted-foreground/60" />
            <input
              ref={inputRef}
              aria-label={`Add subitem to ${parent.name}`}
              placeholder="+ Add subitem"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => onAddingChange(true)}
              onBlur={() => {
                if (!draft.trim()) onAddingChange(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setDraft("");
                  onAddingChange(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="h-7 w-full bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground/70 focus:rounded-sm focus:bg-background focus:ring-1 focus:ring-ring"
            />
          </div>
          {model.visibleColumns.map((column) => (
            <div key={column.id} style={columnCellStyle(widthOverrides[column.id] ?? column.width)} />
          ))}
          <div style={{ width: TABLE_LAYOUT.trailingWidth }} />
        </div>
      )}
    </div>
  );
}

function SubitemRow({ item, widthOverrides }: { item: Item; widthOverrides: Record<string, number> }) {
  const { model, mutations, canEdit, openItem } = useBoardContext();
  const viewing = useBoardUiStore((s) => s.openItemId === item.id);
  const [renaming, setRenaming] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const done = model.isDone(item.id);
  const linkCount = model.linksByItem.get(item.id)?.length ?? 0;
  const actions: MenuAction[] = [
    { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
    ...(canEdit
      ? ([
          { type: "item", label: "Rename", icon: <Pencil />, onSelect: () => setRenaming(true) },
          { type: "separator" },
          { type: "item", label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => setConfirmDelete(true) },
        ] as MenuAction[])
      : []),
  ];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="row"
          aria-current={viewing ? "true" : undefined}
          data-testid="subitem-row"
          className={cn("group/row flex border-b border-border/60 transition-colors hover:bg-accent/40", viewing && "bg-accent/80 ring-1 ring-inset ring-ring/35 hover:bg-accent/80", done && "text-muted-foreground")}
          style={{ height: 32 }}
        >
          <div
            className={cn("sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-surface/50 pl-16 transition-colors group-hover/row:bg-accent/40", viewing && "bg-accent/80 group-hover/row:bg-accent/80")}
            style={leadingCellStyle()}
          >
            <CornerDownRight className="mr-1.5 size-3 shrink-0 text-muted-foreground/60" />
            <div className="flex h-full min-w-0 flex-1 items-center gap-1 pr-1">
              {renaming ? (
                <InlineEdit
                  value={item.name}
                  editing
                  onEditingChange={setRenaming}
                  onSubmit={(name) => void mutations.renameItem(item.id, name)}
                  ariaLabel="Subitem name"
                  inputClassName="h-6 text-xs"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => openItem(item.id)}
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    setRenaming(true);
                  }}
                  className={cn("min-w-0 truncate rounded px-1 text-left text-xs hover:underline", done && "line-through decoration-muted-foreground/40")}
                >
                  {item.name}
                </button>
              )}
              {linkCount > 0 && <LinkIndicator count={linkCount} onClick={() => openItem(item.id)} />}
              {canEdit && (
                <div className="ml-auto flex shrink-0 items-center opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${item.name}`}
                    onClick={() => setRenaming(true)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => setConfirmDelete(true)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          {model.visibleColumns.map((column) => (
            <CellRenderer
              key={column.id}
              item={item}
              column={column}
              width={widthOverrides[column.id] ?? column.width}
              value={model.getValue(item.id, column.id)}
              onChange={(value) => void mutations.setValue(item, column, value)}
              readOnly={!canEdit}
              isDone={done}
            />
          ))}
          <div style={{ width: TABLE_LAYOUT.trailingWidth }} />
          <ConfirmDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title={`Delete “${item.name}”?`}
            confirmLabel="Delete subitem"
            destructive
            onConfirm={() => mutations.deleteItems([item.id]).then(() => undefined)}
          />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">{renderContext(actions)}</ContextMenuContent>
    </ContextMenu>
  );
}

"use client";

import { useSortable } from "@dnd-kit/sortable";
import { Archive, ArrowRightLeft, ChevronDown, ChevronRight, Copy, CornerDownRight, GripVertical, Link2, LoaderCircle, Maximize2, MoreHorizontal, Pencil, PictureInPicture2, Plus, RefreshCw, Share2, Trash2 } from "lucide-react";
import * as React from "react";
import { useMenuFocusGuard, type MenuAction, renderContext, renderDropdown } from "@/components/layout/row-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ShareItemDialog } from "@/features/items/share-item-dialog";
import { InlineEdit } from "@/components/shared/inline-edit";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { useAllocation, useMovingItems } from "@/features/booking/use-allocation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { BoardGroup, Item } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { TicketCell, TicketSpacer } from "@/features/boards/components/table/ticket-cell";
import { BlockedDot } from "@/features/boards/components/blocked-dot";
import { UpdatesBadge } from "@/features/items/updates-badge";
import { columnCellStyle, leadingCellStyle } from "@/features/boards/board-model";
import { useShowTicket, useTableLayout } from "@/features/boards/components/table/table-layout";
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
  const { board, model, mutations, canEdit, canManage, openItem, openItemUpdates, updates } = useBoardContext();
  const layout = useTableLayout();
  const showTicket = useShowTicket();
  // Boolean selectors, not the whole UI slice: on a board of a few hundred rows
  // subscribing to the slice re-rendered every row whenever anything was
  // selected, expanded or opened.
  const selected = useBoardUiStore((s) => (s.boards[board.id]?.selectedItemIds ?? EMPTY_BOARD_UI.selectedItemIds).includes(item.id));
  const selectedIds = useBoardUiStore((s) => s.boards[board.id]?.selectedItemIds ?? EMPTY_BOARD_UI.selectedItemIds);
  const expanded = useBoardUiStore((s) => (s.boards[board.id]?.expandedItemIds ?? EMPTY_BOARD_UI.expandedItemIds).includes(item.id));
  const viewing = useBoardUiStore((s) => s.openItemId === item.id);
  const toggleSelected = useBoardUiStore((s) => s.toggleSelected);
  const selectRange = useBoardUiStore((s) => s.selectRange);
  const toggleExpanded = useBoardUiStore((s) => s.toggleExpanded);
  const setLinkDialogItem = useBoardUiStore((s) => s.setLinkDialogItem);
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const [renaming, setRenaming] = React.useState(false);
  const [nameRef, nameClipped] = useClipped<HTMLButtonElement>(item.name, renaming);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [addingSubitem, setAddingSubitem] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);

  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const done = model.isDone(item.id);
  const blocked = model.isBlocked(item.id);
  const linkCount = model.linksByItem.get(item.id)?.length ?? 0;
  const colors = colorClasses(group.color);

  // `transform`/`transition` are deliberately unused: a drop line marks the
  // landing position instead of shifting every row (see GroupSection).
  // The whole name cell is the drag handle (like column headers): pointer down
  // and move drags, a plain click still opens or selects. `dragged` tells the
  // empty-area click apart from the end of a drag.
  const dragged = React.useRef(false);
  const { listeners, setNodeRef, setActivatorNodeRef, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", itemId: item.id, groupId: group.id },
    disabled: !dndEnabled,
  });

  // Rename and Add subitem open a field: they wait for the menu to finish
  // closing so the field is not mounted inside a focus trap on its way out.
  const menuFocus = useMenuFocusGuard();

  // On the Task Allocation board: send this request — or the whole selection
  // it belongs to — straight to a team's board. The same move the detail
  // panel offers, on the row, because a morning's queue is twenty one-word
  // decisions and twenty panels is nineteen too many.
  const allocation = useAllocation();
  const movingTo = useMovingItems().get(item.id);
  const movingBoard = movingTo ? allocation.targets.flatMap((t) => t.boards).find((b) => b.id === movingTo) : undefined;
  const allocating = selected ? selectedIds : [item.id];
  const allocateAction: MenuAction | null =
    allocation.available && item.parentItemId === null
      ? {
          type: "sub",
          label: selected && selectedIds.length > 1 ? `Allocate ${selectedIds.length} requests to` : "Allocate to",
          icon: <ArrowRightLeft />,
          accent: true,
          // Team, then board: one name per line, and no entry long enough to
          // wrap. A team with a single board still opens to it, so the board
          // a request lands on is always named before it is sent there.
          items: allocation.loading
            ? // The menu opens now and fills in when the workspace answers.
              [{ type: "item" as const, label: "Finding the team boards…", icon: <LoaderCircle className="animate-spin" />, disabled: true, onSelect: () => {} }]
            : allocation.targets.map(({ team, boards }) => {
                const icon = team ? <DynamicIcon name={team.icon} className={cn("size-3.5", colorClasses(team.color).text)} /> : <CornerDownRight />;
                const send = (boardId: string) => allocation.allocate.mutate({ itemIds: allocating, boardId });
                return {
                  type: "sub" as const,
                  label: team ? team.name : "No team",
                  icon,
                  items: boards.map((target) => ({ type: "item" as const, label: target.name, onSelect: () => send(target.id) })),
                };
              }),
        }
      : null;

  // Shared by the hover "…" button and the right-click menu on the row.
  const actions: MenuAction[] = canEdit
    ? [
        ...(allocateAction ? [allocateAction, { type: "separator" } satisfies MenuAction] : []),
        { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
        { type: "item", label: "Open in pop-up", icon: <PictureInPicture2 />, onSelect: () => openItem(item.id, "popup") },
        { type: "item", label: "Rename", icon: <Pencil />, onSelect: () => menuFocus.run(() => setRenaming(true)) },
        {
          type: "item",
          label: "Add subitem",
          icon: <Plus />,
          onSelect: () =>
            menuFocus.run(() => {
              setAddingSubitem(true);
              if (!expanded) toggleExpanded(board.id, item.id);
            }),
        },
        { type: "item", label: "Duplicate", icon: <Copy />, onSelect: () => void mutations.duplicateItem(item.id) },
        ...(canManage ? [{ type: "item", label: "Share by link…", icon: <Share2 />, onSelect: () => setSharing(true) } satisfies MenuAction] : []),
        // Nothing in the allocation queue is linkable: it is a request
        // waiting for a team, and a link would mirror it onto that team's
        // board while it still sat here. Allocating moves it; that is the
        // one way out of this board.
        ...(allocation.available
          ? []
          : [
              {
                type: "item",
                label: "Link to another item…",
                icon: <Link2 />,
                onSelect: () => {
                  setLinkDialogItem(item.id);
                  openItem(item.id);
                },
              } satisfies MenuAction,
            ]),
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
        { type: "item", label: "Archive", icon: <Archive />, onSelect: () => setArchiveRequest([item.id]) },
        { type: "item", label: "Delete", icon: <Trash2 />, destructive: true, onSelect: () => setConfirmDelete(true) },
      ]
    : [
        { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
        { type: "item", label: "Open in pop-up", icon: <PictureInPicture2 />, onSelect: () => openItem(item.id, "popup") },
      ];

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={setNodeRef}
            style={{ height: layout.rowHeight }}
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
              // On its way to a team's board: a light sweep until it has gone.
              movingTo && "row-moving pointer-events-none",
            )}
            data-moving={movingTo ? "true" : undefined}
            aria-busy={movingTo ? true : undefined}
          >
            <div
              ref={setActivatorNodeRef}
              role="gridcell"
              // Pinned, so the rest of the row scrolls underneath it: every
              // colour here is opaque. The tints are written as the mix they
              // used to composite to over the page, because a translucent one
              // replaces the base rather than sitting on it, and the row shows
              // straight through.
              className={cn(
                "sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-background transition-colors group-hover/row:bg-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-background))]",
                dndEnabled && "active:cursor-grabbing",
                selected && "bg-[color-mix(in_srgb,var(--color-accent-soft)_60%,var(--color-background))] group-hover/row:bg-[color-mix(in_srgb,var(--color-accent-soft)_80%,var(--color-background))]",
                viewing && "bg-[color-mix(in_srgb,var(--color-accent)_80%,var(--color-background))] group-hover/row:bg-[color-mix(in_srgb,var(--color-accent)_80%,var(--color-background))]",
              )}
              style={leadingCellStyle(showTicket, layout)}
              data-testid="item-drag-area"
              {...(dndEnabled ? listeners : {})}
              onPointerDownCapture={() => {
                dragged.current = false;
              }}
              onPointerMoveCapture={(e) => {
                if (e.buttons === 1) dragged.current = true;
              }}
            >
              <span aria-hidden className={cn("my-1 h-[calc(100%-8px)] w-1 rounded-full", colors.dot)} />
              <div className="flex items-center justify-center" style={{ width: layout.selectWidth - 6 }}>
                <Checkbox
                  aria-label={`Select ${item.name}`}
                  checked={selected}
                  // Shift ticks everything between the last row ticked by hand
                  // and this one. The rows are read off the model at the moment
                  // of the click — in the order they are on screen — and
                  // preventing the default is what stops the plain tick from
                  // also running.
                  onClick={(event) => {
                    if (!event.shiftKey) return;
                    event.preventDefault();
                    selectRange(board.id, model.visibleGroups.flatMap((g) => (model.itemsByGroup.get(g.id) ?? []).map((i) => i.id)), item.id);
                  }}
                  onCheckedChange={(next) => toggleSelected(board.id, item.id, next === true)}
                  disabled={!canEdit}
                />
              </div>
              {!showTicket && dndEnabled && (
                <div
                  className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground active:cursor-grabbing group-hover/row:opacity-100"
                  aria-hidden="true"
                  data-testid="item-drag-handle"
                >
                  <GripVertical className="size-3.5" />
                </div>
              )}
              <TicketCell
                code={item.ticket}
                dragHandle={
                  dndEnabled ? (
                    <div
                      className="absolute -left-0.5 flex h-6 w-4 cursor-grab items-center justify-center text-muted-foreground/40 opacity-0 transition-opacity hover:text-muted-foreground active:cursor-grabbing group-hover/row:opacity-100"
                      aria-hidden="true"
                      data-testid="item-drag-handle"
                    >
                      <GripVertical className="size-3.5" />
                    </div>
                  ) : undefined
                }
              />
              {/* The empty run of the name cell opens the item too, like the name itself. */}
              <div
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 pr-1"
                onClick={(e) => {
                  if (e.target === e.currentTarget && !dragged.current) openItem(item.id);
                }}
                data-testid="item-name-cell"
              >
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
                {/* Renaming, the field spans the whole cell and the badges and buttons step aside for it. */}
                <div className={cn("flex h-full min-w-0 items-center", renaming && "flex-1 pr-1")}>
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
                      ref={nameRef}
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
                        "min-w-0 overflow-hidden rounded px-1 text-left text-[13px] whitespace-nowrap hover:underline focus-visible:outline-2 focus-visible:outline-ring",
                        nameClipped > 0 && FADE_END,
                      )}
                    >
                      <ScrollingName name={item.name} overflow={nameClipped} />
                    </button>
                  )}
                </div>
                {!renaming && linkCount > 0 && <LinkIndicator count={linkCount} onClick={() => openItem(item.id)} />}
                {!renaming && <UpdatesBadge summary={updates.get(item.id)} onClick={() => openItemUpdates(item.id)} />}
                {!renaming && blocked && <BlockedDot />}
                {movingTo && (
                  <span
                    className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary"
                    title={`Moving to ${movingBoard?.name ?? "the team's board"}`}
                    data-testid="item-moving"
                  >
                    <LoaderCircle className="size-3 animate-spin" /> Moving…
                  </span>
                )}
                <div className={cn(HOVER_ACTIONS, renaming && "hidden")}>
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
                      <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
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
            <div style={{ width: layout.trailingWidth }} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
          {renderContext(actions)}
        </ContextMenuContent>
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
      {canManage && <ShareItemDialog item={item} open={sharing} onOpenChange={setSharing} />}
    </>
  );
});

/** Small chain icon on rows that are kept in sync with items on other boards. */
/**
 * A name that does not fit fades out at its end rather than stopping at "…":
 * the last few letters before the edge are still there to read.
 */
const FADE_END = "[mask-image:linear-gradient(to_right,#000_calc(100%-1.75rem),transparent)]";

/**
 * The row's own buttons (rename, open, more) take no room until the row is
 * hovered or one of them has focus, so a name uses the whole cell at rest and
 * only gives way to them when they are wanted.
 */
const HOVER_ACTIONS =
  "ml-auto flex max-w-0 shrink-0 items-center overflow-hidden opacity-0 transition-opacity group-hover/row:max-w-24 group-hover/row:opacity-100 focus-within:max-w-24 focus-within:opacity-100 has-[[data-state=open]]:max-w-24 has-[[data-state=open]]:opacity-100";

/** How far the element's text runs past its edge, in pixels (0 when it fits), kept current as the row resizes. */
function useClipped<T extends HTMLElement>(text: string, editing: boolean): [React.RefObject<T | null>, number] {
  const ref = React.useRef<T>(null);
  const [clipped, setClipped] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const over = el.scrollWidth - el.clientWidth;
      setClipped(over > 1 ? over : 0);
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, editing]);
  return [ref, clipped];
}

/** The fade at the end of a clipped name is this wide; a scroll goes this much further so the last letter clears it. */
const FADE_WIDTH = 28;
/** How fast a name scrolls, in pixels a second. */
const SCROLL_SPEED = 40;

/**
 * An item's name. One too long for its cell scrolls to its end and back while
 * the row is hovered, after half a second, and keeps doing so until the
 * pointer leaves (the name-marquee keyframes in globals.css). At rest, and for
 * anyone who asks for less motion, it sits still with its end faded.
 */
function ScrollingName({ name, overflow }: { name: string; overflow: number }) {
  if (overflow <= 0) return <>{name}</>;
  const distance = overflow + FADE_WIDTH;
  // The keyframes spend 60% of each loop moving, out and back; the rest is the pause at either end.
  const seconds = Math.max(4, (2 * distance) / SCROLL_SPEED / 0.6);
  return (
    <span className="name-marquee inline-block" style={{ "--marquee-distance": `-${distance}px`, "--marquee-duration": `${seconds.toFixed(1)}s` } as React.CSSProperties}>
      {name}
    </span>
  );
}

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
  const layout = useTableLayout();
  const showTicket = useShowTicket();
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
          <div className="sticky left-0 z-[4] flex h-full items-center border-r bg-[color-mix(in_srgb,var(--color-surface)_60%,var(--color-background))]" style={leadingCellStyle(showTicket, layout)}>
            <span aria-hidden className="h-full shrink-0" style={{ width: layout.selectWidth }} />
            <TicketSpacer />
            <CornerDownRight className="mr-1.5 ml-3 size-3 shrink-0 text-muted-foreground/60" />
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
          <div style={{ width: layout.trailingWidth }} />
        </div>
      )}
    </div>
  );
}

function SubitemRow({ item, widthOverrides }: { item: Item; widthOverrides: Record<string, number> }) {
  const { model, mutations, canEdit, openItem, openItemUpdates, updates } = useBoardContext();
  const layout = useTableLayout();
  const showTicket = useShowTicket();
  const viewing = useBoardUiStore((s) => s.openItemId === item.id);
  const [renaming, setRenaming] = React.useState(false);
  const [nameRef, nameClipped] = useClipped<HTMLButtonElement>(item.name, renaming);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const done = model.isDone(item.id);
  const linkCount = model.linksByItem.get(item.id)?.length ?? 0;
  // Renaming waits for the menu to close, as on a top-level row.
  const menuFocus = useMenuFocusGuard();
  const actions: MenuAction[] = [
    { type: "item", label: "Open", icon: <Maximize2 />, onSelect: () => openItem(item.id) },
    { type: "item", label: "Open in pop-up", icon: <PictureInPicture2 />, onSelect: () => openItem(item.id, "popup") },
    ...(canEdit
      ? ([
          { type: "item", label: "Rename", icon: <Pencil />, onSelect: () => menuFocus.run(() => setRenaming(true)) },
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
            className={cn("sticky left-0 z-[4] flex h-full items-center border-r border-border/60 bg-[color-mix(in_srgb,var(--color-surface)_50%,var(--color-background))] transition-colors group-hover/row:bg-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-background))]", viewing && "bg-[color-mix(in_srgb,var(--color-accent)_80%,var(--color-background))] group-hover/row:bg-[color-mix(in_srgb,var(--color-accent)_80%,var(--color-background))]")}
            style={leadingCellStyle(showTicket, layout)}
          >
            <span aria-hidden className="h-full shrink-0" style={{ width: layout.selectWidth }} />
            <TicketCell code={item.ticket} />
            <CornerDownRight className="mr-1.5 ml-3 size-3 shrink-0 text-muted-foreground/60" />
            <div
              className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 pr-1"
              onClick={(e) => {
                if (e.target === e.currentTarget) openItem(item.id);
              }}
              data-testid="subitem-name-cell"
            >
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
                  ref={nameRef}
                  type="button"
                  onClick={() => openItem(item.id)}
                  onDoubleClick={(e) => {
                    if (!canEdit) return;
                    e.preventDefault();
                    setRenaming(true);
                  }}
                  title={item.name}
                  className={cn("min-w-0 overflow-hidden rounded px-1 text-left text-xs whitespace-nowrap hover:underline", nameClipped > 0 && FADE_END)}
                >
                  <ScrollingName name={item.name} overflow={nameClipped} />
                </button>
              )}
              {!renaming && linkCount > 0 && <LinkIndicator count={linkCount} onClick={() => openItem(item.id)} />}
              {!renaming && <UpdatesBadge summary={updates.get(item.id)} onClick={() => openItemUpdates(item.id)} />}
              {canEdit && !renaming && (
                <div className={HOVER_ACTIONS}>
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
          <div style={{ width: layout.trailingWidth }} />
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
      <ContextMenuContent className="w-48" onCloseAutoFocus={menuFocus.onCloseAutoFocus}>
        {renderContext(actions)}
      </ContextMenuContent>
    </ContextMenu>
  );
}

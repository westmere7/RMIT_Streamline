"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, CornerDownRight, Eye, EyeOff, Globe, GripVertical, History, MessageSquare, MoreVertical, Package, Plus, Share2, SquarePen, Trash2, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEdit } from "@/components/shared/inline-edit";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import type { BoardColumn, Item, ItemAsset } from "@/domain";
import { COLUMN_TYPE_LABELS, ITEM_REFERENCE_MAX, normaliseItemReference } from "@/domain";
import { copyToClipboard } from "@/features/members/hooks";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useItemActivity } from "@/features/activity/hooks";
import { useBoardContext } from "@/features/boards/board-context";
import { CellRenderer } from "@/features/boards/components/cells/cell-renderer";
import { CellStretchProvider } from "@/features/boards/components/cells/cell-shell";
import { COLUMN_TYPE_PICKER_WIDTH, ColumnTypePicker } from "@/features/boards/components/table/column-type-picker";
import { useComments } from "@/features/comments/hooks";
import { ItemUpdates } from "@/features/items/item-updates";
import { useItemAssets } from "@/features/items/asset-hooks";
import { AssetsRecapStrip } from "@/features/items/item-assets-recap";
import { ShareItemDialog, useItemShareStatus } from "@/features/items/share-item-dialog";
import { ItemAssetsTab } from "@/features/items/item-assets-tab";
import { useMarkItemSeen } from "@/features/comments/updates";
import { ItemCover } from "@/features/items/item-cover";
import { useBoardUiStore } from "@/stores/board-ui-store";
import { AllocationSection } from "@/features/booking/allocation-section";
import { LinkedItemsSection } from "@/features/items/linked-items-section";
import { BriefRowValue, RichTextDocument } from "@/features/items/rich-text-field";
import { Mention, useMentionLinks } from "@/features/workspace/mention-link";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const FIELD_WIDTH = 260;

/**
 * `shared` is the whole page rather than a panel beside a board (a task opened
 * from a link): it fills what holds it and there is nothing to close it back to.
 */
/**
 * The shape the panel takes, whether or not there is anything in it yet.
 *
 * Opening a link to a task on a board you are not on loads that whole board
 * first, and until it arrived the page showed a board skeleton and no panel —
 * so the one thing the reader clicked for was the one thing not on screen.
 * The frame is the same either way, so it can be put up immediately and
 * filled in when the board lands.
 */
function panelClasses(shared: boolean, narrow: boolean, overlay: boolean): string {
  return cn(
    // Reads as a card floating above the board: its own surface and elevation,
    // with the board beside it left untouched so items stay glanceable.
    "flex flex-col bg-surface",
    shared
      ? "min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 shadow-sm"
      : narrow
        ? "fixed inset-0 z-40"
        : overlay
          ? "absolute inset-y-2.5 right-2.5 z-30 w-[520px] overflow-hidden rounded-2xl border border-border/70 shadow-2xl animate-in slide-in-from-right-4 duration-150"
          : "m-2.5 w-[520px] shrink-0 overflow-hidden rounded-2xl border border-border/70 shadow-xl animate-in slide-in-from-right-4 duration-150",
  );
}

/**
 * The panel while the board behind it is still loading.
 *
 * Same frame, same place, a working close button and the shape of what is
 * coming. It goes up the moment a link is followed, so the wait happens
 * inside the thing that was asked for rather than in front of it.
 */
export function ItemPanelSkeleton({ onClose, overlay = false }: { onClose: () => void; overlay?: boolean }) {
  const narrow = useMediaQuery("(max-width: 1023px)");
  return (
    <aside role="dialog" aria-label="Opening task" aria-busy className={panelClasses(false, narrow, overlay)} data-testid="item-panel-skeleton">
      <div className="flex h-12 items-center justify-between gap-2 border-b px-3">
        <Skeleton className="h-4 w-40" />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
          <X />
        </Button>
      </div>
      <div className="space-y-4 p-4">
        <Skeleton className="h-7 w-3/4" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </aside>
  );
}

export function ItemDetailPanel({ itemId, onClose, overlay = false, shared = false }: { itemId: string; onClose: () => void; overlay?: boolean; shared?: boolean }) {
  const { model, canEdit } = useBoardContext();
  const item = model.itemById.get(itemId);
  const narrow = useMediaQuery("(max-width: 1023px)");
  const [localTab, setLocalTab] = React.useState("overview");
  const requestedTab = useBoardUiStore((s) => s.requestedItemTab);
  const setRequestedItemTab = useBoardUiStore((s) => s.setRequestedItemTab);
  // A request (from the updates badge, say) wins until the person picks a tab.
  const tab = requestedTab?.itemId === itemId ? requestedTab.tab : localTab;
  const setTab = (next: string) => {
    if (requestedTab) setRequestedItemTab(null);
    setLocalTab(next);
  };
  const comments = useComments(itemId);
  const assets = useItemAssets(itemId);
  // Looking at the Updates tab is catching up: record it, and again whenever
  // another update arrives while the tab stays open.
  const markSeen = useMarkItemSeen();
  const latestUpdate = comments.data?.[comments.data.length - 1]?.createdAt ?? null;
  React.useEffect(() => {
    if (tab !== "updates" || !comments.data) return;
    markSeen.mutate(itemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires on tab open and on each new update, not on the mutation object
  }, [tab, itemId, latestUpdate]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape inside a field (or the update composer, a contenteditable) belongs to that field.
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable);
      // An open picker, menu or dialog takes the Escape for itself; the panel closes on the next one.
      const inOverlay = !!document.querySelector("[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']:not([data-testid='item-panel']), [role='menu'][data-state='open']");
      if (e.key === "Escape" && !inField && !inOverlay) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-label={item ? item.name : "Item"}
      data-testid="item-panel"
      className={panelClasses(shared, narrow, overlay)}
    >
      {!item ? (
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center justify-end border-b px-3">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
              <X />
            </Button>
          </div>
          <EmptyState title="Item not found" description="It may have been deleted or archived." />
        </div>
      ) : (
        <>
          <PanelHeader item={item} onClose={onClose} canEdit={canEdit} assets={assets.data ?? []} hideClose={shared} shared={shared} />
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            <UnderlineTabsList className={cn("px-4", narrow && "scrollbar-none overflow-x-auto overscroll-x-contain")}>
              <UnderlineTabsTrigger value="overview">
                <SquarePen className="size-3.5" /> Overview
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="updates">
                <MessageSquare className="size-3.5" /> Updates
                {comments.data && comments.data.length > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{comments.data.length}</span>}
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="assets" data-testid="tab-assets">
                <Package className="size-3.5" /> Assets
                {assets.data && assets.data.length > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{assets.data.length}</span>}
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="activity">
                <History className="size-3.5" /> Activity
              </UnderlineTabsTrigger>
            </UnderlineTabsList>
            <TabsContent value="overview" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <Overview key={item.id} item={item} />
            </TabsContent>
            <TabsContent value="updates" className="min-h-0 flex-1">
              <ItemUpdates itemId={item.id} canComment={canEdit} />
            </TabsContent>
            <TabsContent value="assets" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              <ItemAssetsTab key={item.id} item={item} canEdit={canEdit} />
            </TabsContent>
            <TabsContent value="activity" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4">
              <ItemActivity itemId={item.id} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </aside>
  );
}

function PanelHeader({
  item,
  onClose,
  canEdit,
  assets,
  hideClose,
  shared,
}: {
  item: Item;
  onClose: () => void;
  canEdit: boolean;
  assets: readonly ItemAsset[];
  hideClose?: boolean;
  /** True on the page behind a link: there is nothing to share from inside a share. */
  shared?: boolean;
}) {
  const { model, mutations, openItem, board, canManage } = useBoardContext();
  const [sharing, setSharing] = React.useState(false);
  // Everyone on the board can see that the task is out on a link; only the
  // board's managers can change that.
  const share = useItemShareStatus(shared ? "" : item.id).data ?? null;
  const ws = useWorkspace();
  const [renaming, setRenaming] = React.useState(false);
  const group = model.groups.find((g) => g.id === item.groupId);
  const parent = item.parentItemId ? model.itemById.get(item.parentItemId) : null;
  const creator = ws.userById(item.createdBy);
  const links = useMentionLinks();
  return (
    // Its own surface under the tabs: what the task is, set apart from the work on it.
    <div className="border-b border-border bg-card">
      <ItemCover item={item} canEdit={canEdit} />
      <div className="px-5 pt-4 pb-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-2xs text-muted-foreground">
            <Link href={ws.boardPath(board)} className="truncate hover:text-foreground hover:underline" data-testid="panel-board-link">
              {board.name}
            </Link>
            {group && (
              <>
                <span aria-hidden>/</span>
                <span className="truncate">{group.name}</span>
              </>
            )}
            {parent && (
              <>
                <span aria-hidden>/</span>
                <button type="button" className="truncate hover:text-foreground hover:underline" onClick={() => openItem(parent.id)}>
                  {parent.name}
                </button>
              </>
            )}
          </p>
          <h2 className="mt-1 text-[23px] font-semibold leading-tight tracking-tight">
            <InlineEdit
              value={item.name}
              editing={renaming}
              onEditingChange={setRenaming}
              onSubmit={(name) => void mutations.renameItem(item.id, name)}
              disabled={!canEdit}
              ariaLabel="Item name"
              className={cn("-mx-1 break-words whitespace-normal rounded px-1", canEdit && "hover:bg-accent")}
              inputClassName="h-10 text-[23px] font-semibold"
            />
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {!shared && canManage && (
            <SimpleTooltip label="Share this task by link">
              <Button variant="ghost" size="icon-sm" onClick={() => setSharing(true)} aria-label="Share this task" data-testid="panel-share">
                <Share2 />
              </Button>
            </SimpleTooltip>
          )}
          <PanelMenu item={item} canEdit={canEdit} canManage={canManage} onShare={() => setSharing(true)} />
          {!hideClose && (
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel" data-testid="close-panel">
              <X />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <ReferenceField item={item} canEdit={canEdit} onSave={(reference) => void mutations.updateReference(item.id, reference)} />
        {share?.enabled && (
          <SimpleTooltip label={share.access === "PUBLIC" ? "Shared by link with anyone who has it." : "Shared by link with signed-in members."}>
            <button
              type="button"
              onClick={() => canManage && setSharing(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300"
              data-testid="panel-shared-badge"
            >
              <Globe className="size-3" /> {share.access === "PUBLIC" ? "Shared" : "Shared inside"}
            </button>
          </SimpleTooltip>
        )}
        {/* Only when there is somebody to name. A payload that deliberately
            withholds the author — a stakeholder portal does — used to render
            "Created by someone", which reads as a fault rather than a choice. */}
        {creator ? (
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <UserAvatar user={creator} size="xs" tooltip={false} />
            Created by <Mention href={links.person(item.createdBy)} className="font-normal">{creator.firstName}</Mention> <RelativeTime iso={item.createdAt} />
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">
            Created <RelativeTime iso={item.createdAt} />
          </p>
        )}
      </div>
      <AssetsRecapStrip assets={assets} />
      </div>
      <ShareItemDialog item={item} open={sharing} onOpenChange={setSharing} />
    </div>
  );
}

/** Long enough to tell a double click from two single ones, short enough that a copy still feels immediate. */
const REFERENCE_DOUBLE_CLICK_MS = 220;

/**
 * The task's ID#.
 *
 * Booking hands it out, and the board shows it read-only, but a task that
 * arrived some other way needs a way to be given one — and a code typed wrongly
 * into an email needs a way to be put right. Seven characters, upper case; one
 * click copies it and two open it for editing.
 */
function ReferenceField({ item, canEdit, onSave }: { item: Item; canEdit: boolean; onSave: (reference: string | null) => void }) {
  const [editing, setEditing] = React.useState(false);
  const code = item.reference ?? null;
  // The first click of a double click has to be held back, or opening the code
  // for editing would copy it twice on the way through.
  const pending = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (pending.current !== null) window.clearTimeout(pending.current);
    },
    [],
  );

  const click = () => {
    if (!code) {
      if (canEdit) setEditing(true);
      return;
    }
    if (!canEdit) {
      void copyToClipboard(code, `${code} copied`);
      return;
    }
    if (pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      void copyToClipboard(code, `${code} copied`);
    }, REFERENCE_DOUBLE_CLICK_MS);
  };

  // Opening the code for editing takes the caret and selects what is there, so
  // typing replaces the code rather than appending to it.
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!editing) return;
    const frame = requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const edit = () => {
    if (!canEdit) return;
    if (pending.current !== null) {
      window.clearTimeout(pending.current);
      pending.current = null;
    }
    setEditing(true);
  };

  if (editing) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent-soft pl-2 text-accent-soft-foreground ring-2 ring-ring/30">
        <span className="text-[10px] font-medium opacity-60">ID#</span>
        <input
          ref={input}
          autoFocus
          defaultValue={code ?? ""}
          maxLength={ITEM_REFERENCE_MAX}
          aria-label="ID"
          data-testid="panel-reference-input"
          className="h-full w-20 rounded-r-lg bg-transparent pr-2 font-mono text-[13px] font-semibold uppercase tabular outline-none"
          onBlur={(e) => {
            setEditing(false);
            const next = normaliseItemReference(e.currentTarget.value);
            if (next !== code) onSave(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = code ?? "";
              e.currentTarget.blur();
            }
          }}
        />
      </span>
    );
  }

  return (
    // The chip is quiet beside the task's name, but inside it the code leads and
    // the label only says what it is.
    <span className="inline-flex h-6 items-center overflow-hidden rounded-md bg-surface-strong/60" data-testid="panel-reference-chip">
      <span className="pl-1.5 text-[10px] font-medium text-muted-foreground/70">ID#</span>
      <button
        type="button"
        onClick={click}
        onDoubleClick={edit}
        title={canEdit ? "Click to copy, double click to edit" : "Booking code"}
        data-testid="panel-reference"
        className={cn(
          "h-full pr-1.5 pl-1 font-mono text-[13px] font-semibold text-foreground/90 tabular transition-colors hover:text-foreground",
          canEdit && "hover:bg-foreground/[0.06]",
          !code && "pl-1.5 text-2xs font-normal text-muted-foreground italic",
        )}
      >
        {code ?? (canEdit ? "Add an ID" : "None")}
      </button>
    </span>
  );
}

/**
 * The task's own description.
 *
 * This is a field of the item, not a column of the board — like the assets
 * recap, it exists on every task whatever the board is made of — so it keeps
 * its own section and never joins the column order.
 *
 * It stays folded down to one line until there is something in it. On a board
 * with a brief most tasks never get one, and an empty three-row textarea on
 * every one of them is a hole near the top of the panel; a reader who has
 * nothing to read here should not have to scroll past it.
 */
function DescriptionSection({ item, canEdit }: { item: Item; canEdit: boolean }) {
  const { mutations } = useBoardContext();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const text = item.description ?? "";

  // The draft is filled at the moment editing starts rather than kept in step
  // with the item, so a different task in the panel — or someone else's edit
  // arriving — never has to be reconciled with what is in the box.
  const startEditing = () => {
    setDraft(text);
    setEditing(true);
  };

  // Nothing written and nothing you could write: the section has no reason to be.
  if (!text && !canEdit) return null;

  const commit = () => {
    setEditing(false);
    // Emptied means gone, not an empty string: stored as "" it would never
    // again match the guard below, and every blur would write it out afresh.
    const next = draft.trim() || null;
    if (next !== (item.description ?? null)) void mutations.updateDescription(item.id, next);
  };

  return (
    <section>
      <h3 className="mb-1.5 label-quiet">Description</h3>
      {editing ? (
        <Textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setDraft(item.description ?? "");
              setEditing(false);
            }
          }}
          placeholder="Add a description, brief or links…"
          rows={3}
          aria-label="Description"
          className="resize-y"
        />
      ) : text ? (
        <button
          type="button"
          onClick={() => canEdit && startEditing()}
          aria-label={canEdit ? "Edit description" : undefined}
          className={cn(
            "w-full rounded-xl border border-border/70 bg-card px-3 py-2 text-left whitespace-pre-wrap text-[13px] text-foreground/90 shadow-xs",
            canEdit && "hover:border-border",
            !canEdit && "cursor-default",
          )}
          data-testid="panel-description"
        >
          {text}
        </button>
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="flex h-9 w-full items-center rounded-xl border border-dashed border-border/70 px-3 text-[13px] text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          data-testid="panel-description-empty"
        >
          Add a description
        </button>
      )}
    </section>
  );
}

function Overview({ item }: { item: Item }) {
  // Below 768 the field rows stack; the cell fills the row rather than holding
  // its desktop width, which at 375px would push the panel sideways.
  const isMobile = useIsMobile();
  const { model, mutations, canEdit, openItem } = useBoardContext();
  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const [newSub, setNewSub] = React.useState("");
  // Every column the panel is allowed to show, in the board's order. Hiding a
  // column here leaves nothing behind to click, so the panel's own menu keeps
  // the list of what is missing.
  const panelColumns = model.columns.filter((c) => !c.hiddenInPanel);
  const fieldSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  /** Dragging a field row is dragging the column: the panel and the board share one order. */
  const onFieldDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = model.columns.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    void mutations.reorderColumns(arrayMove(ids, from, to));
  };

  return (
    <div className="space-y-6 p-4">
      <DescriptionSection item={item} canEdit={canEdit} />

      <section>
        <h3 className="mb-1.5 label-quiet">Columns</h3>
        {/* Every column, in the board's own order, one row each — the brief
            included, because a document is a field like any other and putting it
            below the list meant the panel disagreed with the board about what
            order the columns are in. Dragging a row reorders the board. */}
        <DndContext sensors={fieldSensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onFieldDragEnd}>
          <SortableContext items={panelColumns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs" data-testid="panel-fields">
              {panelColumns.map((column) => (
                <FieldRow key={column.id} item={item} column={column} isMobile={isMobile} canEdit={canEdit} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <AllocationSection item={item} />
      <LinkedItemsSection item={item} />

      {item.parentItemId === null && (
        <section>
          <h3 className="mb-1.5 flex items-center justify-between label-quiet">
            Subitems <span className="tabular">{subitems.length}</span>
          </h3>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
            {subitems.map((sub) => {
              const done = model.isDone(sub.id);
              const statusColumn = model.statusColumn;
              const owners = model.personColumns.flatMap((c) => {
                const v = model.getValue(sub.id, c.id);
                return v?.type === "PERSON" ? v.userIds : [];
              });
              return (
                <li key={sub.id} className="flex h-9 items-center gap-2 px-2 text-[13px]">
                  <CornerDownRight className="size-3 text-muted-foreground/60" />
                  <button type="button" onClick={() => openItem(sub.id)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", done && "text-muted-foreground line-through")}>
                    {sub.name}
                  </button>
                  <SubOwners userIds={owners} />
                  {statusColumn && (
                    <div className="h-7 w-32 [&>*]:border-r-0">
                      <CellRenderer item={sub} column={statusColumn} width={128} value={model.getValue(sub.id, statusColumn.id)} onChange={(value) => void mutations.setValue(sub, statusColumn, value)} readOnly={!canEdit} />
                    </div>
                  )}
                </li>
              );
            })}
            {canEdit && (
              <li className="flex h-9 items-center gap-2 px-2">
                <Plus className="size-3.5 text-muted-foreground/60" />
                <input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSub.trim()) {
                      void mutations.createItem({ groupId: item.groupId, parentItemId: item.id, name: newSub });
                      setNewSub("");
                    }
                  }}
                  placeholder="Add subitem"
                  aria-label="Add subitem"
                  className="h-7 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
                />
              </li>
            )}
            {subitems.length === 0 && !canEdit && <li className="px-3 py-2 text-[13px] text-muted-foreground">No subitems.</li>}
          </ul>
        </section>
      )}

    </div>
  );
}

/**
 * The panel's own overflow menu: what can be done to this task, and what to do
 * about the columns it is no longer showing.
 *
 * A column hidden from the panel leaves nothing behind to click, so without
 * this there would be no way back. The restore list is the only place that
 * tells you what the panel is keeping from you.
 */
function PanelMenu({ item, canEdit, canManage, onShare }: { item: Item; canEdit: boolean; canManage: boolean; onShare: () => void }) {
  const { model, mutations, openItem } = useBoardContext();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const hiddenHere = model.columns.filter((c) => c.hiddenInPanel);
  const hiddenOnBoard = model.columns.filter((c) => c.hidden);
  const anythingHidden = hiddenHere.length > 0 || hiddenOnBoard.length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions for this task" data-testid="panel-menu">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {canEdit && (
            <>
              <DropdownMenuItem onSelect={() => void mutations.duplicateItem(item.id)}>
                <Copy /> Duplicate task
              </DropdownMenuItem>
              {canManage && (
                <DropdownMenuItem onSelect={onShare}>
                  <Share2 /> Share by link…
                </DropdownMenuItem>
              )}
            </>
          )}

          {/* Everything the panel is not showing, and the way back — and
              nothing at all when it is showing everything, since a heading over
              the words "nothing is hidden" is a section that exists only to say
              it is empty. */}
          {anythingHidden && (
            <>
              {canEdit && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">Hidden columns</DropdownMenuLabel>
              {hiddenHere.map((column) => (
                <DropdownMenuItem key={column.id} onSelect={() => void mutations.updateColumn(column.id, { hiddenInPanel: false })} data-testid={`restore-panel-${column.id}`}>
                  <Eye /> <span className="min-w-0 truncate">{column.name}</span>
                  <span className="ml-auto shrink-0 text-2xs text-muted-foreground">panel</span>
                </DropdownMenuItem>
              ))}
              {hiddenOnBoard.map((column) => (
                <DropdownMenuItem key={`b-${column.id}`} onSelect={() => void mutations.updateColumn(column.id, { hidden: false })} data-testid={`restore-board-${column.id}`}>
                  <Eye /> <span className="min-w-0 truncate">{column.name}</span>
                  <span className="ml-auto shrink-0 text-2xs text-muted-foreground">board</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onSelect={() => {
                  for (const column of new Set([...hiddenHere, ...hiddenOnBoard])) void mutations.updateColumn(column.id, { hidden: false, hiddenInPanel: false });
                }}
                data-testid="restore-all-columns"
              >
                <Eye /> Show all columns
              </DropdownMenuItem>
            </>
          )}

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  void mutations.archiveItems([item.id]);
                  openItem(null);
                }}
              >
                <Package /> Archive task
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)} data-testid="panel-delete-item">
                <Trash2 /> Delete task
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete “${item.name}”?`}
        description="The task, its updates, its deliverables and its files all go. This cannot be undone."
        confirmLabel="Delete task"
        destructive
        onConfirm={() => {
          void mutations.deleteItems([item.id]);
          openItem(null);
        }}
      />
    </>
  );
}

/**
 * What can be done to a column, from the row that shows it.
 *
 * The board's header has the same menu; this is the panel's, for the times you
 * are reading a task rather than a table. Hiding asks *where*, because the two
 * views want different things out of the same column: one worth filtering a
 * board by is not always worth reading on every task, and the other way round.
 */
function ColumnRowMenu({ column }: { column: BoardColumn }) {
  const { mutations } = useBoardContext();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const hide = (patch: Partial<Pick<BoardColumn, "hidden" | "hiddenInPanel">>) => void mutations.updateColumn(column.id, patch);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${column.name}`}
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/row:opacity-100 data-[state=open]:opacity-100"
            data-testid={`panel-column-menu-${column.id}`}
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* What kind of column this is, which the name alone rarely says. */}
          <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">{COLUMN_TYPE_LABELS[column.type]} column</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus /> Insert column
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={COLUMN_TYPE_PICKER_WIDTH}>
              <ColumnTypePicker onPick={(type) => void mutations.addColumn(COLUMN_TYPE_LABELS[type], type, { afterColumnId: column.id })} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <EyeOff /> Hide
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuItem onSelect={() => hide({ hidden: true })} data-testid="hide-on-board">
                On the board
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => hide({ hiddenInPanel: true })} data-testid="hide-in-panel">
                On this panel
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => hide({ hidden: true, hiddenInPanel: true })} data-testid="hide-both">
                Both
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)} data-testid="panel-column-remove">
            <Trash2 /> Remove column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Remove “${column.name}”?`}
        description="The column and everything every task has in it go, on this board and on the panel. This cannot be undone."
        confirmLabel="Remove column"
        destructive
        onConfirm={() => void mutations.deleteColumn(column.id)}
      />
    </>
  );
}

/**
 * One column of the board, as a row of the panel.
 *
 * Every column is here, in the board's order, so the two views agree about what
 * comes first. A rich text column is the one that can be opened where it
 * stands: its value is a page, and a page does not fit on a row.
 *
 * The handle is always drawn rather than appearing on hover — a control you
 * cannot see is a control nobody finds — but it is quiet until the row is under
 * the cursor. On a phone there is no handle at all: reordering by drag inside a
 * scrolling sheet fights the scroll, and the board is where columns get
 * arranged anyway.
 */
function FieldRow({ item, column, isMobile, canEdit }: { item: Item; column: BoardColumn; isMobile: boolean; canEdit: boolean }) {
  const { model, mutations } = useBoardContext();
  const [open, setOpen] = React.useState(false);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, disabled: isMobile || !canEdit });

  const value = model.getValue(item.id, column.id);
  const brief = column.type === "RICH_TEXT";
  const body = value?.type === "RICH_TEXT" ? value.text : "";

  // The handle takes 24px off the left, so the label gives that back out of its
  // own padding rather than out of its words: "Requested team" fits either way.
  const label = <span className={cn("truncate text-[13px] text-muted-foreground", isMobile ? "text-2xs" : "w-28 shrink-0 pr-2 pl-1")}>{column.name}</span>;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("bg-card", isDragging && "relative z-10 rounded-lg opacity-95 shadow-lg")}
      data-testid={`panel-field-${column.id}`}
    >
      <div className={cn("group/row flex", isMobile ? "flex-col gap-0.5 px-3 py-2" : "h-10 items-center")}>
        {!isMobile && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Reorder ${column.name}`}
            title={`Reorder ${column.name}`}
            className={cn(
              "ml-1 flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing group-hover/row:opacity-100",
              !canEdit && "invisible",
            )}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        {label}
        {brief ? (
          <BriefRowValue
            title={column.name}
            body={body}
            canEdit={canEdit}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            onSave={(text) => void mutations.setValue(item, column, { type: "RICH_TEXT", text })}
          />
        ) : (
          <CellStretchProvider mode={isMobile ? "fill" : "none"}>
            {/* The cell takes the whole height of the row, so a status chip is
                a band down the row rather than a small pill floating in it. Its
                own padding keeps it off the dividers. */}
            <div className={cn("flex min-w-0 items-center [&>*]:border-r-0", isMobile ? "min-h-11 w-full" : "h-full flex-1")}>
              <CellRenderer
                item={item}
                column={column}
                width={FIELD_WIDTH}
                value={value}
                onChange={(next) => void mutations.setValue(item, column, next)}
                readOnly={!canEdit}
                isDone={model.isDone(item.id)}
              />
            </div>
          </CellStretchProvider>
        )}
        {!isMobile && canEdit && <ColumnRowMenu column={column} />}
      </div>
      {brief && open && (
        <div className="scrollbar-thin max-h-96 overflow-y-auto border-t border-border/60 px-3 py-2.5" data-testid="rich-text-field-body">
          <RichTextDocument body={body} />
        </div>
      )}
    </div>
  );
}

function SubOwners({ userIds }: { userIds: string[] }) {
  const ws = useWorkspace();
  const users = userIds.map((id) => ws.userById(id)).filter((u): u is NonNullable<typeof u> => !!u);
  if (users.length === 0) return null;
  return (
    <span className="flex -space-x-1.5">
      {users.slice(0, 3).map((u) => (
        <UserAvatar key={u.id} user={u} size="xs" />
      ))}
    </span>
  );
}

function ItemActivity({ itemId }: { itemId: string }) {
  const activity = useItemActivity(itemId);
  if (activity.isLoading) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
      </div>
    );
  }
  return <ActivityFeed activities={activity.data ?? []} className="divide-y py-2" emptyTitle="No activity recorded for this item yet." />;
}

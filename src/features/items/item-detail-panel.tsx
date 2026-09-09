"use client";

import { CornerDownRight, Globe, History, MessageSquare, Package, Plus, Share2, SquarePen, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEdit } from "@/components/shared/inline-edit";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import type { BoardColumn, Item, ItemAsset } from "@/domain";
import { ITEM_REFERENCE_MAX, normaliseItemReference } from "@/domain";
import { copyToClipboard } from "@/features/members/hooks";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useItemActivity } from "@/features/activity/hooks";
import { useBoardContext } from "@/features/boards/board-context";
import { CellRenderer } from "@/features/boards/components/cells/cell-renderer";
import { CellStretchProvider } from "@/features/boards/components/cells/cell-shell";
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
      className={cn(
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
      )}
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
        <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <UserAvatar user={creator} size="xs" tooltip={false} />
          Created by <Mention href={links.person(item.createdBy)} className="font-normal">{creator?.firstName ?? "someone"}</Mention> <RelativeTime iso={item.createdAt} />
        </p>
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

function Overview({ item }: { item: Item }) {
  // Below 768 the field rows stack; the cell fills the row rather than holding
  // its desktop width, which at 375px would push the panel sideways.
  const isMobile = useIsMobile();
  const { model, mutations, canEdit, openItem } = useBoardContext();
  const [description, setDescription] = React.useState(item.description ?? "");
  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const [newSub, setNewSub] = React.useState("");
  const fieldColumns = model.columns.filter((c) => c.type !== "LONG_TEXT");
  const longTextColumns = model.columns.filter((c) => c.type === "LONG_TEXT");

  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-1.5 label-quiet">Description</h3>
        {canEdit ? (
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if ((description.trim() || null) !== (item.description ?? null)) void mutations.updateDescription(item.id, description);
            }}
            placeholder="Add a description, brief or links…"
            rows={3}
            aria-label="Description"
            className="resize-y"
          />
        ) : (
          <p className="whitespace-pre-wrap text-[13px] text-foreground/90">{item.description || <span className="text-muted-foreground">No description.</span>}</p>
        )}
      </section>

      <section>
        <h3 className="mb-1.5 label-quiet">Fields</h3>
        <div className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
          {fieldColumns.map((column) => (
            <div key={column.id} className={cn("flex", isMobile ? "flex-col gap-0.5 px-3 py-2" : "h-10 items-center")}>
              <span className={cn("truncate text-[13px] text-muted-foreground", isMobile ? "text-2xs" : "w-32 shrink-0 px-3")}>{column.name}</span>
              <CellStretchProvider mode={isMobile ? "fill" : "none"}>
              <div className={cn("flex min-w-0 items-center [&>*]:border-r-0", isMobile ? "min-h-11 w-full" : "h-8 flex-1")}>
                <CellRenderer
                  item={item}
                  column={column}
                  width={FIELD_WIDTH}
                  value={model.getValue(item.id, column.id)}
                  onChange={(value) => void mutations.setValue(item, column, value)}
                  readOnly={!canEdit}
                  isDone={model.isDone(item.id)}
                />
              </div>
              </CellStretchProvider>
            </div>
          ))}
        </div>
        {longTextColumns.map((column) => {
          const v = model.getValue(item.id, column.id);
          const text = v?.type === "LONG_TEXT" ? v.text : "";
          return (
            <LongTextField key={`${column.id}:${text}`} column={column} text={text} canEdit={canEdit} onSave={(next) => void mutations.setValue(item, column, { type: "LONG_TEXT", text: next })} />
          );
        })}
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

function LongTextField({ column, text, canEdit, onSave }: { column: BoardColumn; text: string; canEdit: boolean; onSave: (text: string) => void }) {
  const [draft, setDraft] = React.useState(text);
  return (
    <div className="mt-3">
      <p className="mb-1 text-[13px] text-muted-foreground">{column.name}</p>
      {canEdit ? (
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== text && onSave(draft)} rows={3} aria-label={column.name} />
      ) : (
        <p className="whitespace-pre-wrap text-[13px]">{text || <span className="text-muted-foreground">—</span>}</p>
      )}
    </div>
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

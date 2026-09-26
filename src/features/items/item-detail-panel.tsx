"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, Route, Copy, CornerDownRight, Eye, EyeOff, Globe, GripVertical, Hash, History, LoaderCircle, MessageSquare, MoreVertical, Package, PanelRight, PictureInPicture2, Plus, Share2, SquarePen, Trash2, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { InlineEdit } from "@/components/shared/inline-edit";
import { RelativeTime } from "@/components/shared/relative-time";
import { Badge } from "@/components/ui/badge";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import type { BoardColumn, Item, ItemAsset } from "@/domain";
import { COLUMN_TYPE_LABELS, TICKET_MAX, isSystemColumnType } from "@/domain";
import { copyToClipboard } from "@/features/members/hooks";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useItemActivity } from "@/features/activity/hooks";
import { TaskJourneyDialog } from "@/features/journey/task-journey-dialog";
import { useBoardContext } from "@/features/boards/board-context";
import { CellRenderer } from "@/features/boards/components/cells/cell-renderer";
import { CellStretchProvider } from "@/features/boards/components/cells/cell-shell";
import { COLUMN_TYPE_PICKER_WIDTH, ColumnTypePicker } from "@/features/boards/components/table/column-type-picker";
import { useComments } from "@/features/comments/hooks";
import { ItemUpdates } from "@/features/items/item-updates";
import { useItemAssets } from "@/features/items/asset-hooks";
import { AssetsRecapStrip } from "@/features/items/item-assets-recap";
import { useItemLinks } from "@/features/items/link-hooks";
import { ShareItemDialog, useItemShareStatus } from "@/features/items/share-item-dialog";
import { ItemAssetsTab } from "@/features/items/item-assets-tab";
import { useMarkItemSeen } from "@/features/comments/updates";
import { ItemCover } from "@/features/items/item-cover";
import { useBoardUiStore } from "@/stores/board-ui-store";
import { AllocationSection } from "@/features/booking/allocation-section";
import { LinkedItemsSection } from "@/features/items/linked-items-section";
import { PANEL_WIDTHS, PanelSizeProvider, usePanelSize, useResizablePanel } from "@/features/items/panel-size";
import { BriefRowValue, RichTextDocument } from "@/features/items/rich-text-field";
import { Mention, useMentionLinks } from "@/features/workspace/mention-link";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { colorClasses } from "@/lib/colors";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

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
    "relative flex flex-col bg-surface",
    shared
      ? "min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 shadow-sm"
      : narrow
        ? "fixed inset-0 z-40"
        : overlay
          ? "absolute inset-y-1.5 right-2.5 z-30 overflow-hidden rounded-2xl border border-border/70 shadow-2xl animate-in slide-in-from-right-4 duration-150"
          : "mx-2.5 my-1.5 shrink-0 overflow-hidden rounded-2xl border border-border/70 shadow-xl animate-in slide-in-from-right-4 duration-150",
  );
}

/**
 * The panel's edge in the board's colour: a hairline across the top that runs
 * round the corners and fades into the ordinary border a short way down each
 * side, so the panel lifts off the board without a frame around it.
 *
 * Drawn on the panel's own border: the panel clips its contents to the inside
 * of that border, so no layer could sit on it, and the fill is painted twice
 * instead — the surface inside the border, the gradient under it, showing only
 * through the border. Two pixels along the top, tapering to one round the
 * corners, and the extra pixel is taken from inside: the panel's width already
 * counts its border. A second hairline laid inside the first looked thicker
 * too, but the two curves never quite met and the corners came out ragged.
 *
 * Not over a cover photo: the picture already marks the top of the panel, and
 * a coloured rule along its edge only frames it.
 */
function panelEdgeStyle(hex: string): React.CSSProperties {
  return {
    borderColor: "transparent",
    borderTopWidth: 2,
    background: [
      "linear-gradient(var(--surface), var(--surface)) padding-box",
      `linear-gradient(to bottom, ${hex}, color-mix(in srgb, ${hex} 40%, var(--border)) 40px, color-mix(in srgb, var(--border) 70%, transparent) 150px) border-box`,
    ].join(", "),
  };
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
  const width = PANEL_WIDTHS[useUiStore((s) => s.itemPanelSize)];
  return (
    <aside role="dialog" aria-label="Opening task" aria-busy className={panelClasses(false, narrow, overlay)} style={narrow ? undefined : { width }} data-testid="item-panel-skeleton">
      <PanelBlocks onClose={onClose} />
    </aside>
  );
}

/**
 * The panel before it has anything to say: a bar, a name, some chips and a
 * stack of field rows.
 *
 * Enough that it has the proportions it is about to have, and not so particular
 * that it pretends to know how many columns this board has. The close button is
 * real, because a task opened by mistake should not have to be waited out.
 */
function PanelBlocks({ onClose, hideClose = false }: { onClose: () => void; hideClose?: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="panel-blocks">
      <div className="flex h-12 items-center justify-between gap-2 border-b px-3">
        <Skeleton className="h-4 w-40" />
        {!hideClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
            <X />
          </Button>
        )}
      </div>
      <div className="space-y-4 p-4">
        <Skeleton className="h-7 w-3/4" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20 rounded-full" />
          ))}
        </div>
        <Skeleton className="h-24 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * @param popup Shown as a pop-up over the middle of the board rather than a
 * column beside it — wide enough to read the task and its updates at once, so
 * the tabs stop being a choice between them.
 */
export function ItemDetailPanel({
  itemId,
  onClose,
  overlay = false,
  shared = false,
  popup = false,
  hideMenu = false,
  notice,
}: {
  itemId: string;
  onClose: () => void;
  overlay?: boolean;
  shared?: boolean;
  popup?: boolean;
  /**
   * Drops the task's own "…" menu, and with it the choice of where the task is
   * shown. For the stakeholder portal: everything behind that menu is either a
   * change to the board a stakeholder has no business making, or a choice about
   * a board they are not looking at.
   */
  hideMenu?: boolean;
  /** Something the reader should know about this task before anything else, shown under its header. */
  notice?: React.ReactNode;
}) {
  const { model, canEdit, board } = useBoardContext();
  const item = model.itemById.get(itemId);
  const narrow = useMediaQuery("(max-width: 1023px)");
  // Two panes need the room for two panes. Below that the pop-up is the panel,
  // which is already full screen on a phone.
  const asPopup = popup && !narrow;
  // Only the panel beside a board takes a width of its own: a shared page fills
  // the page, a phone fills the screen, and the pop-up has its own frame.
  const resizable = !narrow && !shared && !asPopup;
  const panel = useResizablePanel(resizable);
  // The wide panel reads like the pop-up: the overview, and the other three
  // tabs in a pane beside it.
  const twoPane = asPopup || panel.size === "wide";
  const [localTab, setLocalTab] = React.useState("overview");
  const requestedTab = useBoardUiStore((s) => s.requestedItemTab);
  const setRequestedItemTab = useBoardUiStore((s) => s.setRequestedItemTab);
  // A request (from the updates badge, say) wins until the person picks a tab.
  const requested = requestedTab?.itemId === itemId ? requestedTab.tab : null;
  // Two panes, two pairs of tabs: the overview and the updates on the left, the
  // deliverables and the history on the right. They open on the updates and the
  // deliverables, the two that change while a task is being worked on.
  const [wideLeft, setWideLeft] = React.useState<WideLeftTab>("updates");
  const [wideRight, setWideRight] = React.useState<WideRightTab>("assets");
  const leftTab: WideLeftTab = requested === "overview" || requested === "updates" ? requested : wideLeft;
  const rightTab: WideRightTab = requested === "assets" || requested === "activity" ? requested : wideRight;
  // What is on screen, for anything that has to know whether the updates are.
  const tab = twoPane ? (leftTab === "updates" ? "updates" : rightTab) : (requested ?? localTab);
  const setTab = (next: string) => {
    if (requestedTab) setRequestedItemTab(null);
    setLocalTab(next);
  };
  const pickWide = (side: "left" | "right", next: string) => {
    if (requestedTab) setRequestedItemTab(null);
    if (side === "left") setWideLeft(next as WideLeftTab);
    else setWideRight(next as WideRightTab);
  };
  const comments = useComments(itemId);
  const assets = useItemAssets(itemId);
  const links = useItemLinks(itemId);
  const share = useItemShareStatus(shared ? "" : itemId);
  /**
   * Everything the panel reads per task, arriving together or not at all.
   *
   * The task itself is in the board's snapshot, so it could be drawn inside the
   * click — but its updates, deliverables, links and share state are each their
   * own read, and showing the panel the moment the name was known meant counts
   * appearing, a recap strip pushing the tabs down, and a share badge turning
   * up seconds later. A panel that keeps rearranging itself cannot be read. So
   * the blocks hold until all of it is in, and then the task appears once.
   *
   * Each read is cached for long enough that going back to a task just looked
   * at skips the blocks entirely.
   */
  const loading = comments.isLoading || assets.isLoading || links.isLoading || (!shared && share.isLoading);
  /**
   * And the reveal itself happens off the click.
   *
   * Drawing the fields is the expensive part of the panel — every column of the
   * board as its own row, each one draggable, measured at around 150ms — and
   * deferring it means React renders them in a pass it is free to break up
   * rather than one that holds the frame.
   */
  const settledItemId = React.useDeferredValue(loading ? "" : itemId, "");
  const ready = !!item && settledItemId === itemId;
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
    // The pop-up is a real dialog and closes itself on Escape; two handlers
    // answering one key is one handler too many.
    if (asPopup) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape inside a field (or the update composer, a contenteditable) belongs to that field.
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable);
      // An open picker, menu or dialog takes the Escape for itself; the panel closes on the next one.
      const inOverlay = !!document.querySelector("[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']:not([data-testid='item-panel']), [role='menu'][data-state='open']");
      if (e.key === "Escape" && !inField && !inOverlay) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asPopup]);

  const body = (
    <>
      {!item && !loading ? (
        <div className="flex h-full flex-col">
          <div className="flex h-12 items-center justify-end border-b px-3">
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
              <X />
            </Button>
          </div>
          <EmptyState title="Item not found" description="It may have been deleted or archived." />
        </div>
      ) : !ready || !item ? (
        <PanelBlocks onClose={onClose} hideClose={shared} />
      ) : twoPane ? (
        <>
          <PanelHeader item={item} onClose={onClose} canEdit={canEdit} assets={assets.data ?? []} hideClose={shared} shared={shared} popup={asPopup} hideMenu={hideMenu} />
          {notice}
          <PopupBody
            item={item}
            canEdit={canEdit}
            leftTab={leftTab}
            rightTab={rightTab}
            onLeftChange={(next) => pickWide("left", next)}
            onRightChange={(next) => pickWide("right", next)}
            comments={comments.data?.length ?? 0}
            assets={assets.data?.length ?? 0}
          />
        </>
      ) : (
        <>
          <PanelHeader item={item} onClose={onClose} canEdit={canEdit} assets={assets.data ?? []} hideClose={shared} shared={shared} hideMenu={hideMenu} />
          {notice}
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            {/* Compact, the four tabs are their icons and counts: four words
                do not fit in 300px beside them. The words stay for anyone
                reading rather than looking, and as the tooltip. */}
            <UnderlineTabsList className={cn(panel.size === "compact" ? "justify-between px-2" : "px-4", narrow && "scrollbar-none overflow-x-auto overscroll-x-contain")}>
              <UnderlineTabsTrigger value="overview" title={panel.size === "compact" ? "Overview" : undefined}>
                <SquarePen className="size-3.5" /> <span className={cn(panel.size === "compact" && "sr-only")}>Overview</span>
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="updates" title={panel.size === "compact" ? "Updates" : undefined}>
                <MessageSquare className="size-3.5" /> <span className={cn(panel.size === "compact" && "sr-only")}>Updates</span>
                {comments.data && comments.data.length > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{comments.data.length}</span>}
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="assets" data-testid="tab-assets" title={panel.size === "compact" ? "Assets" : undefined}>
                <Package className="size-3.5" /> <span className={cn(panel.size === "compact" && "sr-only")}>Assets</span>
                {assets.data && assets.data.length > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{assets.data.length}</span>}
              </UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="activity" title={panel.size === "compact" ? "Activity" : undefined}>
                <History className="size-3.5" /> <span className={cn(panel.size === "compact" && "sr-only")}>Activity</span>
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
              <ItemActivity item={item} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  );

  if (asPopup) {
    return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        {/* Its own frame rather than the panel's: centred, none of the dialog's
            usual padding, and as tall as the screen comfortably allows so the
            overview and the pane beside it each have somewhere to scroll. */}
        <DialogContent
          className="flex h-[calc(100vh-3.5rem)] max-h-[1040px] max-w-[min(1160px,calc(100vw-4rem))] flex-col gap-0 overflow-hidden p-0"
          aria-describedby={undefined}
          data-testid="item-popup"
          /* The header's own close, beside share and the task's menu, rather
             than the dialog's in the corner above it: two ways out, a row
             apart, is one more than the reader needs to find. */
          hideClose
        >
          <DialogTitle className="sr-only">{item?.name ?? "Task"}</DialogTitle>
          {body}
        </DialogContent>
      </Dialog>
    );
  }

  const edge = narrow || item?.coverUrl ? null : colorClasses(board.color).hex;
  return (
    <aside
      role="dialog"
      aria-label={item ? item.name : "Item"}
      data-testid="item-panel"
      className={panelClasses(shared, narrow, overlay)}
      // Full screen on a phone there is no edge to colour. Settling on a width
      // after a drag, or stepping to one, glides; following the hand does not,
      // or the edge would trail behind it. Inline, because the slide-in's
      // duration class otherwise leaves every property easing during a drag.
      style={{
        ...(edge ? panelEdgeStyle(edge) : undefined),
        ...(resizable ? { width: panel.width, transition: panel.dragging ? "none" : "width 200ms ease-out" } : undefined),
      }}
      data-panel-size={resizable ? panel.size : undefined}
    >
      {panel.handle}
      <PanelSizeProvider value={panel.size}>{body}</PanelSizeProvider>
    </aside>
  );
}

type WideLeftTab = "overview" | "updates";
type WideRightTab = "assets" | "activity";

/**
 * The two-pane body of the wide panel and the pop-up.
 *
 * Left, what the task is and what is being said about it; right, what it is
 * delivering and what has happened to it. Two equal columns, each with its own
 * pair of tabs, so the conversation and the deliverables can be read side by
 * side, which is what the width is for.
 */
function PopupBody({
  item,
  canEdit,
  leftTab,
  rightTab,
  onLeftChange,
  onRightChange,
  comments,
  assets,
}: {
  item: Item;
  canEdit: boolean;
  leftTab: WideLeftTab;
  rightTab: WideRightTab;
  onLeftChange: (tab: string) => void;
  onRightChange: (tab: string) => void;
  comments: number;
  assets: number;
}) {
  return (
    // Two equal columns, whatever either one holds. As flex items the two asked
    // for equal shares, but a flex item will not shrink below its content, and
    // the overview's rows are wide enough that it took three quarters of the
    // panel and left the other side a sliver. A grid track of minmax(0, 1fr)
    // has no such floor.
    <div className="grid min-h-0 flex-1 grid-cols-2">
      <section className="flex min-h-0 min-w-0 flex-col border-r border-border" aria-label="Overview and updates">
        <Tabs value={leftTab} onValueChange={onLeftChange} className="flex min-h-0 flex-1 flex-col">
          <UnderlineTabsList className="shrink-0 px-3">
            <UnderlineTabsTrigger value="overview">
              <SquarePen className="size-3.5" /> Overview
            </UnderlineTabsTrigger>
            <UnderlineTabsTrigger value="updates">
              <MessageSquare className="size-3.5" /> Updates
              {comments > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{comments}</span>}
            </UnderlineTabsTrigger>
          </UnderlineTabsList>
          <TabsContent value="overview" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <Overview key={item.id} item={item} />
          </TabsContent>
          <TabsContent value="updates" className="min-h-0 flex-1">
            <ItemUpdates itemId={item.id} canComment={canEdit} />
          </TabsContent>
        </Tabs>
      </section>
      <section className="flex min-h-0 min-w-0 flex-col bg-surface-strong/15" aria-label="Assets and activity">
        <Tabs value={rightTab} onValueChange={onRightChange} className="flex min-h-0 flex-1 flex-col">
          <UnderlineTabsList className="shrink-0 px-3">
            <UnderlineTabsTrigger value="assets" data-testid="tab-assets">
              <Package className="size-3.5" /> Assets
              {assets > 0 && <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{assets}</span>}
            </UnderlineTabsTrigger>
            <UnderlineTabsTrigger value="activity">
              <History className="size-3.5" /> Activity
            </UnderlineTabsTrigger>
          </UnderlineTabsList>
          <TabsContent value="assets" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <ItemAssetsTab key={item.id} item={item} canEdit={canEdit} />
          </TabsContent>
          <TabsContent value="activity" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4">
            <ItemActivity item={item} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}

function PanelHeader({
  item,
  onClose,
  canEdit,
  assets,
  hideClose,
  shared,
  popup,
  hideMenu,
}: {
  item: Item;
  onClose: () => void;
  canEdit: boolean;
  assets: readonly ItemAsset[];
  hideClose?: boolean;
  /** True on the page behind a link: there is nothing to share from inside a share. */
  shared?: boolean;
  /** Over the middle of the board rather than beside it, so the menu offers the way back. */
  popup?: boolean;
  /** No menu at all — see ItemDetailPanel. */
  hideMenu?: boolean;
}) {
  const { model, mutations, openItem, board, canManage } = useBoardContext();
  const [sharing, setSharing] = React.useState(false);
  // Everyone on the board can see that the task is out on a link; only the
  // board's managers can change that.
  const share = useItemShareStatus(shared ? "" : item.id).data ?? null;
  const ws = useWorkspace();
  const [renaming, setRenaming] = React.useState(false);
  const [journeyOpen, setJourneyOpen] = React.useState(false);
  const group = model.groups.find((g) => g.id === item.groupId);
  const parent = item.parentItemId ? model.itemById.get(item.parentItemId) : null;
  const creator = ws.userById(item.createdBy);
  const links = useMentionLinks();
  // The same three lines at every width, set tighter or looser to suit it.
  const size = usePanelSize();
  return (
    // Its own surface under the tabs: what the task is, set apart from the work
    // on it. Three lines, in order of weight: where it is (small), what it is
    // (large, alone), and the facts about it (small, quiet). A wash of the
    // board's colour across the top marks the band off from the fields below.
    <div className="relative overflow-hidden border-b border-border bg-card" data-testid="panel-header">
      <span
        aria-hidden
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-32 opacity-[0.09]", colorClasses(board.color).dot)}
        style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }}
      />
      <div className="relative">
        <ItemCover item={item} canEdit={canEdit} />
      </div>
      <div className={cn("relative", size === "compact" ? "px-4 pt-3 pb-4" : size === "wide" ? "px-8 pt-5 pb-7" : "px-6 pt-4 pb-6")}>
        <div className="flex items-center gap-3">
          <p className="flex min-w-0 flex-1 items-center gap-1 text-2xs text-muted-foreground">
            <Link href={ws.boardPath(board)} className="truncate hover:text-foreground hover:underline" data-testid="panel-board-link">
              {board.name}
            </Link>
            {/* Where the task actually is: put away, it is found in the archive rather than in its group. */}
            {item.archivedAt && (
              <>
                <span aria-hidden>/</span>
                <Link href={routes.boardArchive(ws.slug, board.slug)} className="truncate hover:text-foreground hover:underline" data-testid="panel-archive-link">
                  Archived
                </Link>
              </>
            )}
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
          <div className="-mr-1.5 flex shrink-0 items-center">
            {/* The task's story, booking to archive. Not on a shared link: its log is not a visitor's to read. */}
            {!shared && (
              <SimpleTooltip label="Task journey">
                <Button variant="ghost" size="icon-xs" onClick={() => setJourneyOpen(true)} aria-label="Task journey" data-testid="open-task-journey">
                  <Route />
                </Button>
              </SimpleTooltip>
            )}
            {!shared && canManage && (
              <SimpleTooltip label="Share this task by link">
                <Button variant="ghost" size="icon-xs" onClick={() => setSharing(true)} aria-label="Share this task" data-testid="panel-share">
                  <Share2 />
                </Button>
              </SimpleTooltip>
            )}
            {!hideMenu && <PanelMenu item={item} canEdit={canEdit} canManage={canManage} onShare={() => setSharing(true)} shared={shared} popup={popup} />}
            {!hideClose && (
              <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close panel" data-testid="close-panel">
                <X />
              </Button>
            )}
          </div>
        </div>

        <h2 className={cn("font-semibold tracking-tight", size === "compact" ? "mt-2 text-lg leading-snug" : size === "wide" ? "mt-3.5 text-[30px] leading-[1.15]" : "mt-3 text-[26px] leading-[1.2]")}>
          <InlineEdit
            value={item.name}
            editing={renaming}
            onEditingChange={setRenaming}
            onSubmit={(name) => void mutations.renameItem(item.id, name)}
            disabled={!canEdit}
            ariaLabel="Item name"
            className={cn("-mx-1 break-words whitespace-normal rounded px-1", canEdit && "hover:bg-accent")}
            inputClassName={cn("font-semibold", size === "compact" ? "h-8 text-lg" : size === "wide" ? "h-12 text-[30px]" : "h-11 text-[26px]")}
          />
        </h2>

        {/* One quiet line of facts. Everything here is a size and a shade below
            the name, so the name is what the eye lands on. */}
        <div className={cn("flex flex-wrap items-center gap-y-2 text-2xs text-muted-foreground", size === "compact" ? "mt-2.5 gap-x-3" : "mt-4 gap-x-4")}>
          <TicketField item={item} canEdit={canEdit} onSave={(value) => mutations.setTicket(item.id, value)} onAssign={() => void mutations.assignTicket(item.id)} />
          {item.archivedAt && (
            <Badge variant="warning" className="gap-1" data-testid="panel-archived-badge">
              <Archive className="size-3" aria-hidden /> Archived <RelativeTime iso={item.archivedAt} />
            </Badge>
          )}
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
            <p className="flex items-center gap-1.5">
              <UserAvatar user={creator} size="xs" tooltip={false} />
              <span>
                <Mention href={links.person(item.createdBy)} className="font-normal">{creator.firstName}</Mention> · <RelativeTime iso={item.createdAt} />
              </span>
            </p>
          ) : (
            <p>
              Created <RelativeTime iso={item.createdAt} />
            </p>
          )}
        </div>
        <AssetsRecapStrip assets={assets} />
      </div>
      <ShareItemDialog item={item} open={sharing} onOpenChange={setSharing} />
      {!shared && <TaskJourneyDialog item={item} open={journeyOpen} onOpenChange={setJourneyOpen} />}
    </div>
  );
}

/** Long enough to tell a double click from two single ones, short enough that a copy still feels immediate. */
const TICKET_DOUBLE_CLICK_MS = 220;

/**
 * The task's ticket.
 *
 * Booking hands one out. Work that arrived some other way starts without one
 * and is given the next in the series by asking for it here — there is nothing
 * to type, because the number is the workspace's to give.
 *
 * One click copies, two open it for editing: the code quoted wrongly in an
 * email has to be fixable, and a task taking over from another has to be able
 * to take its ticket. What is typed is checked against the whole workspace
 * before it is kept, so this hands the raw text over rather than tidying it
 * into something that might be a different ticket.
 */
function TicketField({
  item,
  canEdit,
  onSave,
  onAssign,
}: {
  item: Item;
  canEdit: boolean;
  /** Resolves when the workspace has accepted the ticket or refused it. */
  onSave: (value: string | null) => Promise<unknown>;
  onAssign: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  /**
   * The code typed in, while the workspace is being asked whether anything else
   * already holds it.
   *
   * That question is a read across every board in the workspace, which from
   * here is a round trip — and until it came back the chip still said the old
   * code, so a ticket that was about to be refused looked like one that had
   * simply not been typed. Null means nothing is in flight.
   */
  const [checking, setChecking] = React.useState<string | null>(null);
  const code = item.ticket ?? null;

  const save = async (typed: string) => {
    setChecking(typed.trim().toUpperCase());
    try {
      await onSave(typed.trim() || null);
    } finally {
      setChecking(null);
    }
  };
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
    if (!code) return;
    if (!canEdit) {
      void copyToClipboard(code, `${code} copied`);
      return;
    }
    if (pending.current !== null) return;
    pending.current = window.setTimeout(() => {
      pending.current = null;
      void copyToClipboard(code, `${code} copied`);
    }, TICKET_DOUBLE_CLICK_MS);
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
        <span className="text-[10px] font-medium opacity-60">Ticket</span>
        <input
          ref={input}
          autoFocus
          defaultValue={code ?? ""}
          maxLength={TICKET_MAX}
          aria-label="Ticket"
          data-testid="panel-ticket-input"
          className="h-full w-28 rounded-r-lg bg-transparent pr-2 font-mono text-[13px] font-semibold uppercase tabular outline-none"
          onBlur={(e) => {
            setEditing(false);
            const typed = e.currentTarget.value.trim();
            if (typed.toUpperCase() !== (code ?? "")) void save(typed);
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

  // Asked and not yet answered. The code it will be if the workspace agrees,
  // so the wait is spent looking at the answer rather than at the question.
  if (checking !== null) {
    return (
      <span
        className="inline-flex h-6 items-center gap-1.5 rounded-md bg-surface-strong/60 px-1.5 text-[13px] font-medium text-muted-foreground"
        aria-live="polite"
        data-testid="panel-ticket-checking"
      >
        <LoaderCircle className="size-3 animate-spin" />
        {checking ? <span className="font-mono font-semibold tabular">{checking}</span> : "Removing…"}
      </span>
    );
  }

  if (!code) {
    if (!canEdit) return null;
    return (
      <button
        type="button"
        disabled={issuing}
        onClick={() => {
          setIssuing(true);
          onAssign();
        }}
        onDoubleClick={edit}
        title="Take the next ticket in the series"
        data-testid="panel-ticket-add"
        className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border/70 px-1.5 text-2xs text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-60"
      >
        {issuing ? <LoaderCircle className="size-3 animate-spin" /> : <Hash className="size-3" />} Add a ticket
      </button>
    );
  }

  return (
    // Just the code. "Ticket CP26_041" said the same thing twice — the word is
    // only worth the space on the button that offers one, where there is no
    // code yet to speak for itself.
    <span className="inline-flex h-6 items-center overflow-hidden rounded-md bg-surface-strong/60" data-testid="panel-ticket-chip">
      <button
        type="button"
        onClick={click}
        onDoubleClick={edit}
        title={canEdit ? "Click to copy, double click to edit" : "Copy this ticket"}
        data-testid="panel-ticket"
        className={cn("h-full px-1.5 font-mono text-xs font-medium text-foreground/80 tabular transition-colors hover:text-foreground", canEdit && "hover:bg-foreground/[0.06]")}
      >
        {code}
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
  // Compact is a summary: the first few lines, and the rest a click away.
  const compact = usePanelSize() === "compact";

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

  // Nothing to read and no way to add it: no section, rather than an invitation that does nothing.
  if (!text && !editing && !canEdit) return null;

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
            compact && "line-clamp-4",
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
  const size = usePanelSize();

  const fields = (
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
  );

  const subitemsSection = item.parentItemId === null && (
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
              <button type="button" onClick={() => openItem(sub.id)} className={cn("min-w-0 flex-1 truncate text-left hover:underline", done && "text-muted-foreground")}>
                {sub.name}
              </button>
              <SubOwners userIds={owners} />
              {statusColumn && (
                <div className={cn("h-7 [&>*]:border-r-0", size === "compact" ? "w-24" : "w-32")}>
                  <CellRenderer item={sub} column={statusColumn} width={size === "compact" ? 96 : 128} value={model.getValue(sub.id, statusColumn.id)} onChange={(value) => void mutations.setValue(sub, statusColumn, value)} readOnly={!canEdit} />
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
  );

  return (
    <div className={cn(size === "compact" ? "space-y-4 p-3" : "space-y-6 p-4")}>
      <DescriptionSection item={item} canEdit={canEdit} />
      {fields}
      <AllocationSection item={item} />
      <LinkedItemsSection item={item} />
      {subitemsSection}
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
function PanelMenu({ item, canEdit, canManage, onShare, shared, popup }: { item: Item; canEdit: boolean; canManage: boolean; onShare: () => void; shared?: boolean; popup?: boolean }) {
  const { model, mutations, openItem } = useBoardContext();
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const hiddenHere = model.columns.filter((c) => c.hiddenInPanel);
  const hiddenOnBoard = model.columns.filter((c) => c.hidden);
  const anythingHidden = hiddenHere.length > 0 || hiddenOnBoard.length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="More actions for this task" data-testid="panel-menu">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {/* Where the task is being shown, and the other answer. Above the
              rest and open to everyone: it changes nothing about the task, and
              a reader who cannot edit still chooses how to read it. Not on the
              page behind a share link, which is the whole page and has no
              board to sit over. */}
          {!shared && (
            <>
              <DropdownMenuItem onSelect={() => openItem(item.id, popup ? "panel" : "popup")} data-testid="panel-open-mode">
                {popup ? (
                  <>
                    <PanelRight /> Open in side panel
                  </>
                ) : (
                  <>
                    <PictureInPicture2 /> Open in pop-up
                  </>
                )}
              </DropdownMenuItem>
              {(canEdit || anythingHidden) && <DropdownMenuSeparator />}
            </>
          )}
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
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring group-hover/row:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
            data-testid={`panel-column-menu-${column.id}`}
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* What kind of column this is, which the name alone rarely says. */}
          <DropdownMenuLabel className={cn("text-2xs font-normal", isSystemColumnType(column.type) ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
            {COLUMN_TYPE_LABELS[column.type]} column
          </DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Plus /> Insert column
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={COLUMN_TYPE_PICKER_WIDTH}>
              <ColumnTypePicker onPick={(type) => void mutations.addColumn(COLUMN_TYPE_LABELS[type], type, { afterColumnId: column.id })} afterColumnId={column.id} />
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
            <Trash2 /> {isSystemColumnType(column.type) ? "Remove from board" : "Remove column"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={isSystemColumnType(column.type) ? `Remove “${column.name}” from the board?` : `Remove “${column.name}”?`}
        description={isSystemColumnType(column.type) ? "Nothing is lost. Add it back any time and its values return." : "The column and everything every task has in it go, on this board and on the panel. This cannot be undone."}
        confirmLabel={isSystemColumnType(column.type) ? "Remove from board" : "Remove column"}
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
  // Compact, a row is a line of a summary: a small label, the value filling the
  // rest, and none of the handles — rearranging columns wants the room the
  // compact panel has given back to the board. Wide, the cell fills its half
  // of the panel rather than holding the default width inside it.
  const size = usePanelSize();
  const compact = size === "compact" && !isMobile;
  const fill = isMobile || size !== "default";
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, disabled: isMobile || compact || !canEdit });

  const value = model.getValue(item.id, column.id);
  const brief = column.type === "RICH_TEXT" || column.type === "BRIEF";
  const body = value?.type === "RICH_TEXT" ? value.text : "";

  // The handle takes 24px off the left, so the label gives that back out of its
  // own padding rather than out of its words: "Requested team" fits either way.
  const label = <span className={cn("truncate text-[13px] text-muted-foreground", isMobile ? "text-2xs" : compact ? "w-24 shrink-0 pr-2 pl-3 text-xs" : "w-28 shrink-0 pr-2 pl-1")}>{column.name}</span>;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("bg-card", isDragging && "relative z-10 rounded-lg opacity-95 shadow-lg")}
      data-testid={`panel-field-${column.id}`}
    >
      <div className={cn("group/row flex", isMobile ? "flex-col gap-0.5 px-3 py-2" : compact ? "h-9 items-center" : "h-10 items-center")}>
        {!isMobile && !compact && (
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
            fileName={`${item.name} - ${column.name}`}
            body={body}
            canEdit={canEdit}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            onSave={(text) => void mutations.setValue(item, column, { type: "RICH_TEXT", text })}
          />
        ) : (
          <CellStretchProvider mode={fill ? "fill" : "none"}>
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
        {!isMobile && !compact && canEdit && <ColumnRowMenu column={column} />}
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

function ItemActivity({ item }: { item: Item }) {
  const activity = useItemActivity(item.id);
  if (activity.isLoading) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
      </div>
    );
  }
  return <ActivityFeed activities={activity.data ?? []} className="divide-y py-2" emptyTitle="No activity recorded for this item yet." />;
}

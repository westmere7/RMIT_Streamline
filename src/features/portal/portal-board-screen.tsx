"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownUp, ClipboardPen, GripVertical, Rows3 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { Button } from "@/components/ui/button";
import { ColorDot } from "@/components/shared/label-pill";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BOARD_VIEWS, PORTAL_GROUPINGS, type BoardViewKind, type ColumnLabel, type PortalBoardPayload, type PortalGrouping } from "@/domain";
import { BoardContextProvider, type BoardContextValue } from "@/features/boards/board-context";
import { buildBoardModel } from "@/features/boards/board-model";
import { BoardToolbar } from "@/features/boards/components/board-toolbar";
import { MobileBoardTools } from "@/features/boards/components/mobile/mobile-board-tools";
import { MobileKanbanView } from "@/features/boards/components/mobile/mobile-kanban-view";
import { MobileTableView } from "@/features/boards/components/mobile/mobile-table-view";
import { useMobileViewPref } from "@/features/boards/components/mobile/mobile-view-prefs";
import { BoardTable } from "@/features/boards/components/table/board-table";
import { CalendarView } from "@/features/boards/components/views/calendar-view";
import { ChartView } from "@/features/boards/components/views/chart-view";
import { GanttView } from "@/features/boards/components/views/gantt-view";
import { KanbanView } from "@/features/boards/components/views/kanban-view";
import { TimelineView } from "@/features/boards/components/views/timeline-view";
import { useViewSettingsFor } from "@/features/boards/components/views/view-settings";
import { WorkloadView } from "@/features/boards/components/views/workload-view";
import { useBoardMutations } from "@/features/boards/hooks/use-board-mutations";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { ItemDetailPanel } from "@/features/items/item-detail-panel";
import { applyPortalGrouping, orderStatusLabels } from "@/features/portal/portal-grouping";
import { ShareGuestProviders } from "@/features/share/share-shell";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

/**
 * A department's requests, as a board.
 *
 * The portal used to draw its own list, its own cards and its own detail panel
 * — three things the application already has, done again, worse. This renders
 * the real ones: the board toolbar with its search, filters, sort and grouping,
 * all seven views, and the item panel a member of staff sees, on a board that
 * exists only for this department (`buildPortalBoard`).
 *
 * The mechanism is the one the public board link uses. `ShareGuestProviders`
 * builds a read-only data layer over the payload, so every component below
 * reads through the ordinary hooks and none of them knows it is in a portal.
 * Read-only is not a matter of hiding buttons: the repositories underneath
 * refuse to write, and `canEdit` is false, so there is nothing to press.
 */
export function PortalBoardScreen({
  token,
  payload,
  bookHref,
  rangePicker,
  defaultView,
  onSearchChange,
  searchingAllYears,
  showItemGroups,
}: {
  token: string;
  payload: PortalBoardPayload;
  /**
   * Whether the boards' own groups are on offer. Off, the portal groups by
   * status and a link asking for "board" is read as status too.
   */
  showItemGroups: boolean;
  /** Where booking happens, or null when the link has been set to reading only. */
  bookHref: string | null;
  /** How far back the board reads, placed on the toolbar before the view. */
  rangePicker?: React.ReactNode;
  /** The view a bare link lands on, chosen by the team. */
  defaultView: BoardViewKind;
  /**
   * What the board's search box holds, reported upward.
   *
   * The box belongs to the board toolbar and filters what is already loaded.
   * The page needs the term as well, because a search has to reach every year
   * rather than the one on screen — so it widens the request while this is set.
   */
  onSearchChange?: (term: string) => void;
  /** True while the term above has widened the read to every year. */
  searchingAllYears?: boolean;
}) {
  const searchParams = useSearchParams();
  const asked = searchParams.get("group");
  const fallback: PortalGrouping = showItemGroups ? "board" : "status";
  const grouping = isGrouping(asked) && (asked !== "board" || showItemGroups) ? asked : fallback;
  // The order of the status groups is the visitor's own, kept in this browser
  // for this portal: a preference about reading, not a fact about the work.
  const [statusOrder, setStatusOrder] = React.useState<string[]>(() => readStatusOrder(token));
  const saveStatusOrder = (next: string[]) => {
    setStatusOrder(next);
    writeStatusOrder(token, next);
  };
  // Regrouped before the read-only data layer is built over it, so every
  // component below reads the arrangement through the ordinary hooks and none
  // of them needs to know the visitor chose it.
  const shown = React.useMemo(() => applyPortalGrouping(payload, grouping, statusOrder), [payload, grouping, statusOrder]);
  const statusLabels = React.useMemo(() => {
    const column = payload.columns.find((c) => c.type === "STATUS");
    return column && column.settings.kind === "status" ? orderStatusLabels(column.settings.labels, statusOrder) : [];
  }, [payload, statusOrder]);

  return (
    <ShareGuestProviders payload={shown} path={`/portal/${encodeURIComponent(token)}`}>
      <PortalBoard payload={shown} bookHref={bookHref} rangePicker={rangePicker} statusOrder={grouping === "status" && statusLabels.length > 1 ? { labels: statusLabels, onApply: saveStatusOrder } : null} defaultView={defaultView} grouping={grouping} groupings={showItemGroups ? PORTAL_GROUPINGS : PORTAL_GROUPINGS.filter((g) => g !== "board")} onSearchChange={onSearchChange} searchingAllYears={searchingAllYears} />
    </ShareGuestProviders>
  );
}

function isViewKind(value: string | null): value is BoardViewKind {
  return !!value && (BOARD_VIEWS as readonly string[]).includes(value);
}

function isGrouping(value: string | null): value is PortalGrouping {
  return !!value && (PORTAL_GROUPINGS as readonly string[]).includes(value);
}

function PortalBoard({
  payload,
  bookHref,
  rangePicker,
  statusOrder,
  defaultView,
  grouping,
  groupings,
  onSearchChange,
  searchingAllYears,
}: {
  payload: PortalBoardPayload;
  bookHref: string | null;
  rangePicker?: React.ReactNode;
  /** The status groups in their current order and where a new order goes; null when not grouped by status. */
  statusOrder: { labels: ColumnLabel[]; onApply: (names: string[]) => void } | null;
  defaultView: BoardViewKind;
  grouping: PortalGrouping;
  /** The groupings on offer. */
  groupings: readonly PortalGrouping[];
  onSearchChange?: (term: string) => void;
  searchingAllYears?: boolean;
}) {
  const board = payload.board;
  const router = useRouter();
  const searchParams = useSearchParams();
  const snapshot = useBoardSnapshot(board.id);
  const mutations = useBoardMutations(board.id);
  const [now] = React.useState(() => new Date());
  const [tableSettings, updateTableSettings] = useViewSettingsFor(board.id, "table", { showReference: true });
  const isMobile = useIsMobile();
  const [tableMode, setTableMode] = useMobileViewPref<"cards" | "grid">(`table-mode:${board.id}`, "cards");

  // The URL wins, so a link somebody was sent still opens where it says; the
  // department's own default is what a bare link lands on.
  const view: BoardViewKind = isViewKind(searchParams.get("view")) ? (searchParams.get("view") as BoardViewKind) : defaultView;
  // `task` rather than `item`: the portal has always deep-linked a request that
  // way, and links people were sent must keep working.
  const openTaskId = searchParams.get("task");

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "" || (key === "view" && value === defaultView) || (key === "group" && value === "board")) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router, defaultView],
  );
  const openItem = React.useCallback((id: string | null) => replaceParams({ task: id }), [replaceParams]);

  const setOpenItemId = useBoardUiStore((s) => s.setOpenItemId);
  React.useEffect(() => {
    setOpenItemId(openTaskId);
    return () => setOpenItemId(null);
  }, [openTaskId, setOpenItemId]);

  const ui = useBoardUi(board.id);
  // The board's own box filters what is loaded; the page needs the term too, so
  // it can widen the read past the year on screen while somebody is searching.
  React.useEffect(() => {
    onSearchChange?.(ui.search);
  }, [ui.search, onSearchChange]);
  const model = React.useMemo(
    () =>
      snapshot.data
        ? buildBoardModel(snapshot.data, {
            search: ui.search,
            filters: ui.filters,
            sort: ui.sort,
            now,
            userName: (id) => payload.users.find((u) => u.id === id)?.displayName,
          })
        : null,
    [snapshot.data, ui.search, ui.filters, ui.sort, now, payload.users],
  );

  const contextValue = React.useMemo<BoardContextValue | null>(
    () =>
      model
        ? {
            board,
            model,
            mutations,
            users: payload.users,
            canEdit: false,
            canManage: false,
            openItem,
            openItemUpdates: openItem,
            openEditLabels: () => undefined,
            now,
            showReference: tableSettings.showReference,
            setShowReference: (showReference) => updateTableSettings({ showReference }),
            updates: new Map(),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateTableSettings is stable per board
    [board, model, mutations, payload.users, openItem, now, tableSettings.showReference],
  );

  if (!contextValue) return <FullPageLoader label="Opening your requests…" />;

  return (
    <BoardContextProvider value={contextValue}>
      {isMobile ? (
        <>
          <div className="shrink-0 border-b border-border/70 px-3 py-2">
            <MobileBoardTools
              view={view}
              onViewChange={(next) => replaceParams({ view: next })}
              actions={
                <>
                  {rangePicker}
                  <AllYearsMark on={searchingAllYears} />
                  <GroupByControl grouping={grouping} groupings={groupings} onChange={(next) => replaceParams({ group: next })} />
                  {statusOrder && <StatusOrderControl labels={statusOrder.labels} onApply={statusOrder.onApply} />}
                  {bookHref && <BookButton href={bookHref} />}
                </>
              }
            />
          </div>
          {view === "table" ? (
            <MobileTableView mode={tableMode} onModeChange={setTableMode} />
          ) : view === "kanban" ? (
            <MobileKanbanView />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <OtherView view={view} />
            </div>
          )}
          {openTaskId && <ItemDetailPanel itemId={openTaskId} onClose={() => openItem(null)} />}
        </>
      ) : (
        <>
          <BoardToolbar
            view={view}
            onViewChange={(next) => replaceParams({ view: next })}
            searchAlways
            leading={
              bookHref || rangePicker ? (
                <>
                  {bookHref && <BookButton href={bookHref} />}
                  {rangePicker}
                </>
              ) : undefined
            }
            actions={
              <>
                <AllYearsMark on={searchingAllYears} />
                <GroupByControl grouping={grouping} groupings={groupings} onChange={(next) => replaceParams({ group: next })} />
                {statusOrder && <StatusOrderControl labels={statusOrder.labels} onApply={statusOrder.onApply} />}
              </>
            }
          />
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {view === "table" && <BoardTable />}
              {view === "kanban" && <KanbanView />}
              <OtherView view={view} />
            </div>
            {openTaskId && <ItemDetailPanel itemId={openTaskId} onClose={() => openItem(null)} overlay={view === "kanban"} />}
          </div>
        </>
      )}
    </BoardContextProvider>
  );
}

/**
 * How the board is divided, as a view setting rather than something the team
 * decides for everyone.
 *
 * "Board" answers who has the work; "Status" answers where it is up to, which
 * is the question most visitors arrive with. The choice is in the URL beside
 * the view, so a link a stakeholder forwards opens the same way it looked.
 */
const GROUPING_LABELS: Record<PortalGrouping, string> = { board: "Board", status: "Status", stakeholder: "Stakeholder" };

/**
 * Says that the search has left the year behind.
 *
 * The year selector is still showing a year while this is up, and without a
 * word here the extra results would look like a fault in it.
 */
function AllYearsMark({ on }: { on?: boolean }) {
  if (!on) return null;
  return (
    <span className="shrink-0 rounded-full bg-surface-strong/70 px-2 py-1 text-2xs font-medium text-muted-foreground" data-testid="portal-all-years">
      Searching every year
    </span>
  );
}

function GroupByControl({ grouping, groupings, onChange }: { grouping: PortalGrouping; groupings: readonly PortalGrouping[]; onChange: (next: PortalGrouping) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-2xs" data-testid="portal-group-by">
          <Rows3 className="size-3.5" aria-hidden />
          Group: {GROUPING_LABELS[grouping]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={grouping} onValueChange={(value) => onChange(value as PortalGrouping)}>
          {groupings.map((option) => (
            <DropdownMenuRadioItem key={option} value={option} data-testid={`portal-group-by-${option}`}>
              {GROUPING_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Where this browser keeps the visitor's order of the status groups, per portal. */
const statusOrderKey = (token: string) => `streamline.portal-status-order:${token}`;

function readStatusOrder(token: string): string[] {
  try {
    const raw = window.localStorage.getItem(statusOrderKey(token));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeStatusOrder(token: string, order: string[]): void {
  try {
    if (order.length === 0) window.localStorage.removeItem(statusOrderKey(token));
    else window.localStorage.setItem(statusOrderKey(token), JSON.stringify(order));
  } catch {
    // Storage blocked: the order holds for this page and no longer.
  }
}

/**
 * The order of the status groups, for the visitor to change.
 *
 * A small list to drag, and nothing moves on the board until Apply: reordering
 * live would have the groups jumping under the list while it is being used.
 * Discard puts the list back as the board has it.
 */
function StatusOrderControl({ labels, onApply }: { labels: ColumnLabel[]; onApply: (names: string[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ColumnLabel[]>(labels);
  // Opened fresh each time, from the order the board is showing.
  const [seen, setSeen] = React.useState(labels);
  if (seen !== labels) {
    setSeen(labels);
    setDraft(labels);
  }
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = draft.findIndex((l) => l.id === active.id);
    const to = draft.findIndex((l) => l.id === over.id);
    if (from >= 0 && to >= 0) setDraft(arrayMove(draft, from, to));
  };
  const dirty = draft.some((l, i) => l.id !== labels[i]?.id);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft(labels);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-2xs" data-testid="portal-status-order">
          <ArrowDownUp className="size-3.5" aria-hidden />
          Order
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2" data-testid="portal-status-order-menu">
        <p className="px-1 pb-1.5 text-2xs font-medium text-muted-foreground">Drag the statuses into the order you read them in.</p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
          <SortableContext items={draft.map((l) => l.id)} strategy={verticalListSortingStrategy}>
            <ul className="grid gap-1">
              {draft.map((label) => (
                <StatusOrderRow key={label.id} label={label} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-border/60 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(labels);
              setOpen(false);
            }}
            data-testid="portal-status-order-discard"
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={!dirty}
            onClick={() => {
              onApply(draft.map((l) => l.name));
              setOpen(false);
            }}
            data-testid="portal-status-order-apply"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusOrderRow({ label }: { label: ColumnLabel }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: label.id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("flex items-center gap-2 rounded-lg border border-border/60 bg-card px-2 py-1.5 text-[13px]", isDragging && "z-10 shadow-md")} data-testid={`portal-status-order-${label.id}`}>
      <button type="button" aria-label={`Move ${label.name}`} className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:text-foreground active:cursor-grabbing" {...attributes} {...listeners}>
        <GripVertical className="size-3.5" />
      </button>
      <ColorDot color={label.color} />
      <span className="min-w-0 flex-1 truncate">{label.name}</span>
    </li>
  );
}

/**
 * What a stakeholder came here to do, first on the row they are already
 * looking at.
 *
 * At the head of the toolbar rather than the far end of it: everything else on
 * this row — views, search, grouping — is for reading the requests they have
 * already made, and the one thing a visitor came here to do was sitting last
 * in the line, the same size as a filter. It leads, and it is the only button
 * on the page wearing the brand red.
 */
function BookButton({ href }: { href: string }) {
  return (
    // A new tab: the form is a page of its own, and the board stays where it was.
    <Button asChild className="shrink-0 gap-2 px-4 text-[13px] font-semibold shadow-sm shadow-primary/25">
      <a href={href} target="_blank" rel="noreferrer noopener" data-testid="portal-book-button">
        <ClipboardPen className="size-4" /> Book a task
      </a>
    </Button>
  );
}

/** The five views that need no special treatment on either width. */
function OtherView({ view }: { view: BoardViewKind }) {
  return (
    <>
      {view === "timeline" && <TimelineView />}
      {view === "calendar" && <CalendarView />}
      {view === "gantt" && <GanttView />}
      {view === "workload" && <WorkloadView />}
      {view === "chart" && <ChartView />}
    </>
  );
}

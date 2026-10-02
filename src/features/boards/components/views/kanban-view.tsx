"use client";

import { closestCenter, closestCorners, DndContext, DragOverlay, PointerSensor, pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, Boxes, Hourglass, ChevronRight, ChevronsLeftRight, ChevronsRightLeft, Copy, CornerDownRight, GripVertical, Maximize2, PanelRight, PictureInPicture2, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import * as React from "react";
import { InlineEdit } from "@/components/shared/inline-edit";
import { LabelPill } from "@/components/shared/label-pill";
import { PriorityPill } from "@/components/shared/priority-signal";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { ColumnLabel, Item, User } from "@/domain";
import { columnLabels, isStuckLabel, recapAssets } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useBoardUiStore, type ItemOpenMode } from "@/stores/board-ui-store";
import { SizePill } from "@/features/boards/components/pickers/size-picker";
import { formatTag, tagColor, tagOptionsFor } from "@/features/boards/tag-palette";
import { useBoardAssets } from "@/features/items/asset-hooks";
import { CardCover } from "@/features/items/item-cover";
import { BlockedDot } from "@/features/boards/components/blocked-dot";
import { UpdatesBadge } from "@/features/items/updates-badge";
import { useTaskMenuExtras } from "@/features/items/use-task-menu-extras";
import { renderContext } from "@/components/layout/row-menu";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { formatDateRange, formatShortDate, isOverdue, isToday, todayISO } from "@/lib/dates/dates";
import { richTextToPlain } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { useMovingItems } from "@/features/booking/use-allocation";
import { NONE, useKanbanLanes, useLaneOptions, useLaneReorder, type Lane, type LaneBy } from "./kanban-lanes";
import { daysSince, useStatusSince } from "./use-status-since";
import { useViewSettings } from "./view-settings";
import { Segmented, ViewBar, ViewEmpty, ViewSelect, ViewStat } from "./view-shell";

/**
 * How much of an item a card carries, and so how tall it stands: the name alone
 * for a board you scan, everything including the brief for one you work from.
 */
type CardDetail = "compact" | "standard" | "detailed";

const CARD_DETAIL_OPTIONS: ReadonlyArray<{ value: CardDetail; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
];

/**
 * How wide a lane stands. Wide lanes share out the room the board has; the
 * narrower ones keep their width, so more of them fit across before it scrolls.
 */
type LaneWidth = "wide" | "medium" | "narrow";

const LANE_WIDTH_OPTIONS: ReadonlyArray<{ value: LaneWidth; label: string }> = [
  { value: "wide", label: "Wide" },
  { value: "medium", label: "Medium" },
  { value: "narrow", label: "Narrow" },
];

const LANE_WIDTH_CLASSES: Record<LaneWidth, string> = {
  wide: "w-72 max-w-sm grow",
  medium: "w-60",
  narrow: "w-48",
};

/**
 * How a lane wears its colour once Tint lanes is on: an edge with a faint wash
 * of the colour at the top (the default), a soft wash over the whole lane, or a
 * stronger one with an edge to match.
 */
type TintStyle = "soft" | "strong" | "outline";

const TINT_STYLE_OPTIONS: ReadonlyArray<{ value: TintStyle; label: string }> = [
  { value: "outline", label: "Outline" },
  { value: "soft", label: "Soft" },
  { value: "strong", label: "Strong" },
];

/** Fill and edge for a lane of colour `hex` in each tint style (hex plus alpha). */
function tintStyle(style: TintStyle, hex: string): React.CSSProperties {
  if (style === "strong") return { backgroundColor: `${hex}47`, borderColor: `${hex}80` };
  // An outlined lane keeps a trace of its colour at the top: a faint wash
  // behind the header that eases out over the first cards, with no edge where
  // it stops.
  if (style === "outline") return { borderColor: `${hex}b3`, backgroundImage: `linear-gradient(to bottom, ${hex}1a 0, ${hex}12 1.75rem, ${hex}08 4rem, ${hex}00 7rem)` };
  return { backgroundColor: `${hex}1f` };
}

/** Lanes are sortable among themselves under ids of their own, apart from the lane ids cards drop on. */
const LANE_SORT = "lane-sort:";

const OPEN_IN_OPTIONS: ReadonlyArray<{ value: ItemOpenMode; label: string }> = [
  { value: "popup", label: "Pop-up" },
  { value: "panel", label: "Panel" },
];

/**
 * Where a card opens. A pop-up by default: lanes are wide and a panel beside
 * them covers the ones a card was being compared with.
 */
const OpenInContext = React.createContext<ItemOpenMode>("popup");

/**
 * Swimlanes: the lanes split again into rows, by person, priority, group or a
 * dropdown. A card sits in one cell, and a drop writes both its lane's value
 * and its row's.
 */
type RowsBy = "none" | LaneBy;

/** What the rows are, so a card leaves out what its row already says. */
const RowsByContext = React.createContext<RowsBy>("none");

/**
 * How long each card has sat in its status, for the age chip. A task whose
 * status never changed has been where it is since it was made. Chips start at
 * AGE_FROM days, turn amber at AGE_WARN and red at AGE_ALARM: aging work is
 * the stall the Stuck label misses.
 */
const AgeContext = React.createContext<{ since: Map<string, string>; now: number } | null>(null);
const AGE_FROM = 3;
const AGE_WARN = 7;
const AGE_ALARM = 14;

/** A cell's id in swimlanes: the row and the lane it is the meeting of. */
const cellKey = (rowId: string, laneId: string) => `${rowId}~${laneId}`;

/** Lanes in swimlanes keep one width, so a lane's cells line up row under row. */
const SWIM_WIDTH_CLASSES: Record<LaneWidth, string> = {
  wide: "w-72",
  medium: "w-60",
  narrow: "w-48",
};

interface KanbanSettings extends Record<string, unknown> {
  laneBy: LaneBy;
  /** What splits the lanes into rows, or "none" for plain lanes. */
  rowsBy: RowsBy;
  /** Rows folded to their header. */
  collapsedRows: string[];
  /**
   * Wash each lane in its own colour. On unless turned off; a new key, since the
   * old `tint` was saved as false for everyone who ever changed the view.
   */
  tintLanes: boolean;
  /** How a tinted lane wears its colour. */
  tintStyle: TintStyle;
  /** Lanes folded to a strip. */
  collapsed: string[];
  /** How much each card shows, and how tall it is. */
  detail: CardDetail;
  /** How wide each lane, and so each card, is. */
  width: LaneWidth;
  /** Where clicking a card opens it. */
  openIn: ItemOpenMode;
  /** Show how long a card has been in its status, once that is a few days. */
  showAge: boolean;
}

/**
 * Cards in lanes. Lanes are the board's statuses by default, and can be its
 * priorities, its people or its groups instead; dragging a card into a lane
 * writes that value. While a card is dragged the other cards make way and a
 * ghost of it sits where it will land; when the lanes are groups, that order is
 * kept. Each card carries what a glance needs and opens on click.
 */
export function KanbanView() {
  const { model, mutations, canEdit } = useBoardContext();
  const options = useLaneOptions();
  const [settings, updateSettings] = useViewSettings<KanbanSettings>("kanban", { laneBy: options[0]?.value ?? "group", rowsBy: "none", collapsedRows: [], tintLanes: true, tintStyle: "outline", collapsed: [], detail: "standard", width: "wide", openIn: "popup", showAge: true });
  const detail: CardDetail = CARD_DETAIL_OPTIONS.some((o) => o.value === settings.detail) ? settings.detail : "standard";
  const width: LaneWidth = LANE_WIDTH_OPTIONS.some((o) => o.value === settings.width) ? settings.width : "wide";
  const tint: TintStyle = TINT_STYLE_OPTIONS.some((o) => o.value === settings.tintStyle) ? settings.tintStyle : "outline";
  const openIn: ItemOpenMode = OPEN_IN_OPTIONS.some((o) => o.value === settings.openIn) ? settings.openIn : "popup";
  const laneBy: LaneBy = options.some((o) => o.value === settings.laneBy) ? settings.laneBy : (options[0]?.value ?? "group");
  const collapsed = React.useMemo(() => new Set(settings.collapsed), [settings.collapsed]);
  const collapsedRows = React.useMemo(() => new Set(settings.collapsedRows), [settings.collapsedRows]);
  const rowOptions = React.useMemo<Array<{ value: RowsBy; label: string }>>(() => [{ value: "none", label: "None" }, ...options.filter((o) => o.value !== laneBy)], [options, laneBy]);
  const rowsBy: RowsBy = rowOptions.some((o) => o.value === settings.rowsBy) ? settings.rowsBy : "none";
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));


  const visibleItems = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);

  const lanes = useKanbanLanes(laneBy);
  const showAge = settings.showAge !== false && !!model.statusColumn;
  const since = useStatusSince(showAge);
  // One clock for every card, moved on each hour so a board left open still counts the days.
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 3_600_000);
    return () => window.clearInterval(timer);
  }, []);
  const age = React.useMemo(() => (showAge ? { since, now } : null), [showAge, since, now]);
  const rowLanes = useKanbanLanes(rowsBy === "none" ? laneBy : rowsBy);
  const rows = rowsBy === "none" ? null : rowLanes;
  // Lanes are put in order by dragging their header, where that order is the
  // board's (statuses, dropdown choices, groups); "No status" stays last.
  const reorder = useLaneReorder(laneBy);
  const sortableLaneIds = React.useMemo(() => (canEdit && reorder ? lanes.filter((l) => l.id !== NONE).map((l) => LANE_SORT + l.id) : []), [lanes, canEdit, reorder]);
  const [laneDragId, setLaneDragId] = React.useState<string | null>(null);

  // Which card sits where. During a drag this is a working copy that the pointer
  // rearranges, so the other cards make way for the ghost of the one in hand.
  /**
   * What the card in hand is over. Corner distance alone cannot land a card in an
   * empty lane: with no card of its own to be near, a card in the lane alongside
   * is always closer. So the pointer decides first — the lane it is inside wins,
   * and a card under it wins over the lane behind — and corners only settle it
   * when the pointer has left the lanes altogether.
   *
   * A lane in hand only looks at the other lanes, and a card only at lanes and
   * cards, so the two kinds of drag never land on each other.
   */
  /**
   * Where cards can land, and which cards each holds. Plain lanes are cells of
   * their own; in swimlanes each row crossed with each lane is one. A card goes
   * in the first row that claims it, so a task with two owners shows once.
   */
  const cells = React.useMemo(() => {
    const meta: Record<string, { lane: Lane; row: Lane | null }> = {};
    const ids: Record<string, string[]> = {};
    if (!rows) {
      for (const lane of lanes) {
        meta[lane.id] = { lane, row: null };
        ids[lane.id] = lane.items.map((i) => i.id);
      }
      return { meta, ids };
    }
    const rowOf = new Map<string, string>();
    for (const row of rows) for (const item of row.items) if (!rowOf.has(item.id)) rowOf.set(item.id, row.id);
    for (const row of rows) {
      for (const lane of lanes) {
        const id = cellKey(row.id, lane.id);
        meta[id] = { lane, row };
        ids[id] = lane.items.filter((i) => rowOf.get(i.id) === row.id).map((i) => i.id);
      }
    }
    return { meta, ids };
  }, [lanes, rows]);
  const laneItemIds = cells.ids;
  const laneIds = React.useMemo(() => new Set(Object.keys(laneItemIds)), [laneItemIds]);
  const collisionDetection = React.useCallback<CollisionDetection>(
    (args) => {
      const laneDrag = String(args.active.id).startsWith(LANE_SORT);
      const scoped = { ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(LANE_SORT) === laneDrag) };
      if (laneDrag) return closestCenter(scoped);
      const under = pointerWithin(scoped);
      if (under.length > 0) return [under.find((c) => !laneIds.has(String(c.id))) ?? under[0]!];
      return closestCorners(scoped);
    },
    [laneIds],
  );

  const [drag, setDrag] = React.useState<{ activeId: string; lanes: Record<string, string[]> } | null>(null);
  /** The last two landing places worked out, and where the card was when the latest one was. */
  const bounced = React.useRef<string[]>([]);
  const at = React.useRef<{ x: number; y: number } | null>(null);
  const shown = drag?.lanes ?? laneItemIds;
  const laneOf = (id: string, map: Record<string, string[]>) => (id in map ? id : Object.keys(map).find((laneId) => map[laneId]!.includes(id)) ?? null);
  const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

  const onDragStart = (event: DragStartEvent) => {
    if (String(event.active.id).startsWith(LANE_SORT)) return setLaneDragId(String(event.active.id));
    bounced.current = [];
    at.current = null;
    setDrag({ activeId: String(event.active.id), lanes: laneItemIds });
  };

  /**
   * Where the card in hand would land, worked out afresh on every move.
   *
   * The arrangement is always derived from the one the drag started with, never
   * from the one on screen. A rearrangement that feeds on its own output has
   * hysteresis: the card moves, which moves what is under the pointer, which
   * moves the card back, and with the pointer held still the two flip back and
   * forth until React gives up on the re-renders and the board goes down. Read
   * from a fixed starting point, the same pointer position always gives the same
   * answer, so there is nothing to flip between.
   *
   * The last two answers are kept as well: if a still pointer would take us back
   * to where we just were, that is the bounce beginning, and it is ignored.
   */
  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || laneDragId) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId === activeId) return;

    const from = laneOf(activeId, laneItemIds);
    const to = laneIds.has(overId) ? overId : laneOf(overId, laneItemIds);
    if (!from || !to) return;

    const translated = active.rect.current.translated;
    const below = !!translated && translated.top > over.rect.top + over.rect.height / 2;
    const target = laneItemIds[to]!.filter((id) => id !== activeId);
    const index = laneIds.has(overId) ? target.length : Math.max(0, target.indexOf(overId) + (below ? 1 : 0));
    const signature = `${to}#${index}`;

    // A pointer that has not moved cannot mean two different things: if this is
    // the answer from before last, the two are bouncing off each other.
    const point = translated ? { x: Math.round(translated.left), y: Math.round(translated.top) } : null;
    const still = !!point && !!at.current && Math.abs(point.x - at.current.x) <= 2 && Math.abs(point.y - at.current.y) <= 2;
    if (still && bounced.current[0] === signature) return;
    if (point) at.current = point;
    if (bounced.current[bounced.current.length - 1] !== signature) bounced.current = [...bounced.current.slice(-1), signature];

    target.splice(index, 0, activeId);
    const next: Record<string, string[]> = { ...laneItemIds, [to]: target };
    if (from !== to) next[from] = laneItemIds[from]!.filter((id) => id !== activeId);

    setDrag((current) => {
      if (!current) return current;
      // Same arrangement: hand back the very same object, or dnd-kit measures
      // again, fires another drag-over, and the loop starts on its own.
      if (Object.keys(next).every((laneId) => sameOrder(next[laneId]!, current.lanes[laneId] ?? []))) return current;
      return { activeId, lanes: next };
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (laneDragId) {
      setLaneDragId(null);
      const from = sortableLaneIds.indexOf(laneDragId);
      const to = event.over ? sortableLaneIds.indexOf(String(event.over.id)) : -1;
      if (reorder && from >= 0 && to >= 0 && from !== to) reorder(arrayMove(sortableLaneIds, from, to).map((id) => id.slice(LANE_SORT.length)));
      return;
    }
    const working = drag;
    setDrag(null);
    if (!working) return;
    const activeId = String(event.active.id);
    const item = model.itemById.get(activeId);
    if (!item) return;
    const source = laneOf(activeId, laneItemIds);
    const target = laneOf(activeId, working.lanes);
    if (!source || !target) return;
    const to = cells.meta[target];
    const from = cells.meta[source];
    if (!to || !from) return;
    if (!rows && laneBy === "group") {
      // Lanes are groups, so the ghost's position is a real position: keep it.
      const unchanged = target === source && working.lanes[target]!.join() === laneItemIds[source]!.join();
      if (unchanged) return;
      void mutations.moveItem({ itemId: item.id, toGroupId: target, orderedIdsInTargetGroup: working.lanes[target]!, orderedIdsInSourceGroup: target === source ? working.lanes[target]! : working.lanes[source]! });
      return;
    }
    if (to.lane.id !== from.lane.id) to.lane.apply(item);
    if (to.row && to.row.id !== from.row?.id) to.row.apply(item);
  };

  if (options.length === 0) return <ViewEmpty title="Kanban needs something to lane by" description="Add a Status, Priority or People column, or a group, to use the Kanban view." />;

  const activeItem = drag ? model.itemById.get(drag.activeId) : null;
  const today = todayISO();
  const overdue = visibleItems.filter((i) => !model.isDone(i.id) && isOverdue(model.dueDateOf(i.id))).length;
  const done = visibleItems.filter((i) => model.isDone(i.id)).length;
  // The lane the card in hand would land in, outlined so the drop is never a guess.
  const targetLane = drag ? laneOf(drag.activeId, drag.lanes) : null;
  const toggleRow = (id: string) => updateSettings({ collapsedRows: collapsedRows.has(id) ? settings.collapsedRows.filter((c) => c !== id) : [...settings.collapsedRows, id] });
  const laneOverdue = (lane: Lane) => lane.items.filter((i) => !model.isDone(i.id) && isOverdue(model.dueDateOf(i.id), new Date(today))).length;
  const gap = width === "narrow" ? "gap-2" : "gap-3";
  const toggleLane = (id: string) => updateSettings({ collapsed: collapsed.has(id) ? settings.collapsed.filter((c) => c !== id) : [...settings.collapsed, id] });

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="kanban">
      <ViewBar
        stats={
          <>
            <ViewStat value={visibleItems.length} label="items" />
            {done > 0 && <ViewStat value={done} label="done" tone="good" />}
            {overdue > 0 && <ViewStat value={overdue} label="overdue" tone="warn" testId="kanban-overdue" />}
          </>
        }
      >
        <span className="text-xs text-muted-foreground">Lanes by</span>
        <Segmented value={laneBy} onChange={(next) => updateSettings({ laneBy: next })} options={options} ariaLabel="Lanes by" testId="kanban-lanes" />
        <span className="text-xs text-muted-foreground">Rows</span>
        <ViewSelect value={rowsBy} onChange={(next) => updateSettings({ rowsBy: next })} options={rowOptions} ariaLabel="Rows" testId="kanban-rows" />
        {/* What the lanes are stays in the bar; how they look sits behind one button. */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground max-md:h-11" data-testid="kanban-display">
              <SlidersHorizontal className="size-3.5" /> Display
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3">
            <DisplayRow label="Cards">
              <Segmented value={detail} onChange={(next) => updateSettings({ detail: next })} options={CARD_DETAIL_OPTIONS} ariaLabel="How much each card shows" testId="kanban-detail" className="flex w-full [&>button]:flex-1 [&>button]:justify-center" />
            </DisplayRow>
            <DisplayRow label="Width">
              <Segmented value={width} onChange={(next) => updateSettings({ width: next })} options={LANE_WIDTH_OPTIONS} ariaLabel="Lane width" testId="kanban-width" className="flex w-full [&>button]:flex-1 [&>button]:justify-center" />
            </DisplayRow>
            <DisplayRow label="Open cards in">
              <Segmented value={openIn} onChange={(next) => updateSettings({ openIn: next })} options={OPEN_IN_OPTIONS} ariaLabel="Open cards in" testId="kanban-open-in" className="flex w-full [&>button]:flex-1 [&>button]:justify-center" />
            </DisplayRow>
            {model.statusColumn && (
              <label className="flex items-center justify-between gap-2 border-t border-border/60 pt-3 text-[13px]">
                Days in status
                <Switch size="sm" checked={settings.showAge !== false} onCheckedChange={(on) => updateSettings({ showAge: on })} data-testid="kanban-age" />
              </label>
            )}
            <div className="space-y-2 border-t border-border/60 pt-3">
              <label className="flex items-center justify-between gap-2 text-[13px]">
                Tint lanes
                <Switch size="sm" checked={settings.tintLanes} onCheckedChange={(on) => updateSettings({ tintLanes: on })} data-testid="kanban-tint" />
              </label>
              {settings.tintLanes && <Segmented value={tint} onChange={(next) => updateSettings({ tintStyle: next })} options={TINT_STYLE_OPTIONS} ariaLabel="Tint style" testId="kanban-tint-style" className="flex w-full [&>button]:flex-1 [&>button]:justify-center" />}
            </div>
          </PopoverContent>
        </Popover>
      </ViewBar>
      <div className={cn("scrollbar-thin flex min-h-0 flex-1 p-5", rows ? "overflow-auto" : "overflow-x-auto", gap)} data-testid="kanban-lanes-scroller">
        <OpenInContext.Provider value={openIn}>
        <RowsByContext.Provider value={rowsBy}>
        <AgeContext.Provider value={age}>
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => {
            setDrag(null);
            setLaneDragId(null);
          }}>
          <SortableContext items={sortableLaneIds} strategy={horizontalListSortingStrategy}>
          {rows ? (
            <div className="flex min-w-max flex-col gap-4" data-testid="kanban-swimlanes">
              {/* The lanes' names along the top, staying put while the rows scroll under them. */}
              <div className={cn("sticky -top-5 z-20 -mt-5 flex bg-background pt-5 pb-1", gap)}>
                {lanes.map((lane) => (
                  <LaneHead key={lane.id} lane={lane} width={width} canEdit={canEdit} tint={settings.tintLanes ? tint : null} sortable={sortableLaneIds.includes(LANE_SORT + lane.id)} collapsed={collapsed.has(lane.id)} overdue={laneOverdue(lane)} onToggle={() => toggleLane(lane.id)} />
                ))}
              </div>
              {rows.map((row) => {
                const folded = collapsedRows.has(row.id);
                const count = lanes.reduce((n, lane) => n + (shown[cellKey(row.id, lane.id)]?.length ?? 0), 0);
                return (
                  <section key={row.id} aria-label={row.name} data-testid={`swimlane-${row.name}`} className="flex flex-col gap-2">
                    <RowHeader row={row} count={count} folded={folded} onToggle={() => toggleRow(row.id)} />
                    {!folded && (
                      <div className={cn("flex", gap)}>
                        {lanes.map((lane) => {
                          const id = cellKey(row.id, lane.id);
                          return (
                            <SwimCell
                              key={lane.id}
                              id={id}
                              lane={lane}
                              row={row}
                              itemIds={shown[id] ?? []}
                              laneBy={laneBy}
                              detail={detail}
                              width={width}
                              canEdit={canEdit}
                              tint={settings.tintLanes ? tint : null}
                              collapsed={collapsed.has(lane.id)}
                              target={id === targetLane}
                              activeId={drag?.activeId ?? null}
                              onAdd={(name, initial) => void mutations.createItem({ groupId: initial.groupId, name, values: initial.values })}
                            />
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : lanes.map((lane) => (
            <LaneColumn
              key={lane.id}
              lane={lane}
              itemIds={shown[lane.id] ?? []}
              laneBy={laneBy}
              detail={detail}
              width={width}
              canEdit={canEdit}
              tint={settings.tintLanes ? tint : null}
              sortable={sortableLaneIds.includes(LANE_SORT + lane.id)}
              collapsed={collapsed.has(lane.id)}
              target={lane.id === targetLane}
              activeId={drag?.activeId ?? null}
              onToggle={() => toggleLane(lane.id)}
              overdue={laneOverdue(lane)}
              onAdd={(name) => lane.initial && void mutations.createItem({ groupId: lane.initial.groupId, name, values: lane.initial.values })}
            />
          ))}
          </SortableContext>
          {/* No drop animation: dnd-kit would fly the card back to where it was
              picked up, which reads as the drop being refused even though the
              card is already in its new lane. */}
          <DragOverlay dropAnimation={null}>{activeItem ? <Card item={activeItem} laneBy={laneBy} detail={detail} narrow={width === "narrow"} draggable overlay /> : null}</DragOverlay>
        </DndContext>
        </AgeContext.Provider>
        </RowsByContext.Provider>
        </OpenInContext.Provider>
      </div>
    </div>
  );
}

/** One labelled setting in the Display popover. */
function DisplayRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function LaneColumn({ lane, itemIds, laneBy, detail, width, canEdit, tint, sortable, collapsed, target, activeId, onToggle, overdue, onAdd }: { lane: Lane; itemIds: string[]; laneBy: LaneBy; detail: CardDetail; width: LaneWidth; canEdit: boolean; tint: TintStyle | null; sortable: boolean; collapsed: boolean; target: boolean; activeId: string | null; onToggle: () => void; overdue: number; onAdd: (name: string) => void }) {
  const { model } = useBoardContext();
  const { setNodeRef: setDropRef } = useDroppable({ id: lane.id, disabled: !canEdit });
  const [renaming, setRenaming] = React.useState(false);
  // Picked up by its header (or the whole strip when folded); not while its name is being typed.
  const { listeners, setNodeRef: setSortRef, transform, transition, isDragging } = useSortable({ id: LANE_SORT + lane.id, disabled: !sortable || renaming });
  const setNodeRef = (node: HTMLElement | null) => {
    setDropRef(node);
    setSortRef(node);
  };
  const handle = sortable ? listeners : undefined;
  const colors = lane.color ? colorClasses(lane.color) : null;
  // The lane a card would land in takes its own colour for an edge, or the focus ring's when it has none.
  const accent = colors?.hex ?? "var(--ring)";
  const style: React.CSSProperties = {
    ...(tint && colors ? tintStyle(tint, colors.hex) : {}),
    ...(target ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : {}),
    transform: CSS.Translate.toString(transform),
    transition,
  };
  const items = itemIds.map((id) => model.itemById.get(id)).filter((i): i is Item => !!i);
  const narrow = width === "narrow";
  const shell = cn("shrink-0 rounded-xl border border-border/70 bg-surface/80 transition-[border-color,box-shadow] dark:border-white/[0.06] dark:bg-card", isDragging && "relative z-10 shadow-xl");

  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={lane.name} data-testid={`lane-${lane.name}`} data-drop-target={target || undefined} style={style} className={cn(shell, "flex w-10")}>
        <button type="button" onClick={onToggle} {...handle} aria-label={`Expand ${lane.name}`} className="flex w-full flex-col items-center gap-3 rounded-xl py-3 text-muted-foreground hover:text-foreground">
          <ChevronsLeftRight className="size-3.5 shrink-0" />
          <span className="text-[13px] tracking-tight [writing-mode:vertical-rl]">
            <span className={cn("font-semibold text-foreground", (tint || target) && colors?.text)}>{lane.name}</span>
            <span className="tabular"> · {items.length}</span>
          </span>
        </button>
      </section>
    );
  }

  return (
    <section ref={setNodeRef} aria-label={lane.name} data-testid={`lane-${lane.name}`} data-drop-target={target || undefined} style={style} className={cn(shell, "scrollbar-host flex flex-col", LANE_WIDTH_CLASSES[width])}>
      <header {...handle} className={cn("flex items-center gap-1.5 pt-3 pb-2", narrow ? "px-2.5" : "px-3.5", sortable && !renaming && "cursor-grab active:cursor-grabbing")}>
        <LaneTitle lane={lane} count={items.length} overdue={overdue} canEdit={canEdit} coloured={!!tint || target} renaming={renaming} onRenamingChange={setRenaming} onToggle={onToggle} />
      </header>
      {/* Under the name of the lane a card would land in, a bar in the lane's colour. */}
      <span aria-hidden className={cn("mb-2 h-0.5 rounded-full transition-opacity", narrow ? "mx-2.5" : "mx-3.5", target ? "opacity-100" : "opacity-0")} style={{ backgroundColor: accent }} />
      <SortableContext id={lane.id} items={itemIds} strategy={verticalListSortingStrategy}>
        <div className={cn("scrollbar-thin scrollbar-hover flex-1 overflow-y-auto pb-1", narrow ? "space-y-2 px-2" : "space-y-2.5 px-2.5")}>
          {items.map((item) => (
            <SortableCard key={item.id} item={item} laneBy={laneBy} detail={detail} narrow={narrow} disabled={!canEdit} ghost={item.id === activeId} />
          ))}
          {items.length === 0 && <p className="px-2 py-4 text-center text-2xs text-muted-foreground">{activeId ? "Drop here" : "No items"}</p>}
        </div>
      </SortableContext>
      {canEdit && lane.initial && (
        <div className={narrow ? "p-2" : "p-2.5"}>
          <QuickAdd label={lane.name} onAdd={onAdd} />
        </div>
      )}
    </section>
  );
}

/** A lane's name, count and fold button: the top of a lane, or of its column in swimlanes. */
function LaneTitle({ lane, count, overdue, canEdit, coloured, renaming, onRenamingChange, onToggle }: { lane: Lane; count: number; overdue: number; canEdit: boolean; coloured: boolean; renaming: boolean; onRenamingChange: (renaming: boolean) => void; onToggle: () => void }) {
  const colors = lane.color ? colorClasses(lane.color) : null;
  return (
    <>
      {lane.user ? <UserAvatar user={lane.user} size="xs" tooltip={false} /> : <span className={cn("size-2 shrink-0 rounded-full", colors?.dot ?? "bg-gray-300 dark:bg-gray-600")} />}
      {/* Double-click the name to rename what the lane stands for. */}
      <h3 className={cn("min-w-0 text-[13px] font-semibold tracking-tight", coloured && colors?.text)}>
        <InlineEdit
          value={lane.name}
          editing={renaming}
          onEditingChange={onRenamingChange}
          onSubmit={(name) => lane.rename?.(name)}
          trigger="doubleClick"
          disabled={!canEdit || !lane.rename}
          ariaLabel="Lane name"
          className={cn("rounded-md px-1 -mx-1", canEdit && lane.rename && "hover:bg-accent/70")}
          inputClassName="h-6 w-40 text-[13px] font-semibold"
        />
      </h3>
      <span className="shrink-0 text-xs text-muted-foreground tabular">{count}</span>
      {overdue > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-2xs font-medium text-red-700 tabular dark:bg-red-500/15 dark:text-red-300" title={`${overdue} overdue`}>
          {overdue}
        </span>
      )}
      <button type="button" onClick={onToggle} aria-label={`Collapse ${lane.name}`} className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-accent hover:text-foreground">
        <ChevronsRightLeft className="size-3.5" />
      </button>
    </>
  );
}

/** "+ Add item", opening to a name field; Enter adds and stays open for the next. */
function QuickAdd({ label, onAdd, compact }: { label: string; onAdd: (name: string) => void; compact?: boolean }) {
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  if (adding) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) setAdding(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            onAdd(draft.trim());
            setDraft("");
          } else if (e.key === "Escape") {
            setDraft("");
            setAdding(false);
          }
        }}
        placeholder="Item name"
        aria-label={`Add item to ${label}`}
        className={cn("w-full rounded-lg border border-border bg-card px-3 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20", compact ? "h-8" : "h-9")}
      />
    );
  }
  return (
    <button type="button" onClick={() => setAdding(true)} aria-label={compact ? `Add item to ${label}` : undefined} className={cn("flex w-full items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground", compact ? "h-7" : "h-9")}>
      <Plus className="size-3.5" /> Add item
    </button>
  );
}

/** A lane's head in swimlanes: its name and colour above its cells, picked up to reorder. */
function LaneHead({ lane, width, canEdit, tint, sortable, collapsed, overdue, onToggle }: { lane: Lane; width: LaneWidth; canEdit: boolean; tint: TintStyle | null; sortable: boolean; collapsed: boolean; overdue: number; onToggle: () => void }) {
  const [renaming, setRenaming] = React.useState(false);
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: LANE_SORT + lane.id, disabled: !sortable || renaming });
  const colors = lane.color ? colorClasses(lane.color) : null;
  const style: React.CSSProperties = { ...(tint && colors ? tintStyle(tint, colors.hex) : {}), transform: CSS.Translate.toString(transform), transition };
  const shell = cn("shrink-0 rounded-xl border border-border/70 bg-surface/80 dark:border-white/[0.06] dark:bg-card", isDragging && "relative z-10 shadow-xl");
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} className={cn(shell, "flex w-10")} data-testid={`lane-${lane.name}`}>
        <button type="button" onClick={onToggle} {...(sortable ? listeners : {})} aria-label={`Expand ${lane.name}`} title={lane.name} className="flex h-10 w-full items-center justify-center rounded-xl text-muted-foreground hover:text-foreground">
          <ChevronsLeftRight className="size-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div ref={setNodeRef} style={style} className={cn(shell, "flex items-center gap-1.5 px-3 py-2", SWIM_WIDTH_CLASSES[width], sortable && !renaming && "cursor-grab active:cursor-grabbing")} {...(sortable ? listeners : {})} data-testid={`lane-${lane.name}`}>
      <LaneTitle lane={lane} count={lane.items.length} overdue={overdue} canEdit={canEdit} coloured={!!tint} renaming={renaming} onRenamingChange={setRenaming} onToggle={onToggle} />
    </div>
  );
}

/** A row's header in swimlanes: what the row is and how many cards it holds, folding the row away. */
function RowHeader({ row, count, folded, onToggle }: { row: Lane; count: number; folded: boolean; onToggle: () => void }) {
  const colors = row.color ? colorClasses(row.color) : null;
  return (
    <button type="button" onClick={onToggle} aria-expanded={!folded} aria-label={`${folded ? "Expand" : "Collapse"} row ${row.name}`} className="sticky left-0 flex w-fit items-center gap-2 rounded-md px-1.5 py-1 text-[13px] font-semibold tracking-tight hover:bg-accent">
      <ChevronRight className={cn("size-3.5 text-muted-foreground transition-transform", !folded && "rotate-90")} />
      {row.user ? <UserAvatar user={row.user} size="xs" tooltip={false} /> : <span className={cn("size-2 rounded-full", colors?.dot ?? "bg-gray-300 dark:bg-gray-600")} />}
      <span className={cn(colors?.text)}>{row.name}</span>
      <span className="text-xs font-normal text-muted-foreground tabular">{count}</span>
    </button>
  );
}

/** Where a row meets a lane: a drop here writes both. */
function SwimCell({ id, lane, row, itemIds, laneBy, detail, width, canEdit, tint, collapsed, target, activeId, onAdd }: { id: string; lane: Lane; row: Lane; itemIds: string[]; laneBy: LaneBy; detail: CardDetail; width: LaneWidth; canEdit: boolean; tint: TintStyle | null; collapsed: boolean; target: boolean; activeId: string | null; onAdd: (name: string, initial: NonNullable<Lane["initial"]>) => void }) {
  const { model } = useBoardContext();
  const { setNodeRef } = useDroppable({ id, disabled: !canEdit });
  const colors = lane.color ? colorClasses(lane.color) : null;
  const accent = colors?.hex ?? "var(--ring)";
  const items = itemIds.map((i) => model.itemById.get(i)).filter((i): i is Item => !!i);
  const narrow = width === "narrow";
  // A cell takes its lane's colour lightly: an outlined lane's edge without the
  // wash at its top, which belongs to the lane's head.
  const wash = tint && colors ? (tint === "outline" ? { borderColor: `${colors.hex}59` } : tintStyle(tint, colors.hex)) : {};
  const style: React.CSSProperties = { ...wash, ...(target ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : {}) };
  // What a card added here starts with: the lane's value and the row's, in the
  // group whichever of the two is a group says.
  const initial = lane.initial && row.initial ? { groupId: laneBy === "group" ? lane.initial.groupId : row.initial.groupId, values: [...lane.initial.values, ...row.initial.values] } : null;
  const shell = "shrink-0 rounded-xl border border-border/70 bg-surface/80 transition-[border-color,box-shadow] dark:border-white/[0.06] dark:bg-card";
  if (collapsed) {
    return (
      <div ref={setNodeRef} style={style} data-drop-target={target || undefined} className={cn(shell, "flex w-10 justify-center py-2")} title={`${lane.name} · ${row.name}`}>
        <span className="text-2xs text-muted-foreground tabular">{items.length || ""}</span>
      </div>
    );
  }
  return (
    <div ref={setNodeRef} style={style} data-drop-target={target || undefined} data-testid={`cell-${row.name}-${lane.name}`} className={cn(shell, "group/cell flex min-h-20 flex-col", SWIM_WIDTH_CLASSES[width], narrow ? "gap-2 p-2" : "gap-2.5 p-2.5")}>
      <SortableContext id={id} items={itemIds} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableCard key={item.id} item={item} laneBy={laneBy} detail={detail} narrow={narrow} disabled={!canEdit} ghost={item.id === activeId} />
        ))}
      </SortableContext>
      {items.length === 0 && activeId && <p className="py-3 text-center text-2xs text-muted-foreground">Drop here</p>}
      {canEdit && initial && (
        <div className={cn("mt-auto", items.length > 0 && "opacity-0 transition-opacity group-hover/cell:opacity-100 focus-within:opacity-100")}>
          <QuickAdd compact label={`${lane.name}, ${row.name}`} onAdd={(name) => onAdd(name, initial)} />
        </div>
      )}
    </div>
  );
}

/** A card that can be picked up; while it is in hand, this copy stays in the flow as a ghost marking where it will land. */
function SortableCard({ item, laneBy, detail, narrow, disabled, ghost }: { item: Item; laneBy: LaneBy; detail: CardDetail; narrow: boolean; disabled: boolean; ghost: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners} className={cn(!disabled && "cursor-grab active:cursor-grabbing")} data-testid={ghost ? "kanban-ghost" : undefined}>
      {ghost ? (
        // The card in hand leaves an outline of its own size behind, so the lane
        // keeps its shape while the others make way.
        <div className="relative" aria-hidden>
          <div className="invisible">
            <Card item={item} laneBy={laneBy} detail={detail} narrow={narrow} draggable />
          </div>
          <div className="absolute inset-0 rounded-lg border-2 border-dashed border-ring/50 bg-ring/5" />
        </div>
      ) : (
        <Card item={item} laneBy={laneBy} detail={detail} narrow={narrow} draggable={!disabled} />
      )}
    </div>
  );
}

function Card({ item, laneBy, detail, narrow, draggable, overlay }: { item: Item; laneBy: LaneBy; detail: CardDetail; narrow?: boolean; draggable?: boolean; overlay?: boolean }) {
  const { model, board, users: assignable, people: users = assignable, openItem, openItemUpdates, canEdit, updates, mutations } = useBoardContext();
  const setArchiveRequest = useBoardUiStore((s) => s.setArchiveRequest);
  const setRequestedItemTab = useBoardUiStore((s) => s.setRequestedItemTab);
  const openIn = React.useContext(OpenInContext);
  const assets = useBoardAssets(board.id);
  const group = model.groups.find((g) => g.id === item.groupId);
  const statusColumn = model.statusColumn;
  const status = statusColumn ? model.getValue(item.id, statusColumn.id) : undefined;
  const statusLabel: ColumnLabel | null = statusColumn && status?.type === "STATUS" ? columnLabels(statusColumn).find((l) => l.id === status.labelId) ?? null : null;
  const priority = model.priorityColumn ? model.getValue(item.id, model.priorityColumn.id) : undefined;
  const priorityLabel = model.priorityColumn && priority?.type === "PRIORITY" ? columnLabels(model.priorityColumn).find((l) => l.id === priority.labelId) ?? null : null;
  const owners = model.personColumns.flatMap((c) => {
    const v = model.getValue(item.id, c.id);
    return v?.type === "PERSON" ? v.userIds : [];
  });
  const ownerUsers = [...new Set(owners)].map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u);
  const due = model.dueDateOf(item.id);
  const ageContext = React.useContext(AgeContext);
  const ageDays = ageContext && !model.isDone(item.id) ? daysSince(ageContext.since.get(item.id) ?? item.createdAt, ageContext.now) : 0;
  const timeline = model.timelineColumn ? model.getValue(item.id, model.timelineColumn.id) : undefined;
  const span = timeline?.type === "TIMELINE" && (timeline.start || timeline.end) ? formatDateRange(timeline.start, timeline.end) : null;
  const done = model.isDone(item.id);
  const blocked = model.isBlocked(item.id);
  const linked = (model.linksByItem.get(item.id)?.length ?? 0) > 0;
  const subitems = model.subitemsByParent.get(item.id) ?? [];
  const subDone = subitems.filter((s) => model.isDone(s.id)).length;
  const tagColumns = model.columns.filter((c) => c.type === "TAGS" && !c.hidden);
  const tags = tagColumns.flatMap((c) => {
    const v = model.getValue(item.id, c.id);
    const options = tagOptionsFor(c, model.snapshot.values);
    return v?.type === "TAGS" ? v.tags.map((t) => ({ name: t, color: tagColor(options, t) })) : [];
  });
  const sizeColumn = model.columns.find((c) => c.type === "SIZE" && !c.hidden);
  const size = sizeColumn ? model.getValue(item.id, sizeColumn.id) : undefined;
  // What the card shows, links included: a task mirrored on another board has
  // the same deliverables from either side.
  const lines = assets.data?.byItem.get(item.id) ?? [];
  const recap = lines.length ? recapAssets(lines, todayISO()) : null;
  const overdue = !done && isOverdue(due);
  const dueToday = !done && isToday(due);
  const compact = detail === "compact";
  const detailed = detail === "detailed";
  // Leave out what the lane, or in swimlanes the row, already says.
  const rowsBy = React.useContext(RowsByContext);
  const showStatus = laneBy !== "status" && rowsBy !== "status" && statusLabel;
  const showPriority = laneBy !== "priority" && rowsBy !== "priority" && priorityLabel;
  const chips = !compact && (showStatus || showPriority || tags.length > 0 || (size?.type === "SIZE" && size.size));
  // Only the fullest cards carry the brief, and two lines of it at that.
  const brief = detailed && item.description ? richTextToPlain(item.description).trim() : "";
  const shownTags = tags.slice(0, detailed ? 6 : 2);
  const open = () => openItem(item.id, openIn);
  // The board's own updates shortcut opens the panel; on these cards it opens where the card does.
  const openUpdates = () => {
    if (openIn === "panel") return openItemUpdates(item.id);
    setRequestedItemTab({ itemId: item.id, tab: "updates" });
    openItem(item.id, "popup");
  };
  const moving = useMovingItems().has(item.id);
  const extras = useTaskMenuExtras(item, canEdit);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={overlay}>
        <article
          data-testid="kanban-card"
          data-item-name={item.name}
          onClick={overlay ? undefined : open}
          onKeyDown={overlay ? undefined : (e) => e.key === "Enter" && open()}
          className={cn(
            // A card stands off its lane mostly by its fill (a step lighter in
            // the dark themes, where the lane sits on --card and the card on
            // --surface), with only a faint edge: the lane is already a box, and
            // a firm outline on every card inside it reads as clutter.
            "group/card relative cursor-pointer overflow-hidden rounded-lg border border-border/40 bg-card transition-colors hover:border-border hover:bg-accent/60 dark:border-white/[0.04] dark:bg-surface dark:hover:border-white/10 dark:hover:bg-surface-strong",
            moving && "row-moving pointer-events-none",
            compact || narrow ? "px-2.5 py-2" : "p-3",
            overlay && "rotate-1 shadow-xl",
            done && "opacity-70",
          )}
        >
          {/* A hairline of the status colour down the left when the lanes do not already say it. */}
          {laneBy !== "status" && statusLabel && <span aria-hidden className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", colorClasses(statusLabel.color).dot)} />}
          {/* Where to take hold of it; the whole card picks up, this only says so. */}
          {draggable && <GripVertical aria-hidden className={cn("absolute right-1.5 size-3.5 text-muted-foreground/40 transition-colors group-hover/card:text-muted-foreground", compact || narrow ? "top-2" : "top-3")} />}
          {!compact && <CardCover url={item.coverUrl} />}
          {item.ticket && <p className="mb-1 pr-4 font-mono text-2xs tracking-tight text-muted-foreground tabular">{item.ticket}</p>}
          <button type="button" onClick={(e) => { e.stopPropagation(); open(); }} onPointerDown={(e) => e.stopPropagation()} className={cn("block w-full text-left text-[13px] font-semibold leading-snug tracking-tight hover:underline", !item.ticket && "pr-4", done && "text-muted-foreground")} aria-label={`Open ${item.name}`}>
            {item.name}
          </button>
          {brief && <p className="mt-1 line-clamp-2 text-2xs leading-snug text-muted-foreground">{brief}</p>}
          {!compact && group && laneBy !== "group" && rowsBy !== "group" && (
            <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", colorClasses(group.color).dot)} /> {group.name}
            </p>
          )}
          {chips && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {showStatus && <LabelPill label={statusLabel} appearance="soft" size="sm" striped={isStuckLabel(statusColumn, statusLabel.id)} />}
              {showPriority && <PriorityPill label={priorityLabel} />}
              {size?.type === "SIZE" && size.size && <SizePill size={size.size} />}
              {shownTags.map((t) => (
                <span key={t.name} className={cn("rounded-md px-1.5 py-0.5 text-2xs font-medium", colorClasses(t.color ?? tagColorFor(t.name)).soft)}>
                  {formatTag(t.name)}
                </span>
              ))}
              {tags.length > shownTags.length && <span className="text-2xs text-muted-foreground">+{tags.length - shownTags.length}</span>}
            </div>
          )}
          <div className={cn("flex items-center justify-between gap-2", compact ? "mt-1.5" : "mt-2.5")}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
              {ageDays >= AGE_FROM && (
                <span
                  className={cn("inline-flex items-center gap-0.5 rounded-md px-1 py-px font-medium tabular", ageDays >= AGE_ALARM ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300" : ageDays >= AGE_WARN ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-surface-strong text-muted-foreground")}
                  title={`${statusLabel ? `In ${statusLabel.name}` : "In this status"} for ${ageDays} days`}
                  data-testid="card-age"
                >
                  <Hourglass className="size-3" /> {ageDays}d
                </span>
              )}
              {due ? (
                <span className={cn("inline-flex items-center gap-0.5 tabular", overdue && "font-medium text-red-600 dark:text-red-400", dueToday && "font-medium text-foreground")} title={span ?? undefined}>
                  
                  {dueToday ? "Today" : formatShortDate(due)}
                </span>
              ) : (
                span && <span className="tabular">{span}</span>
              )}
              {!compact && detailed && span && due && <span className="tabular">{span}</span>}
              {!compact && subitems.length > 0 && (
                <span className="inline-flex items-center gap-1 tabular" title={`${subDone} of ${subitems.length} subitems done`} data-testid="card-subitems">
                  <CornerDownRight className="size-3" />
                  {subDone}/{subitems.length}
                  <span className="h-1 w-6 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-green-600" style={{ width: `${(subDone / subitems.length) * 100}%` }} />
                  </span>
                </span>
              )}
              {!compact && recap && (
                <span className="inline-flex items-center gap-0.5 tabular" title={`${recap.quantity} assets across ${recap.lines} lines`} data-testid="card-assets">
                  <Boxes className="size-3" /> {recap.quantity}
                </span>
              )}
              {!compact && blocked && <BlockedDot label="Waiting on a dependency" />}
              {!compact && linked && <RefreshCw className="size-3" aria-label="Linked to an item on another board" />}
              <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <UpdatesBadge summary={updates.get(item.id)} size="xs" onClick={openUpdates} />
              </span>
            </div>
            {ownerUsers.length > 0 && <AvatarStack users={ownerUsers} size="xs" max={3} />}
          </div>
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={open}>
          <Maximize2 /> Open
        </ContextMenuItem>
        {/* The other way of opening it, one click away. */}
        {openIn === "popup" ? (
          <ContextMenuItem onSelect={() => openItem(item.id, "panel")}>
            <PanelRight /> Open in panel
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={() => openItem(item.id, "popup")}>
            <PictureInPicture2 /> Open in pop-up
          </ContextMenuItem>
        )}
        {renderContext([...extras.reading, ...extras.columns])}
        {canEdit && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void mutations.duplicateItem(item.id)}>
              <Copy /> Duplicate
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setArchiveRequest([item.id])}>
              <Archive /> Archive
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      {extras.dialogs}
    </ContextMenu>
  );
}

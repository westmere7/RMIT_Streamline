"use client";

import { closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, Boxes, ChevronsLeftRight, CornerDownRight, Maximize2, PaintBucket, Plus, RefreshCw, TriangleAlert } from "lucide-react";
import * as React from "react";
import { LabelPill } from "@/components/shared/label-pill";
import { AvatarStack, UserAvatar } from "@/components/shared/user-avatar";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import type { BoardColumn, ColorToken, ColumnLabel, ColumnValue, Item, User } from "@/domain";
import { columnLabels, isStuckLabel, recapAssets } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { SizePill } from "@/features/boards/components/pickers/size-picker";
import { formatTag, tagColor, tagOptionsFor } from "@/features/boards/tag-palette";
import { useBoardAssets } from "@/features/items/asset-hooks";
import { CardCover } from "@/features/items/item-cover";
import { UpdatesBadge } from "@/features/items/updates-badge";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { formatDateRange, formatShortDate, isOverdue, isToday, todayISO } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { useViewSettings } from "./view-settings";
import { Segmented, ViewBar, ViewEmpty, ViewStat } from "./view-shell";

const NONE = "__none__";

type LaneBy = "status" | "priority" | "person" | "group";

interface Lane {
  id: string;
  name: string;
  color: ColorToken | null;
  user?: User;
  items: Item[];
  /** What dropping a card here writes. */
  apply: (item: Item) => void;
  /** Initial values for a card added in this lane. */
  initial: { groupId: string; values: Array<{ columnId: string; value: ColumnValue }> } | null;
}

interface KanbanSettings extends Record<string, unknown> {
  laneBy: LaneBy;
  /** Wash each lane in its own colour. */
  tint: boolean;
  /** Lanes folded to a strip. */
  collapsed: string[];
}

/**
 * Cards in lanes. Lanes are the board's statuses by default, and can be its
 * priorities, its people or its groups instead; dragging a card into a lane
 * writes that value. While a card is dragged the other cards make way and a
 * ghost of it sits where it will land; when the lanes are groups, that order is
 * kept. Each card carries what a glance needs and opens on click.
 */
export function KanbanView() {
  const { model, mutations, canEdit, users } = useBoardContext();
  const options = React.useMemo(
    () =>
      [
        model.statusColumn && { value: "status" as const, label: "Status" },
        model.priorityColumn && { value: "priority" as const, label: "Priority" },
        model.personColumns[0] && { value: "person" as const, label: "Person" },
        model.groups.length > 0 && { value: "group" as const, label: "Group" },
      ].filter((o): o is { value: LaneBy; label: string } => !!o),
    [model],
  );
  const [settings, updateSettings] = useViewSettings<KanbanSettings>("kanban", { laneBy: options[0]?.value ?? "group", tint: false, collapsed: [] });
  const laneBy: LaneBy = options.some((o) => o.value === settings.laneBy) ? settings.laneBy : (options[0]?.value ?? "group");
  const collapsed = React.useMemo(() => new Set(settings.collapsed), [settings.collapsed]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const visibleItems = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);
  const firstGroup = model.groups[0];
  const personColumn = model.personColumns[0] ?? null;

  const lanes = React.useMemo<Lane[]>(() => {
    const byLabel = (column: BoardColumn, type: "STATUS" | "PRIORITY"): Lane[] => {
      const labels = columnLabels(column);
      const valueOf = (item: Item) => {
        const v = model.getValue(item.id, column.id);
        return v?.type === type ? v.labelId : null;
      };
      const out: Lane[] = labels.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        items: visibleItems.filter((i) => valueOf(i) === label.id),
        apply: (item) => void mutations.setValue(item, column, { type, labelId: label.id } as ColumnValue),
        initial: firstGroup ? { groupId: firstGroup.id, values: [{ columnId: column.id, value: { type, labelId: label.id } as ColumnValue }] } : null,
      }));
      const unset = visibleItems.filter((i) => !labels.some((l) => l.id === valueOf(i)));
      if (unset.length) out.push({ id: NONE, name: type === "STATUS" ? "No status" : "No priority", color: null, items: unset, apply: (item) => void mutations.setValue(item, column, { type, labelId: null } as ColumnValue), initial: firstGroup ? { groupId: firstGroup.id, values: [] } : null });
      return out;
    };
    if (laneBy === "status" && model.statusColumn) return byLabel(model.statusColumn, "STATUS");
    if (laneBy === "priority" && model.priorityColumn) return byLabel(model.priorityColumn, "PRIORITY");
    if (laneBy === "person" && personColumn) {
      const column = personColumn;
      const ownersOf = (item: Item) => {
        const v = model.getValue(item.id, column.id);
        return v?.type === "PERSON" ? v.userIds : [];
      };
      const out: Lane[] = users
        .filter((u) => visibleItems.some((i) => ownersOf(i).includes(u.id)))
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((user) => ({
          id: user.id,
          name: user.displayName,
          color: null,
          user,
          items: visibleItems.filter((i) => ownersOf(i).includes(user.id)),
          apply: (item) => void mutations.setValue(item, column, { type: "PERSON", userIds: [user.id] }),
          initial: firstGroup ? { groupId: firstGroup.id, values: [{ columnId: column.id, value: { type: "PERSON", userIds: [user.id] } }] } : null,
        }));
      const unassigned = visibleItems.filter((i) => ownersOf(i).length === 0);
      out.push({ id: NONE, name: "Unassigned", color: null, items: unassigned, apply: (item) => void mutations.setValue(item, column, { type: "PERSON", userIds: [] }), initial: firstGroup ? { groupId: firstGroup.id, values: [] } : null });
      return out;
    }
    return model.groups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      items: model.itemsByGroup.get(group.id) ?? [],
      apply: (item) => void mutations.moveItemsToGroup([item.id], group.id),
      initial: { groupId: group.id, values: [] },
    }));
  }, [laneBy, model, visibleItems, users, personColumn, firstGroup, mutations]);

  // Which card sits where. During a drag this is a working copy that the pointer
  // rearranges, so the other cards make way for the ghost of the one in hand.
  const laneItemIds = React.useMemo(() => Object.fromEntries(lanes.map((l) => [l.id, l.items.map((i) => i.id)])) as Record<string, string[]>, [lanes]);
  const [drag, setDrag] = React.useState<{ activeId: string; lanes: Record<string, string[]> } | null>(null);
  const shown = drag?.lanes ?? laneItemIds;
  const laneOf = (id: string, map: Record<string, string[]>) => (id in map ? id : Object.keys(map).find((laneId) => map[laneId]!.includes(id)) ?? null);
  const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

  const onDragStart = (event: DragStartEvent) => setDrag({ activeId: String(event.active.id), lanes: laneItemIds });

  /**
   * Rearranges the working copy as the pointer moves. It must return the state
   * object unchanged whenever the arrangement is the same: every state change
   * re-renders, which makes dnd-kit measure again and fire another drag-over, so
   * an update that changes nothing loops until React gives up.
   */
  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const translated = active.rect.current.translated;
    const below = !!translated && translated.top > over.rect.top + over.rect.height / 2;
    setDrag((current) => {
      if (!current) return current;
      const from = laneOf(activeId, current.lanes);
      const to = laneOf(overId, current.lanes);
      if (!from || !to) return current;
      if (from === to) {
        // Over the lane itself rather than a card: nothing to reorder.
        if (overId === to) return current;
        const ids = current.lanes[from]!;
        const oldIndex = ids.indexOf(activeId);
        const newIndex = ids.indexOf(overId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return current;
        return { activeId, lanes: { ...current.lanes, [from]: arrayMove(ids, oldIndex, newIndex) } };
      }
      const fromIds = current.lanes[from]!.filter((id) => id !== activeId);
      const toIds = current.lanes[to]!.filter((id) => id !== activeId);
      const at = overId === to ? toIds.length : Math.max(0, toIds.indexOf(overId) + (below ? 1 : 0));
      toIds.splice(at, 0, activeId);
      if (sameOrder(current.lanes[from]!, fromIds) && sameOrder(current.lanes[to]!, toIds)) return current;
      return { activeId, lanes: { ...current.lanes, [from]: fromIds, [to]: toIds } };
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const working = drag;
    setDrag(null);
    if (!working) return;
    const activeId = String(event.active.id);
    const item = model.itemById.get(activeId);
    if (!item) return;
    const source = laneOf(activeId, laneItemIds);
    const target = laneOf(activeId, working.lanes);
    if (!source || !target) return;
    const lane = lanes.find((l) => l.id === target);
    if (!lane) return;
    if (laneBy === "group") {
      // Lanes are groups, so the ghost's position is a real position: keep it.
      const unchanged = target === source && working.lanes[target]!.join() === laneItemIds[source]!.join();
      if (unchanged) return;
      void mutations.moveItem({ itemId: item.id, toGroupId: target, orderedIdsInTargetGroup: working.lanes[target]!, orderedIdsInSourceGroup: target === source ? working.lanes[target]! : working.lanes[source]! });
      return;
    }
    if (target !== source) lane.apply(item);
  };

  if (options.length === 0) return <ViewEmpty title="Kanban needs something to lane by" description="Add a Status, Priority or People column, or a group, to use the Kanban view." />;

  const activeItem = drag ? model.itemById.get(drag.activeId) : null;
  const today = todayISO();
  const overdue = visibleItems.filter((i) => !model.isDone(i.id) && isOverdue(model.dueDateOf(i.id))).length;
  const done = visibleItems.filter((i) => model.isDone(i.id)).length;
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
        <button
          type="button"
          onClick={() => updateSettings({ tint: !settings.tint })}
          aria-pressed={settings.tint}
          className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-2.5 text-xs font-medium shadow-xs transition-colors", settings.tint ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}
          data-testid="kanban-tint"
        >
          <PaintBucket className="size-3.5" /> Tint lanes
        </button>
      </ViewBar>
      <div className="scrollbar-thin flex min-h-0 flex-1 gap-3 overflow-x-auto p-5" data-testid="kanban-lanes-scroller">
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setDrag(null)}>
          {lanes.map((lane) => (
            <LaneColumn
              key={lane.id}
              lane={lane}
              itemIds={shown[lane.id] ?? []}
              laneBy={laneBy}
              canEdit={canEdit}
              tint={settings.tint}
              collapsed={collapsed.has(lane.id)}
              activeId={drag?.activeId ?? null}
              onToggle={() => toggleLane(lane.id)}
              overdue={lane.items.filter((i) => !model.isDone(i.id) && isOverdue(model.dueDateOf(i.id), new Date(today))).length}
              onAdd={(name) => lane.initial && void mutations.createItem({ groupId: lane.initial.groupId, name, values: lane.initial.values })}
            />
          ))}
          {/* No drop animation: dnd-kit would fly the card back to where it was
              picked up, which reads as the drop being refused even though the
              card is already in its new lane. */}
          <DragOverlay dropAnimation={null}>{activeItem ? <Card item={activeItem} laneBy={laneBy} overlay /> : null}</DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

function LaneColumn({ lane, itemIds, laneBy, canEdit, tint, collapsed, activeId, onToggle, overdue, onAdd }: { lane: Lane; itemIds: string[]; laneBy: LaneBy; canEdit: boolean; tint: boolean; collapsed: boolean; activeId: string | null; onToggle: () => void; overdue: number; onAdd: (name: string) => void }) {
  const { model } = useBoardContext();
  const { setNodeRef, isOver } = useDroppable({ id: lane.id, disabled: !canEdit });
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const colors = lane.color ? colorClasses(lane.color) : null;
  const wash = tint && colors ? { backgroundColor: `${colors.hex}1f` } : undefined;
  const items = itemIds.map((id) => model.itemById.get(id)).filter((i): i is Item => !!i);

  if (collapsed) {
    return (
      <section ref={setNodeRef} aria-label={lane.name} data-testid={`lane-${lane.name}`} style={wash} className={cn("flex w-11 shrink-0 flex-col items-center gap-2 rounded-2xl bg-surface/80 py-3", isOver && "ring-2 ring-ring/40")}>
        <button type="button" onClick={onToggle} aria-label={`Expand ${lane.name}`} className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground">
          <ChevronsLeftRight className="size-3.5" />
        </button>
        <span className={cn("size-2.5 rounded-full", colors?.dot ?? "bg-gray-300 dark:bg-gray-600")} />
        <span className="rounded-full bg-card/70 px-1.5 py-0.5 text-2xs text-muted-foreground tabular">{items.length}</span>
        <span className="mt-1 text-[11px] font-semibold tracking-tight text-muted-foreground [writing-mode:vertical-rl]">{lane.name}</span>
      </section>
    );
  }

  return (
    <section ref={setNodeRef} aria-label={lane.name} data-testid={`lane-${lane.name}`} style={wash} className={cn("flex w-72 max-w-sm shrink-0 grow flex-col rounded-2xl bg-surface/80 transition-shadow", isOver && "ring-2 ring-ring/40")}>
      <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        {lane.user ? <UserAvatar user={lane.user} size="xs" tooltip={false} /> : <span className={cn("size-2.5 rounded-full", colors?.dot ?? "bg-gray-300 dark:bg-gray-600")} />}
        <h3 className={cn("truncate text-[13px] font-semibold tracking-tight", tint && colors?.text)}>{lane.name}</h3>
        {overdue > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-2xs font-medium text-red-700 tabular dark:bg-red-500/15 dark:text-red-300" title={`${overdue} overdue`}>
            <TriangleAlert className="size-2.5" /> {overdue}
          </span>
        )}
        <span className="ml-auto rounded-full bg-card/70 px-2 py-0.5 text-2xs text-muted-foreground tabular">{items.length}</span>
        <button type="button" onClick={onToggle} aria-label={`Collapse ${lane.name}`} className="flex size-6 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-card hover:text-foreground">
          <ChevronsLeftRight className="size-3.5" />
        </button>
      </header>
      <SortableContext id={lane.id} items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-1">
          {items.map((item) => (
            <SortableCard key={item.id} item={item} laneBy={laneBy} disabled={!canEdit} ghost={item.id === activeId} />
          ))}
          {items.length === 0 && <p className="px-2 py-4 text-center text-2xs text-muted-foreground">{activeId ? "Drop here" : "No items"}</p>}
        </div>
      </SortableContext>
      {canEdit && lane.initial && (
        <div className="p-2.5">
          {adding ? (
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
              aria-label={`Add item to ${lane.name}`}
              className="h-9 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="flex h-9 w-full items-center gap-1.5 rounded-xl px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground">
              <Plus className="size-3.5" /> Add item
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A card that can be picked up; while it is in hand, this copy stays in the flow as a ghost marking where it will land. */
function SortableCard({ item, laneBy, disabled, ghost }: { item: Item; laneBy: LaneBy; disabled: boolean; ghost: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners} className={cn(!disabled && "cursor-grab active:cursor-grabbing")} data-testid={ghost ? "kanban-ghost" : undefined}>
      {ghost ? (
        // The card in hand leaves an outline of its own size behind, so the lane
        // keeps its shape while the others make way.
        <div className="relative" aria-hidden>
          <div className="invisible">
            <Card item={item} laneBy={laneBy} />
          </div>
          <div className="absolute inset-0 rounded-xl border-2 border-dashed border-ring/50 bg-ring/5" />
        </div>
      ) : (
        <Card item={item} laneBy={laneBy} />
      )}
    </div>
  );
}

function Card({ item, laneBy, overlay }: { item: Item; laneBy: LaneBy; overlay?: boolean }) {
  const { model, board, users, openItem, openItemUpdates, mutations, canEdit, updates } = useBoardContext();
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
  const lines = assets.data?.filter((a) => a.itemId === item.id) ?? [];
  const recap = lines.length ? recapAssets(lines, todayISO()) : null;
  const overdue = !done && isOverdue(due);
  const dueToday = !done && isToday(due);
  const showStatus = laneBy !== "status" && statusLabel;
  const showPriority = laneBy !== "priority" && priorityLabel;
  const chips = showStatus || showPriority || tags.length > 0 || (size?.type === "SIZE" && size.size);
  const open = () => openItem(item.id);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={overlay}>
        <article
          data-testid="kanban-card"
          data-item-name={item.name}
          onClick={overlay ? undefined : open}
          onKeyDown={overlay ? undefined : (e) => e.key === "Enter" && open()}
          className={cn("relative cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-card p-3 shadow-xs transition-shadow hover:shadow-md", overlay && "rotate-1 shadow-xl", done && "opacity-70")}
        >
          {/* A hairline of the status colour down the left when the lanes do not already say it. */}
          {laneBy !== "status" && statusLabel && <span aria-hidden className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", colorClasses(statusLabel.color).dot)} />}
          <CardCover url={item.coverUrl} />
          <button type="button" onClick={(e) => { e.stopPropagation(); open(); }} onPointerDown={(e) => e.stopPropagation()} className={cn("block w-full text-left text-[13px] font-medium leading-snug hover:underline", done && "line-through")} aria-label={`Open ${item.name}`}>
            {item.name}
          </button>
          {group && laneBy !== "group" && (
            <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", colorClasses(group.color).dot)} /> {group.name}
            </p>
          )}
          {chips && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {showStatus && <LabelPill label={statusLabel} appearance="soft" size="sm" striped={isStuckLabel(statusColumn, statusLabel.id)} />}
              {showPriority && <LabelPill label={priorityLabel} appearance="soft" size="sm" />}
              {size?.type === "SIZE" && size.size && <SizePill size={size.size} />}
              {tags.slice(0, 2).map((t) => (
                <span key={t.name} className={cn("rounded-full px-1.5 py-0.5 text-2xs font-medium", colorClasses(t.color ?? tagColorFor(t.name)).soft)}>
                  {formatTag(t.name)}
                </span>
              ))}
              {tags.length > 2 && <span className="text-2xs text-muted-foreground">+{tags.length - 2}</span>}
            </div>
          )}
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
              {due ? (
                <span className={cn("inline-flex items-center gap-0.5 tabular", overdue && "font-medium text-red-600 dark:text-red-400", dueToday && "font-medium text-foreground")} title={span ?? undefined}>
                  {overdue && <TriangleAlert className="size-3" />}
                  {dueToday ? "Today" : formatShortDate(due)}
                </span>
              ) : (
                span && <span className="tabular">{span}</span>
              )}
              {subitems.length > 0 && (
                <span className="inline-flex items-center gap-1 tabular" title={`${subDone} of ${subitems.length} subitems done`} data-testid="card-subitems">
                  <CornerDownRight className="size-3" />
                  {subDone}/{subitems.length}
                  <span className="h-1 w-6 overflow-hidden rounded-full bg-border">
                    <span className="block h-full rounded-full bg-green-600" style={{ width: `${(subDone / subitems.length) * 100}%` }} />
                  </span>
                </span>
              )}
              {recap && (
                <span className="inline-flex items-center gap-0.5 tabular" title={`${recap.quantity} assets across ${recap.lines} lines`} data-testid="card-assets">
                  <Boxes className="size-3" /> {recap.quantity}
                </span>
              )}
              {blocked && <TriangleAlert className="size-3 text-amber-600 dark:text-amber-400" aria-label="Waiting on a dependency" />}
              {linked && <RefreshCw className="size-3" aria-label="Linked to an item on another board" />}
              <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <UpdatesBadge summary={updates.get(item.id)} size="xs" onClick={() => openItemUpdates(item.id)} />
              </span>
            </div>
            {ownerUsers.length > 0 && <AvatarStack users={ownerUsers} size="xs" max={3} />}
          </div>
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={open}>
          <Maximize2 /> Open
        </ContextMenuItem>
        {canEdit && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void mutations.archiveItems([item.id])}>
              <Archive /> Archive
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

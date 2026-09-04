"use client";

import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Archive, Maximize2, Plus, RefreshCw } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { LabelPill } from "@/components/shared/label-pill";
import { AvatarStack } from "@/components/shared/user-avatar";
import type { ColumnLabel, Item } from "@/domain";
import { columnLabels } from "@/domain";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";

const NO_STATUS = "__none__";

export function KanbanView() {
  const { model, mutations, canEdit } = useBoardContext();
  const column = model.statusColumn;
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!column) {
    return <EmptyState title="Kanban needs a Status column" description="Add a Status column to this board to use the Kanban view." />;
  }

  const labels = columnLabels(column);
  const visibleItems = [...model.itemsByGroup.values()].flat();
  const lanes: Array<{ id: string; label: ColumnLabel | null; items: Item[] }> = [
    ...labels.map((label) => ({
      id: label.id,
      label,
      items: visibleItems.filter((i) => {
        const v = model.getValue(i.id, column.id);
        return v?.type === "STATUS" && v.labelId === label.id;
      }),
    })),
  ];
  const unset = visibleItems.filter((i) => {
    const v = model.getValue(i.id, column.id);
    return !(v?.type === "STATUS" && v.labelId && labels.some((l) => l.id === v.labelId));
  });
  if (unset.length > 0) lanes.push({ id: NO_STATUS, label: null, items: unset });

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const item = model.itemById.get(String(active.id));
    if (!item) return;
    const laneId = String(over.id);
    const labelId = laneId === NO_STATUS ? null : laneId;
    const current = model.getValue(item.id, column.id);
    if (current?.type === "STATUS" && current.labelId === labelId) return;
    void mutations.setValue(item, column, { type: "STATUS", labelId });
  };

  const activeItem = activeId ? model.itemById.get(activeId) : null;

  return (
    <div className="scrollbar-thin flex flex-1 gap-3 overflow-x-auto p-5" data-testid="kanban">
      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        {lanes.map((lane) => (
          <Lane
            key={lane.id}
            id={lane.id}
            label={lane.label}
            items={lane.items}
            canEdit={canEdit}
            onAdd={(name) => {
              const group = model.groups[0];
              if (!group) return;
              void mutations.createItem({ groupId: group.id, name, values: lane.label ? [{ columnId: column.id, value: { type: "STATUS", labelId: lane.label.id } }] : [] });
            }}
          />
        ))}
        <DragOverlay>{activeItem ? <Card item={activeItem} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Lane({ id, label, items, canEdit, onAdd }: { id: string; label: ColumnLabel | null; items: Item[]; canEdit: boolean; onAdd: (name: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !canEdit });
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const colors = label ? colorClasses(label.color) : null;
  return (
    <section
      ref={setNodeRef}
      aria-label={label?.name ?? "No status"}
      data-testid={`lane-${label?.name ?? "none"}`}
      className={cn("flex w-72 max-w-sm shrink-0 grow flex-col rounded-2xl bg-surface/80 transition-shadow", isOver && "ring-2 ring-ring/40")}
    >
      <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
        <span className={cn("size-2.5 rounded-full", colors?.dot ?? "bg-gray-300 dark:bg-gray-600")} />
        <h3 className="text-[13px] font-semibold tracking-tight">{label?.name ?? "No status"}</h3>
        <span className="ml-auto rounded-full bg-card/70 px-2 py-0.5 text-2xs text-muted-foreground tabular">{items.length}</span>
      </header>
      <div className="scrollbar-thin flex-1 space-y-2.5 overflow-y-auto px-2.5 pb-1">
        {items.map((item) => (
          <DraggableCard key={item.id} item={item} disabled={!canEdit} />
        ))}
        {items.length === 0 && <p className="px-2 py-4 text-center text-2xs text-muted-foreground">No items</p>}
      </div>
      {canEdit && (
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
              aria-label={`Add item to ${label?.name ?? "No status"}`}
              className="h-9 w-full rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-9 w-full items-center gap-1.5 rounded-xl px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            >
              <Plus className="size-3.5" /> Add item
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function DraggableCard({ item, disabled }: { item: Item; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && "opacity-40", !disabled && "cursor-grab active:cursor-grabbing")}>
      <Card item={item} />
    </div>
  );
}

function Card({ item, overlay }: { item: Item; overlay?: boolean }) {
  const { model, users, openItem, mutations, canEdit } = useBoardContext();
  const group = model.groups.find((g) => g.id === item.groupId);
  const priority = model.priorityColumn ? model.getValue(item.id, model.priorityColumn.id) : undefined;
  const priorityLabel = model.priorityColumn && priority?.type === "PRIORITY" ? columnLabels(model.priorityColumn).find((l) => l.id === priority.labelId) : null;
  const owners = model.personColumns.flatMap((c) => {
    const v = model.getValue(item.id, c.id);
    return v?.type === "PERSON" ? v.userIds : [];
  });
  const ownerUsers = [...new Set(owners)].map((id) => users.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const due = model.dueDateOf(item.id);
  const done = model.isDone(item.id);
  const linked = (model.linksByItem.get(item.id)?.length ?? 0) > 0;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={overlay}>
        <article data-testid="kanban-card" className={cn("rounded-xl border border-border/60 bg-card p-3 shadow-xs transition-shadow hover:shadow-md", overlay && "rotate-1 shadow-xl", done && "opacity-70")}>
          <button type="button" onClick={() => openItem(item.id)} className="block w-full text-left text-[13px] font-medium leading-snug hover:underline" onPointerDown={(e) => e.stopPropagation()}>
            {item.name}
          </button>
          {group && (
            <p className="mt-1 flex items-center gap-1 text-2xs text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", colorClasses(group.color).dot)} /> {group.name}
            </p>
          )}
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LabelPill label={priorityLabel ?? null} appearance="soft" size="sm" />
              {linked && <RefreshCw className="size-3 text-muted-foreground" aria-label="Linked to an item on another board" />}
              {due && <span className={cn("text-2xs tabular", !done && isOverdue(due) ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>{formatShortDate(due)}</span>}
            </div>
            {ownerUsers.length > 0 && <AvatarStack users={ownerUsers} size="xs" max={3} />}
          </div>
        </article>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onSelect={() => openItem(item.id)}>
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

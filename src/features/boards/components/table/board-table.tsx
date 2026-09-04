"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, SearchX } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useBoardContext } from "@/features/boards/board-context";
import { CellStretchProvider } from "@/features/boards/components/cells/cell-shell";
import { tableWidth } from "@/features/boards/board-model";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";
import { BulkActionsBar } from "./bulk-actions-bar";
import { GroupSection } from "./group-section";

export type DragData = { type: "group"; groupId: string } | { type: "item"; itemId: string; groupId: string } | { type: "group-drop"; groupId: string };

const collisionDetection: CollisionDetection = (args) => {
  const activeType = (args.active.data.current as DragData | undefined)?.type;
  const containers = args.droppableContainers.filter((c) => {
    const type = (c.data.current as DragData | undefined)?.type;
    return activeType === "group" ? type === "group" : type === "item" || type === "group-drop";
  });
  return closestCenter({ ...args, droppableContainers: containers });
};

export function BoardTable() {
  const { board, model, mutations, canEdit } = useBoardContext();
  const ui = useBoardUi(board.id);
  const clearFilters = useBoardUiStore((s) => s.clearFilters);
  const setSearch = useBoardUiStore((s) => s.setSearch);
  const [activeDrag, setActiveDrag] = React.useState<DragData | null>(null);
  const [widthOverrides, setWidthOverrides] = React.useState<Record<string, number>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Drag-and-drop reorders positions, which is ambiguous while filtered or sorted.
  const dndEnabled = canEdit && !ui.sort && !ui.search && !model.isFiltered;

  const onDragStart = (event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as DragData | undefined) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;
    const activeData = active.data.current as DragData | undefined;
    const overData = over.data.current as DragData | undefined;
    if (!activeData || !overData) return;

    if (activeData.type === "group" && overData.type === "group") {
      if (active.id === over.id) return;
      const ids = model.groups.map((g) => g.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) return;
      void mutations.reorderGroups(arrayMove(ids, from, to));
      return;
    }

    if (activeData.type !== "item") return;
    const sourceGroupId = activeData.groupId;
    const targetGroupId = overData.groupId;
    const sourceIds = (model.itemsByGroup.get(sourceGroupId) ?? []).map((i) => i.id);
    const targetIds = sourceGroupId === targetGroupId ? sourceIds : (model.itemsByGroup.get(targetGroupId) ?? []).map((i) => i.id);
    const itemId = activeData.itemId;

    if (sourceGroupId === targetGroupId) {
      if (overData.type !== "item" || active.id === over.id) return;
      const from = sourceIds.indexOf(itemId);
      const to = sourceIds.indexOf(overData.itemId);
      if (from === -1 || to === -1) return;
      void mutations.moveItem({ itemId, toGroupId: targetGroupId, orderedIdsInTargetGroup: arrayMove(sourceIds, from, to) });
      return;
    }

    const nextSource = sourceIds.filter((id) => id !== itemId);
    const nextTarget = [...targetIds];
    if (overData.type === "item") {
      const index = nextTarget.indexOf(overData.itemId);
      nextTarget.splice(index === -1 ? nextTarget.length : index, 0, itemId);
    } else {
      nextTarget.push(itemId);
    }
    void mutations.moveItem({ itemId, toGroupId: targetGroupId, orderedIdsInTargetGroup: nextTarget, orderedIdsInSourceGroup: nextSource });
  };

  const width = tableWidth(model.visibleColumns.map((c) => ({ ...c, width: widthOverrides[c.id] ?? c.width })));
  const nothingVisible = model.visibleTopLevel === 0 && model.totalTopLevel > 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-auto pl-3" data-testid="board-table">
        <CellStretchProvider>
          <div style={{ minWidth: width }} className="pb-24">
            <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)} modifiers={[restrictToVerticalAxis]}>
              <SortableContext items={model.groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
                {model.groups.map((group) => (
                  <GroupSection key={group.id} group={group} dndEnabled={dndEnabled} widthOverrides={widthOverrides} onWidthOverride={setWidthOverrides} />
                ))}
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeDrag?.type === "item" && (
                  <div className="flex h-10 w-80 items-center rounded-xl border border-border/70 bg-card px-3.5 text-[13px] font-medium shadow-xl">
                    {model.itemById.get(activeDrag.itemId)?.name}
                  </div>
                )}
                {activeDrag?.type === "group" && (
                  <div className="flex h-10 w-80 items-center rounded-xl border border-border/70 bg-card px-3.5 text-[13px] font-semibold shadow-xl">
                    {model.groups.find((g) => g.id === activeDrag.groupId)?.name}
                  </div>
                )}
              </DragOverlay>
            </DndContext>

            {nothingVisible && (
              <div className="sticky left-0 w-[min(100%,60rem)]">
                <EmptyState
                  icon={SearchX}
                  title="No tasks match these filters."
                  description="Try widening the filters or clearing the search."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        clearFilters(board.id);
                        setSearch(board.id, "");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              </div>
            )}

            {canEdit && (
              <div className="sticky left-0 px-4 pt-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void mutations.createGroup("New group")} data-testid="add-group">
                  <Plus /> Add new group
                </Button>
              </div>
            )}
          </div>
        </CellStretchProvider>
      </div>
      <BulkActionsBar />
    </div>
  );
}

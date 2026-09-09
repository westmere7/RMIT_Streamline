"use client";

import * as React from "react";
import type { BoardColumn, ColorToken, ColumnValue, Item, User } from "@/domain";
import { columnLabels } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";

/** The lane for items with no value in the laned column. */
export const NONE = "__none__";

export type LaneBy = "status" | "priority" | "person" | "group";

export interface Lane {
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

/**
 * What this board can lane by, in the order the board offers it.
 *
 * Shared by the desktop lanes and the phone's lane selector so both offer the
 * same choices and fall back the same way when a board has no status column.
 */
export function useLaneOptions(): Array<{ value: LaneBy; label: string }> {
  const { model } = useBoardContext();
  return React.useMemo(
    () =>
      [
        model.statusColumn && { value: "status" as const, label: "Status" },
        model.priorityColumn && { value: "priority" as const, label: "Priority" },
        model.personColumns[0] && { value: "person" as const, label: "Person" },
        model.groups.length > 0 && { value: "group" as const, label: "Group" },
      ].filter((o): o is { value: LaneBy; label: string } => !!o),
    [model],
  );
}

/**
 * The board's items dealt into lanes, each lane carrying what to write when an
 * item lands in it.
 *
 * `apply` is how an item moves without a drag: the desktop calls it on drop, the
 * phone calls it from an explicit "Move to" control. Same write either way.
 */
export function useKanbanLanes(laneBy: LaneBy): Lane[] {
  const { model, mutations, users } = useBoardContext();
  const visibleItems = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);
  const firstGroup = model.groups[0];
  const personColumn = model.personColumns[0] ?? null;

  return React.useMemo<Lane[]>(() => {
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
}

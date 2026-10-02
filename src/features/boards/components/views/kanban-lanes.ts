"use client";

import * as React from "react";
import type { BoardColumn, ColorToken, ColumnLabel, ColumnSettings, ColumnValue, Item, User } from "@/domain";
import { columnLabels } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";

/** The lane for items with no value in the laned column. */
export const NONE = "__none__";

/**
 * A dropdown lanes by the column itself, not by its type: a board can have
 * several, and "which one" is the whole question.
 */
export type LaneBy = "status" | "priority" | "person" | "group" | `dropdown:${string}`;

/** The dropdown column a lane setting points at, or null for the fixed lanes. */
export function laneDropdownId(laneBy: LaneBy): string | null {
  return laneBy.startsWith("dropdown:") ? laneBy.slice("dropdown:".length) : null;
}

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
  /**
   * Renames what the lane stands for — the label or the group, so the table and
   * every other view follow. Null where the name is not the board's to change: a
   * person, a fixed priority, the lane of items with no value.
   */
  rename: ((name: string) => void) | null;
}

/** True where the board defines the column's labels (Status, Dropdown), so they can be renamed and reordered. */
function labelsAreEditable(column: BoardColumn): boolean {
  return column.settings.kind === "status" || column.settings.kind === "dropdown";
}

function withLabels(column: BoardColumn, labels: ColumnLabel[]): ColumnSettings {
  return { ...column.settings, labels } as ColumnSettings;
}

/**
 * Puts the lanes in a new order, or null when their order is not the board's
 * to choose (people go by name, priority by its fixed steps). What is written
 * is the labels' or the groups' own order, so the table and every status picker
 * change with it.
 */
export function useLaneReorder(laneBy: LaneBy): ((orderedIds: string[]) => void) | null {
  const { model, mutations } = useBoardContext();
  return React.useMemo(() => {
    if (laneBy === "group") return (orderedIds: string[]) => void mutations.reorderGroups(orderedIds);
    const dropdownId = laneDropdownId(laneBy);
    const column = laneBy === "status" ? model.statusColumn : dropdownId ? model.columns.find((c) => c.id === dropdownId && c.type === "DROPDOWN") : null;
    if (!column || !labelsAreEditable(column)) return null;
    return (orderedIds: string[]) => {
      const labels = columnLabels(column);
      const byId = new Map(labels.map((l) => [l.id, l]));
      const ordered = [...orderedIds.map((id) => byId.get(id)).filter((l): l is ColumnLabel => !!l), ...labels.filter((l) => !orderedIds.includes(l.id))];
      void mutations.updateColumn(column.id, { settings: withLabels(column, ordered) });
    };
  }, [laneBy, model, mutations]);
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
        // One entry per dropdown, named after the column: "Stage" and "Channel"
        // are both lists of choices and neither is "the" dropdown.
        ...model.columns.filter((c) => c.type === "DROPDOWN").map((c) => ({ value: `dropdown:${c.id}` as LaneBy, label: c.name })),
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
  const { model, mutations, users, people } = useBoardContext();
  // Everyone a task can name, pending and departed people too: a task whose
  // only owner has not onboarded yet, or has left, still needs a lane.
  const named = people ?? users;
  const visibleItems = React.useMemo(() => [...model.itemsByGroup.values()].flat(), [model]);
  const firstGroup = model.groups[0];
  const personColumn = model.personColumns[0] ?? null;

  return React.useMemo<Lane[]>(() => {
    const byLabel = (column: BoardColumn, type: "STATUS" | "PRIORITY" | "DROPDOWN"): Lane[] => {
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
        rename: labelsAreEditable(column) ? (name) => void mutations.updateColumn(column.id, { settings: withLabels(column, labels.map((l) => (l.id === label.id ? { ...l, name } : l))) }) : null,
      }));
      const unset = visibleItems.filter((i) => !labels.some((l) => l.id === valueOf(i)));
      const noneName = type === "STATUS" ? "No status" : type === "PRIORITY" ? "No priority" : `No ${column.name.toLowerCase()}`;
      if (unset.length) out.push({ id: NONE, name: noneName, color: null, items: unset, apply: (item) => void mutations.setValue(item, column, { type, labelId: null } as ColumnValue), initial: firstGroup ? { groupId: firstGroup.id, values: [] } : null, rename: null });
      return out;
    };
    if (laneBy === "status" && model.statusColumn) return byLabel(model.statusColumn, "STATUS");
    if (laneBy === "priority" && model.priorityColumn) return byLabel(model.priorityColumn, "PRIORITY");
    const dropdownId = laneDropdownId(laneBy);
    if (dropdownId) {
      const column = model.columns.find((c) => c.id === dropdownId && c.type === "DROPDOWN");
      if (column) return byLabel(column, "DROPDOWN");
    }
    if (laneBy === "person" && personColumn) {
      const column = personColumn;
      const ownersOf = (item: Item) => {
        const v = model.getValue(item.id, column.id);
        return v?.type === "PERSON" ? v.userIds : [];
      };
      const out: Lane[] = named
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
          rename: null,
        }));
      const unassigned = visibleItems.filter((i) => ownersOf(i).length === 0);
      out.push({ id: NONE, name: "Unassigned", color: null, items: unassigned, apply: (item) => void mutations.setValue(item, column, { type: "PERSON", userIds: [] }), initial: firstGroup ? { groupId: firstGroup.id, values: [] } : null, rename: null });
      return out;
    }
    return model.groups.map((group) => ({
      id: group.id,
      name: group.name,
      color: group.color,
      items: model.itemsByGroup.get(group.id) ?? [],
      apply: (item) => void mutations.moveItemsToGroup([item.id], group.id),
      initial: { groupId: group.id, values: [] },
      rename: (name) => void mutations.updateGroup(group.id, { name }),
    }));
  }, [laneBy, model, visibleItems, named, personColumn, firstGroup, mutations]);
}

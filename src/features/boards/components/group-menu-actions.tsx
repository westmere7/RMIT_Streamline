"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, Inbox, Palette, Pencil, Trash2 } from "lucide-react";
import type { MenuAction } from "@/components/layout/row-menu";
import { ColorPicker } from "@/components/shared/color-picker";
import type { BoardGroup } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";
import { useServices } from "@/features/data/data-context";
import { pluralize } from "@/lib/utils";

/**
 * A group's menu as a list, for the phone's group header: the same entries the
 * desktop group menu has (Rename, Change colour, Duplicate, Delete), with
 * Booked by Form saying why it cannot be deleted.
 */
export function useGroupMenuActions(group: BoardGroup, handlers: { onRename: () => void; onDelete: () => void }): MenuAction[] {
  const { model, mutations, canEdit } = useBoardContext();
  if (!canEdit) return [];
  const intake = group.id === model.intakeGroupId;
  return [
    { type: "item", label: "Rename group", icon: <Pencil />, onSelect: handlers.onRename },
    {
      type: "sub",
      label: "Change colour",
      icon: <Palette />,
      content: <ColorPicker value={group.color} onChange={(color) => void mutations.updateGroup(group.id, { color })} />,
    },
    { type: "item", label: "Duplicate group", icon: <Copy />, onSelect: () => void mutations.duplicateGroup(group.id) },
    { type: "separator" },
    intake
      ? { type: "item", label: "Bookings arrive here", icon: <Inbox />, disabled: true, onSelect: () => {} }
      : { type: "item", label: "Delete group", icon: <Trash2 />, destructive: true, onSelect: handlers.onDelete },
  ];
}

/**
 * What "Delete group" will take with it, in words: the tasks on show and the
 * archived ones filed under the group, which go too and were not counted before.
 * The archive is read only while the dialog is open.
 */
export function useGroupDeleteDescription(group: BoardGroup, liveCount: number, open: boolean): string {
  const services = useServices();
  const archived = useQuery({
    queryKey: ["group-archived-count", group.boardId, group.id],
    queryFn: async () => (await services.repos.items.listByBoard(group.boardId, { includeArchived: true })).filter((i) => i.groupId === group.id && i.parentItemId === null && i.archivedAt !== null).length,
    enabled: open,
    staleTime: 0,
  });
  const parts = [liveCount > 0 ? pluralize(liveCount, "item") : null, archived.data ? `${archived.data} archived` : null].filter(Boolean);
  return parts.length ? `This permanently deletes the group and its ${parts.join(" and ")}.` : "This permanently deletes the group.";
}

"use client";

import { Copy, Inbox, Palette, Pencil, Trash2 } from "lucide-react";
import type { MenuAction } from "@/components/layout/row-menu";
import { ColorPicker } from "@/components/shared/color-picker";
import type { BoardGroup } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";

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

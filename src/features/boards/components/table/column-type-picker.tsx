"use client";

import * as React from "react";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { COLUMN_TYPES, COLUMN_TYPE_LABELS, type ColumnType } from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";

/** Files are attached from the item panel, so a board never adds that column by hand. */
export const ADDABLE_COLUMN_TYPES: ColumnType[] = COLUMN_TYPES.filter((t) => t !== "FILES");

/** Fits two columns of type names without wrapping the longest label ("Dependency"). */
export const COLUMN_TYPE_PICKER_WIDTH = "w-[19rem]";

interface MenuItemProps {
  onSelect?: (event: Event) => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The two-column grid of column types, shared by the add-column menu and the
 * "Insert column" submenus so every entry point stays laid out the same way.
 * `variant` picks the menu primitive, since Radix items only work inside their
 * own menu type.
 */
export function ColumnTypePicker({ onPick, variant = "dropdown" }: { onPick: (type: ColumnType) => void; variant?: "dropdown" | "context" }) {
  const Item = (variant === "context" ? ContextMenuItem : DropdownMenuItem) as React.ComponentType<MenuItemProps>;
  return (
    <div className="grid grid-cols-2 gap-0.5">
      {ADDABLE_COLUMN_TYPES.map((type) => {
        const Icon = COLUMN_TYPE_ICONS[type];
        return (
          <Item key={type} onSelect={() => onPick(type)} className="min-w-0">
            <Icon />
            <span className="truncate whitespace-nowrap">{COLUMN_TYPE_LABELS[type]}</span>
          </Item>
        );
      })}
    </div>
  );
}

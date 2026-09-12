"use client";

import * as React from "react";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { COLUMN_TYPES, COLUMN_TYPE_LABELS, COLUMN_TYPE_PURPOSE, type ColumnType, isSystemColumnType } from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";

/** Files are attached from the item panel, so a board never adds that column by hand. */
export const ADDABLE_COLUMN_TYPES: ColumnType[] = [...COLUMN_TYPES];

/** A board's own fields: whatever it needs, called whatever it likes, as many as it likes. */
const PLAIN_TYPES = ADDABLE_COLUMN_TYPES.filter((type) => !isSystemColumnType(type));
/** The ones the workspace reads meaning out of. */
const SYSTEM_TYPES = ADDABLE_COLUMN_TYPES.filter(isSystemColumnType);

/** Fits two columns of type names without wrapping the longest label ("Dependency"). */
export const COLUMN_TYPE_PICKER_WIDTH = "w-[19rem]";

interface MenuItemProps {
  onSelect?: (event: Event) => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The column types on offer, in two groups of the same shape.
 *
 * Above the rule are a board's own fields. Below it are the types the rest of
 * the workspace reads: every board is laid out differently and the dashboard
 * still has to answer one question across all of them, so it finds what it
 * needs by these types rather than by the names boards give them.
 *
 * The green icon marks them, with one small line under the group saying why.
 * A heading over it was tried and dropped: it pushed the types down the menu
 * to explain something nobody needs before they have seen them.
 *
 * `variant` picks the menu primitive, since Radix items only work inside their
 * own menu type.
 */
export function ColumnTypePicker({ onPick, variant = "dropdown" }: { onPick: (type: ColumnType) => void; variant?: "dropdown" | "context" }) {
  const Item = (variant === "context" ? ContextMenuItem : DropdownMenuItem) as React.ComponentType<MenuItemProps>;
  const group = (types: ColumnType[], system: boolean) => (
    <div className="grid grid-cols-2 gap-0.5">
      {types.map((type) => {
        const Icon = COLUMN_TYPE_ICONS[type];
        return (
          <SimpleTooltip key={type} label={COLUMN_TYPE_PURPOSE[type]} side="right">
            <Item onSelect={() => onPick(type)} className="min-w-0">
              <Icon className={system ? "text-green-600 dark:text-green-400" : undefined} />
              <span className="truncate whitespace-nowrap">{COLUMN_TYPE_LABELS[type]}</span>
            </Item>
          </SimpleTooltip>
        );
      })}
    </div>
  );
  return (
    <div>
      {group(PLAIN_TYPES, false)}
      <div className="mt-1 border-t pt-1">
        {group(SYSTEM_TYPES, true)}
        {/* Under the group rather than over it: the types are what you came for,
            and this only explains why they are set apart. */}
        <p className="px-2 pt-1.5 pb-0.5 text-2xs text-muted-foreground">Tracked workspace-wide, to power the dashboard.</p>
      </div>
    </div>
  );
}

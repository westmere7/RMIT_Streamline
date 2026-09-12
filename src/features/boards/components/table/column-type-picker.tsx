"use client";

import { HelpCircle } from "lucide-react";
import * as React from "react";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { COLUMN_TYPES, COLUMN_TYPE_LABELS, SYSTEM_COLUMN_PURPOSE, type ColumnType, isSystemColumnType } from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";

/** Files are attached from the item panel, so a board never adds that column by hand. */
export const ADDABLE_COLUMN_TYPES: ColumnType[] = [...COLUMN_TYPES];

/** A board's own fields: whatever it needs, called whatever it likes, as many as it likes. */
const PLAIN_TYPES = ADDABLE_COLUMN_TYPES.filter((type) => !isSystemColumnType(type));
/** The ones the workspace reads meaning out of, in the order they are worth reading. */
const SYSTEM_TYPES = ADDABLE_COLUMN_TYPES.filter(isSystemColumnType);

/** Fits two columns of type names without wrapping the longest label ("Dependency"). */
export const COLUMN_TYPE_PICKER_WIDTH = "w-[19rem]";

interface MenuItemProps {
  onSelect?: (event: Event) => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The column types on offer, in two groups.
 *
 * The top grid is a board's own business. Below the rule are the types the rest
 * of the workspace reads: every board is laid out differently and the dashboard
 * still has to answer one question across all of them, so it finds what it
 * needs by these types rather than by the names boards give them. Choosing one
 * is therefore a decision with consequences elsewhere, which is what the note
 * beside each says.
 *
 * `variant` picks the menu primitive, since Radix items only work inside their
 * own menu type.
 */
export function ColumnTypePicker({ onPick, variant = "dropdown" }: { onPick: (type: ColumnType) => void; variant?: "dropdown" | "context" }) {
  const Item = (variant === "context" ? ContextMenuItem : DropdownMenuItem) as React.ComponentType<MenuItemProps>;
  return (
    <div>
      <div className="grid grid-cols-2 gap-0.5">
        {PLAIN_TYPES.map((type) => {
          const Icon = COLUMN_TYPE_ICONS[type];
          return (
            <Item key={type} onSelect={() => onPick(type)} className="min-w-0">
              <Icon />
              <span className="truncate whitespace-nowrap">{COLUMN_TYPE_LABELS[type]}</span>
            </Item>
          );
        })}
      </div>
      {/* One column rather than two: these are read rather than scanned, and
          each carries a note. */}
      <p className="mt-1.5 border-t px-2 pt-2 pb-1 text-2xs text-muted-foreground">The workspace reads these</p>
      <div className="grid gap-0.5">
        {SYSTEM_TYPES.map((type) => {
          const Icon = COLUMN_TYPE_ICONS[type];
          const purpose = SYSTEM_COLUMN_PURPOSE[type];
          return (
            <Item key={type} onSelect={() => onPick(type)} className="min-w-0">
              <Icon />
              <span className="truncate whitespace-nowrap">{COLUMN_TYPE_LABELS[type]}</span>
              {purpose && (
                <SimpleTooltip label={purpose} side="right">
                  {/* A span, not a button: a button inside a menu item swallows
                      the click that picks the type. */}
                  <span
                    role="note"
                    aria-label={`${COLUMN_TYPE_LABELS[type]}: ${purpose}`}
                    className="ml-auto flex size-4 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-foreground"
                  >
                    <HelpCircle className="size-3.5" />
                  </span>
                </SimpleTooltip>
              )}
            </Item>
          );
        })}
      </div>
    </div>
  );
}

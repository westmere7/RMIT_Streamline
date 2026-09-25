"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import * as React from "react";
import { ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu";
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@/components/ui/dropdown-menu";
import { DATE_FORMAT_LABELS, DATE_FORMATS, dateTimeSettings, TIME_FORMAT_LABELS, TIME_FORMATS, type BoardColumn, type ColumnType } from "@/domain";
import { useBoardContext } from "@/features/boards/board-context";

/** Which halves of the format each type has: a date, a time, or both. */
const FORMAT_PARTS: Partial<Record<ColumnType, { date: boolean; time: boolean }>> = {
  PLAIN_DATE: { date: true, time: false },
  TIME: { date: false, time: true },
  DATETIME: { date: true, time: true },
  BOOKED_AT: { date: true, time: true },
};

export function hasFormatMenu(column: BoardColumn): boolean {
  return column.type in FORMAT_PARTS;
}

type Primitives = {
  Sub: React.ComponentType<{ children?: React.ReactNode }>;
  SubTrigger: React.ComponentType<{ children?: React.ReactNode }>;
  SubContent: React.ComponentType<{ children?: React.ReactNode; className?: string }>;
  Item: React.ComponentType<{ children?: React.ReactNode; onSelect?: (event: Event) => void }>;
  Label: React.ComponentType<{ children?: React.ReactNode; className?: string }>;
  Separator: React.ComponentType;
};

const PRIMITIVES: Record<"dropdown" | "context", Primitives> = {
  dropdown: { Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent, Item: DropdownMenuItem, Label: DropdownMenuLabel, Separator: DropdownMenuSeparator },
  context: { Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent, Item: ContextMenuItem, Label: ContextMenuLabel, Separator: ContextMenuSeparator },
} as unknown as Record<"dropdown" | "context", Primitives>;

/**
 * Format, in a date or time column's menu: how its values are written, each
 * choice shown as what it looks like. The change is the column's, so everyone
 * sees the same.
 */
export function ColumnFormatMenu({ column, variant = "dropdown" }: { column: BoardColumn; variant?: "dropdown" | "context" }) {
  const { mutations } = useBoardContext();
  const parts = FORMAT_PARTS[column.type];
  if (!parts) return null;
  const { Sub, SubTrigger, SubContent, Item, Label, Separator } = PRIMITIVES[variant];
  const settings = dateTimeSettings(column.settings);
  const set = (patch: Partial<typeof settings>) => void mutations.updateColumn(column.id, { settings: { ...settings, ...patch } });
  return (
    <Sub>
      <SubTrigger>
        <SlidersHorizontal /> Format
      </SubTrigger>
      <SubContent className="w-44">
        {parts.date && (
          <>
            <Label className="text-2xs font-normal text-muted-foreground">Date</Label>
            {DATE_FORMATS.map((format) => (
              <Item key={format} onSelect={() => set({ dateFormat: format })}>
                <span className="tabular">{DATE_FORMAT_LABELS[format]}</span>
                {settings.dateFormat === format && <Check className="ml-auto size-3.5" />}
              </Item>
            ))}
          </>
        )}
        {parts.date && parts.time && <Separator />}
        {parts.time && (
          <>
            <Label className="text-2xs font-normal text-muted-foreground">Time</Label>
            {TIME_FORMATS.map((format) => (
              <Item key={format} onSelect={() => set({ timeFormat: format })}>
                <span className="tabular">{TIME_FORMAT_LABELS[format]}</span>
                {settings.timeFormat === format && <Check className="ml-auto size-3.5" />}
              </Item>
            ))}
          </>
        )}
      </SubContent>
    </Sub>
  );
}

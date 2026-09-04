"use client";

import { Check, CircleCheck } from "lucide-react";
import * as React from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Item } from "@/domain";
import { cn } from "@/lib/utils";

export interface DependencyPickerProps {
  items: Item[];
  value: string[];
  onChange: (itemIds: string[]) => void;
  isDone: (itemId: string) => boolean;
}

/** Choose items on the same board that this item depends on. */
export function DependencyPicker({ items, value, onChange, isDone }: DependencyPickerProps) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <Command>
      <CommandInput placeholder="Search items on this board…" autoFocus />
      <CommandList className="max-h-64">
        <CommandEmpty>No items found.</CommandEmpty>
        <CommandGroup heading="Depends on">
          {items.map((item) => {
            const selected = value.includes(item.id);
            const done = isDone(item.id);
            return (
              <CommandItem key={item.id} value={item.name} onSelect={() => toggle(item.id)}>
                <CircleCheck className={cn("size-4", done ? "text-green-600" : "text-muted-foreground/40")} />
                <span className={cn("truncate", done && "text-muted-foreground")}>{item.name}</span>
                <Check className={cn("ml-auto size-4", selected ? "opacity-100" : "opacity-0")} />
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

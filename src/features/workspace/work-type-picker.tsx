"use client";

import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { WorkType } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * The work types one asset type belongs to: chips in the row, a dropdown to
 * tick them on and off. Several at once — a type can be two kinds of work,
 * and it is counted in each.
 */
export function WorkTypePicker({ workTypes, value, onChange, disabled, typeName }: { workTypes: WorkType[]; value: string[]; onChange?: (ids: string[]) => void; disabled?: boolean; typeName: string }) {
  const chosen = workTypes.filter((w) => value.includes(w.id));
  const toggle = (id: string) => onChange?.(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  if (workTypes.length === 0) {
    return (
      <a href="#work-types" className="text-2xs text-muted-foreground/70 hover:text-foreground">
        Add work types below
      </a>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={`Work types for ${typeName}`}
          className={cn("group flex min-h-8 w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors", !disabled && "hover:bg-accent")}
          data-testid={`work-type-picker-${typeName}`}
        >
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            {chosen.length === 0 && <span className="text-2xs text-muted-foreground/70">None</span>}
            {chosen.map((w) => (
              <span key={w.id} className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-px text-2xs font-medium" style={{ background: `color-mix(in oklab, ${colorClasses(w.color).hex} 18%, transparent)`, color: colorClasses(w.color).hex }}>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: colorClasses(w.color).hex }} />
                <span className="truncate">{w.name}</span>
              </span>
            ))}
          </span>
          {!disabled && <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1" data-testid="work-type-picker">
        <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{typeName}</p>
        {workTypes.map((w) => {
          const on = value.includes(w.id);
          return (
            <button key={w.id} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => toggle(w.id)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent" data-testid="work-type-option">
              <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: colorClasses(w.color).hex }} />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {on && <Check className="size-3.5 shrink-0 text-foreground" />}
            </button>
          );
        })}
        <a href="#work-types" className="mt-1 block border-t border-border/60 px-2 pt-1.5 pb-1 text-2xs text-muted-foreground hover:text-foreground">
          Edit work types
        </a>
      </PopoverContent>
    </Popover>
  );
}

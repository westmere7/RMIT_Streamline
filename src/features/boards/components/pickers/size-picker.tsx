"use client";

import { Check, Shirt } from "lucide-react";
import * as React from "react";
import { T_SHIRT_SIZES, T_SHIRT_SIZE_COLORS, type TShirtSize } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * A size as a small pill: a shirt outline and the letters, tinted by size so a
 * column reads as a scale from cool (XS) to warm (XL). Empty cells show a faint
 * shirt so the column is still recognisable.
 */
export function SizePill({ size, className }: { size: TShirtSize | null; className?: string }) {
  if (!size) {
    return (
      <span className={cn("inline-flex items-center text-muted-foreground/40", className)} aria-hidden>
        <Shirt className="size-3.5" />
      </span>
    );
  }
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-2xs font-semibold tabular", colorClasses(T_SHIRT_SIZE_COLORS[size]).soft, className)} data-testid="size-pill" data-size={size}>
      <Shirt className="size-3 shrink-0 opacity-70" aria-hidden />
      {size}
    </span>
  );
}

/** The five sizes in a row, plus a way to clear. */
export function SizePicker({ value, onChange }: { value: TShirtSize | null; onChange: (size: TShirtSize | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5" role="listbox" aria-label="T-shirt size" data-testid="size-picker">
      <div className="flex items-center gap-1">
        {T_SHIRT_SIZES.map((size) => {
          const active = value === size;
          return (
            <button
              key={size}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onChange(size)}
              className={cn(
                "relative flex h-8 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold ring-2 ring-transparent transition-shadow hover:ring-ring/50",
                colorClasses(T_SHIRT_SIZE_COLORS[size]).soft,
                active && "ring-ring",
              )}
            >
              <Shirt className="size-3 opacity-70" aria-hidden />
              {size}
              {active && <Check className="absolute -top-1 -right-1 size-3 rounded-full bg-ring p-0.5 text-white" aria-hidden />}
            </button>
          );
        })}
      </div>
      {value && (
        <button type="button" onClick={() => onChange(null)} className="self-start rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-accent hover:text-foreground">
          Clear size
        </button>
      )}
    </div>
  );
}

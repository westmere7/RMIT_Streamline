"use client";

import { Check } from "lucide-react";
import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHIP_PALETTE, CHIP_TEXT } from "@/features/trackers/tracker-template";
import { cn } from "@/lib/utils";

export interface ChipProps extends React.ComponentProps<"span"> {
  label: string;
  /** Hex fill without #; `undefined` draws the neutral chip used for custom values. */
  color?: string;
  size?: "sm" | "md";
}

/** Google-Sheets-style dropdown chip: soft pill, dark text, colour per option. */
export function Chip({ label, color, size = "md", className, style, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-full font-medium leading-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
        size === "md" ? "h-6 px-2.5 text-xs" : "h-5 px-2 text-2xs",
        !color && "bg-foreground/[0.08] text-foreground shadow-none ring-1 ring-inset ring-border",
        className,
      )}
      style={color ? { backgroundColor: `#${color}`, color: `#${CHIP_TEXT}`, ...style } : style}
      {...props}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Small swatch that opens the chip palette. */
export function ChipColorPicker({ value, onChange, label }: { value: string | undefined; onChange: (color: string) => void; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Colour for ${label}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"
          style={{ backgroundColor: value ? `#${value}` : "transparent" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!value && <span className="size-3 rounded-full border border-dashed border-muted-foreground/60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-6 gap-1.5" role="listbox" aria-label={`Colours for ${label}`}>
          {CHIP_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              role="option"
              aria-selected={value === hex}
              aria-label={`#${hex}`}
              onClick={() => onChange(hex)}
              className="flex size-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"
              style={{ backgroundColor: `#${hex}` }}
            >
              {value === hex && <Check className="size-3.5" style={{ color: `#${CHIP_TEXT}` }} strokeWidth={3} />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { Check } from "lucide-react";
import * as React from "react";
import type { ColorToken } from "@/domain";
import { COLOR_TOKENS } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface ColorPickerProps {
  value: ColorToken;
  onChange: (color: ColorToken) => void;
  className?: string;
  tokens?: readonly ColorToken[];
}

export function ColorPicker({ value, onChange, className, tokens = COLOR_TOKENS }: ColorPickerProps) {
  return (
    <div role="radiogroup" aria-label="Colour" className={cn("grid grid-cols-9 gap-1.5", className)}>
      {tokens.map((token) => {
        const selected = token === value;
        return (
          <button
            key={token}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={token}
            onClick={() => onChange(token)}
            className={cn(
              "flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring",
              colorClasses(token).dot,
              selected && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
            )}
          >
            {selected && <Check className="size-3.5 text-white" strokeWidth={3} />}
          </button>
        );
      })}
    </div>
  );
}

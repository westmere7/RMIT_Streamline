"use client";

import * as React from "react";
import { DynamicIcon, ICON_NAMES } from "@/components/shared/dynamic-icon";
import { cn } from "@/lib/utils";

export interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
  className?: string;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  return (
    <div role="radiogroup" aria-label="Icon" className={cn("grid grid-cols-8 gap-1", className)}>
      {ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={name === value}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            name === value && "border-ring bg-accent text-foreground",
          )}
        >
          <DynamicIcon name={name} className="size-4" />
        </button>
      ))}
    </div>
  );
}

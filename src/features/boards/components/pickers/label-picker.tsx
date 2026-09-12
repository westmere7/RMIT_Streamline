"use client";

import { Check, Pencil } from "lucide-react";
import * as React from "react";
import type { ColumnLabel } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface LabelPickerProps {
  labels: ColumnLabel[];
  value: string | null;
  onChange: (labelId: string | null) => void;
  appearance?: "solid" | "soft";
  /** Labels drawn with hazard stripes — the ones that mean "stuck". */
  stripedIds?: string[];
  allowClear?: boolean;
  onEditLabels?: () => void;
  /** Drawn in front of each label — the priority picker puts its signal bars here. */
  leading?: (label: ColumnLabel) => React.ReactNode;
}

/** Grid of status/dropdown/priority labels used inside popovers. */
export function LabelPicker({ labels, value, onChange, appearance = "solid", stripedIds = [], allowClear = true, onEditLabels, leading }: LabelPickerProps) {
  return (
    <div className="w-56">
      <div role="listbox" aria-label="Choose a label" className="grid grid-cols-2 gap-1">
        {labels.map((label) => {
          const colors = colorClasses(label.color);
          const selected = value === label.id;
          return (
            <button
              key={label.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(label.id)}
              className={cn(
                "flex h-8 items-center justify-center gap-1 rounded px-2 text-xs font-medium transition-[filter] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring",
                appearance === "solid" ? colors.solid : colors.soft,
                stripedIds.includes(label.id) && "zebra",
                selected && "ring-2 ring-foreground/60 ring-offset-1",
              )}
            >
              {leading?.(label)}
              <span className="truncate">{label.name}</span>
              {selected && <Check className="size-3 shrink-0" strokeWidth={3} />}
            </button>
          );
        })}
        {/* Nothing to clear before anything has been defined; the only thing
            to do with an empty list is give it some labels. */}
        {allowClear && labels.length > 0 && (
          <button
            type="button"
            role="option"
            aria-selected={value === null}
            onClick={() => onChange(null)}
            className="flex h-8 items-center justify-center rounded border border-dashed px-2 text-xs text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          >
            Clear
          </button>
        )}
      </div>
      {onEditLabels && (
        <button
          type="button"
          onClick={onEditLabels}
          className="mt-2 flex h-7 w-full items-center justify-center gap-1.5 rounded border-t pt-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3" /> Edit labels
        </button>
      )}
    </div>
  );
}

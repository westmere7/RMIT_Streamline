import * as React from "react";
import type { ColumnLabel } from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

export interface LabelPillProps extends React.ComponentProps<"span"> {
  label: ColumnLabel | null | undefined;
  /** "solid" fills the whole cell (status); "soft" is a tinted chip (priority, tags). */
  appearance?: "solid" | "soft";
  emptyText?: string;
  size?: "sm" | "md";
  /** Stuck statuses wear hazard stripes. */
  striped?: boolean;
}

export function LabelPill({ label, appearance = "solid", emptyText = "", size = "md", striped = false, className, ...props }: LabelPillProps) {
  if (!label) {
    return (
      <span className={cn("inline-flex items-center text-[13px] text-muted-foreground/70", className)} {...props}>
        {emptyText}
      </span>
    );
  }
  const colors = colorClasses(label.color);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-md font-medium",
        size === "md" ? "h-6.5 px-2.5 text-xs" : "h-5.5 px-2 text-2xs",
        appearance === "solid" ? colors.solid : colors.soft,
        striped && "zebra",
        className,
      )}
      {...props}
    >
      <span className="truncate">{label.name}</span>
    </span>
  );
}

export function ColorDot({ color, className }: { color: ColumnLabel["color"]; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", colorClasses(color).dot, className)} />;
}

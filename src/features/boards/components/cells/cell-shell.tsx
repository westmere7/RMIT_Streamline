"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { columnCellStyle } from "@/features/boards/board-model";
import { cn } from "@/lib/utils";

/**
 * Table rows stretch their cells to fill a wide screen; other hosts (the item detail panel)
 * keep the width they ask for.
 */
const StretchContext = React.createContext(false);

export function CellStretchProvider({ children }: { children: React.ReactNode }) {
  return <StretchContext.Provider value={true}>{children}</StretchContext.Provider>;
}

function useCellStyle(width: number): React.CSSProperties {
  return React.useContext(StretchContext) ? columnCellStyle(width) : { width, minWidth: width };
}

export interface CellShellProps extends React.ComponentProps<"div"> {
  width: number;
  /** Cells look like display values; `interactive` adds hover affordance. */
  interactive?: boolean;
  align?: "left" | "center";
}

/** Fixed-width table cell container. */
export function CellShell({ width, interactive = true, align = "left", className, children, ...props }: CellShellProps) {
  const style = useCellStyle(width);
  return (
    <div
      role="gridcell"
      style={style}
      className={cn(
        "flex h-full shrink-0 items-center overflow-hidden border-r px-1 text-[13px]",
        align === "center" && "justify-center",
        interactive && "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PopoverCellProps {
  width: number;
  /** Display content (looks like a value, not an input). */
  trigger: React.ReactNode;
  /** Popover content; receives a close function. */
  children: (close: () => void) => React.ReactNode;
  disabled?: boolean;
  align?: "left" | "center";
  contentClassName?: string;
  ariaLabel: string;
  testId?: string;
}

/** A cell that opens an editor popover when clicked. */
export function PopoverCell({ width, trigger, children, disabled, align = "left", contentClassName, ariaLabel, testId }: PopoverCellProps) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const style = useCellStyle(width);
  if (disabled) {
    return (
      <CellShell width={width} interactive={false} align={align}>
        {trigger}
      </CellShell>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="gridcell"
          aria-label={ariaLabel}
          data-testid={testId}
          style={style}
          className={cn(
            "flex h-full shrink-0 items-center overflow-hidden border-r px-1 text-left text-[13px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            align === "center" && "justify-center",
            open && "bg-black/[0.04] dark:bg-white/[0.06]",
          )}
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", contentClassName)} align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        {children(close)}
      </PopoverContent>
    </Popover>
  );
}

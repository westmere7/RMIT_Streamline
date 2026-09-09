"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { columnCellStyle } from "@/features/boards/board-model";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

/**
 * How a cell sizes itself, decided by its host rather than by the cell.
 *
 * `table` stretches cells to fill a wide screen, `none` keeps the width asked
 * for (the item detail panel), and `fill` lets the cell take whatever its
 * container gives it — a phone's field list, where a 260px cell in a 190px slot
 * would push the page sideways.
 */
type StretchMode = "none" | "table" | "fill";

const StretchContext = React.createContext<StretchMode>("none");

export function CellStretchProvider({ mode = "table", children }: { mode?: StretchMode; children: React.ReactNode }) {
  return <StretchContext.Provider value={mode}>{children}</StretchContext.Provider>;
}

function useCellStyle(width: number): React.CSSProperties {
  const mode = React.useContext(StretchContext);
  if (mode === "table") return columnCellStyle(width);
  if (mode === "fill") return { width: "100%", minWidth: 0 };
  return { width, minWidth: width };
}

/**
 * Centring is a table habit: it keeps a column of short values tidy under its
 * heading. A stacked field list has no column, so a centred value floats away
 * from the label above it — in `fill` the value starts where the label starts.
 */
function useAlign(align: "left" | "center"): "left" | "center" {
  return React.useContext(StretchContext) === "fill" ? "left" : align;
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
  const alignment = useAlign(align);
  return (
    <div
      role="gridcell"
      style={style}
      className={cn(
        "flex h-full shrink-0 items-center overflow-hidden border-r border-border/50 px-1 text-[13px]",
        alignment === "center" && "justify-center",
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

/**
 * A cell that opens an editor when clicked: a popover on a desktop, a bottom
 * sheet on a phone.
 *
 * The editor itself is the same content either way, so every column type —
 * status, person, date, timeline, tags, dependency and the rest — gets a
 * touch-sized editor without a second implementation to keep in step. A popover
 * anchored to a 100px cell is the wrong shape on a 375px screen: it opens off to
 * one side, its own controls shrink to fit, and it sits under the thumb holding
 * the phone. The desktop branch below 768px is untouched.
 */
export function PopoverCell({ width, trigger, children, disabled, align = "left", contentClassName, ariaLabel, testId }: PopoverCellProps) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const close = React.useCallback(() => setOpen(false), []);
  const style = useCellStyle(width);
  const alignment = useAlign(align);
  if (disabled) {
    // A read-only cell still says what it is: without the label a screen reader
    // would read the value with no column or item to hang it on.
    return (
      <CellShell width={width} interactive={false} align={alignment} aria-label={ariaLabel} data-testid={testId}>
        {trigger}
      </CellShell>
    );
  }

  const triggerClassName = cn(
    "flex h-full shrink-0 items-center overflow-hidden border-r border-border/50 px-1 text-left text-[13px] transition-colors hover:bg-black/[0.02] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring dark:hover:bg-white/[0.03]",
    alignment === "center" && "justify-center",
    open && "bg-black/[0.04] dark:bg-white/[0.06]",
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <button type="button" role="gridcell" aria-label={ariaLabel} data-testid={testId} style={style} className={triggerClassName} onClick={() => setOpen(true)}>
          {trigger}
        </button>
        <SheetContent title={ariaLabel} className="[&_[data-radix-popper-content-wrapper]]:!static">
          <div className="pb-2">{children(close)}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="gridcell" aria-label={ariaLabel} data-testid={testId} style={style} className={triggerClassName}>
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", contentClassName)} align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        {children(close)}
      </PopoverContent>
    </Popover>
  );
}

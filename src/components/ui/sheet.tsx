"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A sheet that rises from the bottom of the screen.
 *
 * The phone's answer to a popover, a dropdown and a side panel at once: those
 * anchor themselves to a trigger and assume a cursor, which at 375px means a
 * menu wider than the screen or a target too small to hit. A sheet takes the
 * full width, sizes itself to its content up to most of the viewport, and puts
 * its close control where a thumb already is.
 *
 * Radix Dialog underneath, so the accessible name, focus trap, focus
 * restoration, Escape and inert background come for free. It is mobile-only by
 * use, not by media query — nothing desktop renders one — so no desktop
 * component changes behaviour because this file exists.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;

interface SheetContentProps extends Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> {
  /** The sheet's accessible name; shown unless `hideTitle`. */
  title: string;
  /** A line under the title. Also the accessible description when present. */
  description?: string;
  hideTitle?: boolean;
  /** Actions pinned below the scrolling body, clear of the home indicator. */
  footer?: React.ReactNode;
}

function SheetContent({ title, description, hideTitle, footer, className, children, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          // dvh, not vh: the browser chrome on a phone shrinks the viewport as
          // it scrolls, and vh would leave the sheet running under it.
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-border/70 bg-popover shadow-2xl",
          "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          "motion-reduce:duration-0 motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-start gap-2 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            {/* The grabber says "drag me down" even though the close button is
                what actually does it — it is the shape people read as a sheet. */}
            <span aria-hidden className="mx-auto mb-2.5 block h-1 w-9 rounded-full bg-border" />
            <DialogPrimitive.Title className={cn("text-[15px] font-semibold tracking-tight", hideTitle && "sr-only")}>{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="mt-0.5 text-[13px] text-muted-foreground">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-mr-1.5 mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-4", !footer && "pb-[max(1rem,env(safe-area-inset-bottom))]")}>{children}</div>
        {footer && <div className="shrink-0 border-t border-border/70 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** One tappable line in a sheet: 48px tall, the whole row a target. */
function SheetItem({ className, selected, children, ...props }: React.ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] active:bg-accent/70 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
        selected && "font-medium text-accent-soft-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** A titled run of rows inside a sheet. */
function SheetGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="py-1">
      {title && <h3 className="px-2 pt-2 pb-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>}
      <div role="menu" className="flex flex-col">
        {children}
      </div>
    </section>
  );
}

export { Sheet, SheetClose, SheetContent, SheetGroup, SheetItem, SheetTrigger };

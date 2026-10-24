"use client";

import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import { Check, ChevronRight, Circle } from "lucide-react";
import * as React from "react";
import { useMenuDragSelect } from "@/components/ui/menu-drag-select";
import { cn } from "@/lib/utils";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuSub = ContextMenuPrimitive.Sub;
const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const contentClasses =
  "z-50 min-w-[11rem] overflow-hidden rounded-xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

function ContextMenuContent({ className, onPointerDown, onPointerUp, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  const drag = useMenuDragSelect();
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={cn(contentClasses, className)}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          drag.onPointerDown(event);
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          drag.onPointerUp(event);
        }}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuSubTrigger({ className, children, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={cn(
        "flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none select-none focus:bg-accent/70 data-[state=open]:bg-accent/70 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='_text-'])]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

function ContextMenuSubContent({ className, onPointerDown, onPointerUp, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  const drag = useMenuDragSelect();
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        className={cn(contentClasses, className)}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          drag.onPointerDown(event);
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          drag.onPointerUp(event);
        }}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & { variant?: "default" | "destructive" }) {
  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] outline-none select-none focus:bg-accent/70 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg:not([class*='_text-'])]:text-muted-foreground",
        variant === "destructive" && "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive",
        className,
      )}
      {...props}
    />
  );
}

/** A tick beside the label, as on the dropdown, so a right-click menu can carry the same choices. */
function ContextMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-8 text-[13px] outline-none select-none focus:bg-accent/70 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check className="size-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

function ContextMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      className={cn(
        "relative flex cursor-default items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-8 text-[13px] outline-none select-none focus:bg-accent/70 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Circle className="size-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

function ContextMenuLabel({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return <ContextMenuPrimitive.Label className={cn("label-quiet px-2.5 py-1.5", className)} {...props} />;
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("-mx-1 my-1.5 h-px bg-border/70", className)} {...props} />;
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};

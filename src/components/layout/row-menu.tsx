"use client";

import { MoreHorizontal } from "lucide-react";
import * as React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Declarative menu description rendered as both a right-click menu and a hover "…" dropdown. */
export type MenuAction =
  | { type: "item"; label: string; icon?: React.ReactNode; onSelect: () => void; destructive?: boolean; disabled?: boolean; hint?: string }
  | { type: "sub"; label: string; icon?: React.ReactNode; items: MenuAction[]; disabled?: boolean }
  | { type: "label"; label: string }
  | { type: "separator" };

/** Renders actions as right-click menu entries. */
export function renderContext(actions: MenuAction[]): React.ReactNode {
  return actions.map((action, index) => {
    switch (action.type) {
      case "separator":
        return <ContextMenuSeparator key={index} />;
      case "label":
        return <ContextMenuLabel key={index}>{action.label}</ContextMenuLabel>;
      case "sub":
        return (
          <ContextMenuSub key={index}>
            <ContextMenuSubTrigger disabled={action.disabled}>
              {action.icon} {action.label}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">{renderContext(action.items)}</ContextMenuSubContent>
          </ContextMenuSub>
        );
      case "item":
        return (
          <ContextMenuItem key={index} onSelect={action.onSelect} disabled={action.disabled} variant={action.destructive ? "destructive" : "default"}>
            {action.icon} {action.label}
            {action.hint && <span className="ml-auto text-2xs text-muted-foreground">{action.hint}</span>}
          </ContextMenuItem>
        );
    }
  });
}

/** Renders the same actions inside a "…" dropdown. */
export function renderDropdown(actions: MenuAction[]): React.ReactNode {
  return actions.map((action, index) => {
    switch (action.type) {
      case "separator":
        return <DropdownMenuSeparator key={index} />;
      case "label":
        return <DropdownMenuLabel key={index}>{action.label}</DropdownMenuLabel>;
      case "sub":
        return (
          <DropdownMenuSub key={index}>
            <DropdownMenuSubTrigger disabled={action.disabled}>
              {action.icon} {action.label}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">{renderDropdown(action.items)}</DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      case "item":
        return (
          <DropdownMenuItem key={index} onSelect={action.onSelect} disabled={action.disabled} variant={action.destructive ? "destructive" : "default"}>
            {action.icon} {action.label}
            {action.hint && <span className="ml-auto text-2xs text-muted-foreground">{action.hint}</span>}
          </DropdownMenuItem>
        );
    }
  });
}

export interface RowMenuProps {
  /** Accessible name for the hover button, e.g. "Options for Brand". */
  label: string;
  actions: MenuAction[];
  children: React.ReactNode;
  className?: string;
  /** Hide the hover button (context menu still works). */
  hideButton?: boolean;
}

/**
 * Wraps a sidebar row so it gets a right-click context menu and a hover-revealed
 * "…" button that opens the same actions.
 */
export function RowMenu({ label, actions, children, className, hideButton }: RowMenuProps) {
  const [open, setOpen] = React.useState(false);
  if (actions.length === 0) return <>{children}</>;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("group/menu relative flex min-w-0 items-center", className)}>
          <div className="min-w-0 flex-1">{children}</div>
          {!hideButton && (
            <DropdownMenu open={open} onOpenChange={setOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={label}
                  className={cn(
                    "absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-hover/menu:opacity-100",
                    open && "opacity-100",
                  )}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right" className="w-52">
                {renderDropdown(actions)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">{renderContext(actions)}</ContextMenuContent>
    </ContextMenu>
  );
}

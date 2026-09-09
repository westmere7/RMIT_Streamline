"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { MenuAction } from "@/components/layout/row-menu";
import { cn } from "@/lib/utils";

/**
 * A `MenuAction[]` as a bottom sheet, for phones.
 *
 * The same declarations the right-click menu and the "…" dropdown are built
 * from, so a board, group or item offers exactly the same actions on a phone as
 * on a desktop and there is one list to keep current. Sub-menus become a second
 * level with a back arrow rather than a fly-out, which has nowhere to fly to on
 * a 375px screen.
 */
export function MenuSheet({ open, onOpenChange, title, actions }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; actions: MenuAction[] }) {
  const [path, setPath] = React.useState<number[]>([]);

  // Reopening starts at the top again; the stack is per-visit, not remembered.
  // Adjusted during render rather than in an effect, so the sheet never paints
  // one frame of the wrong level — and reset on the way in, not on the way out,
  // so the list does not change under the closing animation.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setPath([]);
  }

  let shown = actions;
  let heading = title;
  for (const index of path) {
    const step = shown[index];
    if (step?.type !== "sub" || !step.items) break;
    shown = step.items;
    heading = step.label;
  }

  const run = (action: () => void) => {
    onOpenChange(false);
    // After the sheet has released focus, so a field opened by the action is not
    // mounted into a closing focus trap — the same reason useMenuFocusGuard
    // exists. A timeout rather than an animation frame: frames stop arriving in
    // a hidden or backgrounded tab, and the action would never run at all.
    setTimeout(action, 0);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={heading}>
        {path.length > 0 && (
          <button type="button" onClick={() => setPath((p) => p.slice(0, -1))} className="mb-1 flex min-h-11 items-center gap-1 text-[13px] font-medium text-muted-foreground active:text-foreground">
            <ChevronLeft className="size-4" /> Back
          </button>
        )}
        <div role="menu" className="flex flex-col pb-1">
          {shown.map((action, index) => {
            if (action.type === "separator") return <span key={index} aria-hidden className="my-1 h-px bg-border/70" />;
            if (action.type === "label")
              return (
                <h3 key={index} className="px-2 pt-3 pb-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {action.label}
                </h3>
              );
            if (action.type === "sub") {
              // A panel sub-menu (a colour picker, say) has no list to drill into: show it inline.
              if (!action.items)
                return (
                  <section key={index} className="px-2 py-2">
                    <h3 className="pb-1.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{action.label}</h3>
                    {action.content}
                  </section>
                );
              return (
                <button
                  key={index}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={() => setPath((p) => [...p, index])}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-2 text-left text-[15px] active:bg-accent/70 disabled:opacity-50"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{action.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
                </button>
              );
            }
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => run(action.onSelect)}
                data-testid={action.testId}
                className={cn("flex min-h-12 items-center gap-3 rounded-lg px-2 text-left text-[15px] active:bg-accent/70 disabled:opacity-50", action.destructive && "text-destructive")}
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4">{action.icon}</span>
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.hint && <span className="shrink-0 text-2xs text-muted-foreground">{action.hint}</span>}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

import { GripVertical } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The controls every part of the form editor is built from. */

/**
 * A box for one line of the form's wording.
 *
 * It is styled like the text it stands for — a heading's box is heading-sized,
 * a hint's box is hint-sized — but it is visibly a box: a faint edge at rest, a
 * firmer one under the cursor, the ring on focus. An earlier version hid the
 * edge until hovered, which made the page read as the form and made finding
 * what could be edited a matter of sweeping the cursor over everything.
 */
export function TextBox({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
  testId,
  multiline,
  rows,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  testId?: string;
  multiline?: boolean;
  rows?: number;
}) {
  const classes = cn(
    "block w-full rounded-md border border-border/50 bg-transparent px-2 py-1 text-inherit outline-none transition-colors placeholder:text-muted-foreground/60 hover:border-border focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20",
    className,
  );
  if (multiline) return <textarea value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} rows={rows ?? 2} className={cn(classes, "resize-y")} data-testid={testId} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} className={classes} data-testid={testId} />;
}

/**
 * One editable part of the form: a card with a quiet title bar.
 *
 * The bar carries the name of the thing and whatever controls it needs — a
 * switch, a menu, the duplicate and remove buttons — all of them shown all the
 * time. Nothing here waits for a hover.
 */
export function EditorSection({
  title,
  aside,
  children,
  className,
  bodyClassName,
  headerClassName,
  testId,
  innerRef,
  style,
}: {
  title?: React.ReactNode;
  /** Controls on the right of the title bar. */
  aside?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Extra classes for the title bar — a follow-up tints its own in the colour of the choice that opens it. */
  headerClassName?: string;
  testId?: string;
  innerRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
}) {
  return (
    <section ref={innerRef} style={style} className={cn("rounded-xl border border-border/70 bg-card", className)} data-testid={testId}>
      {(title || aside) && (
        <header className={cn("flex min-h-9 items-center gap-2 rounded-t-xl border-b border-border/60 bg-surface/40 px-2.5 py-1", headerClassName)}>
          <div className="flex min-w-0 flex-1 items-center gap-1.5 label-quiet">{title}</div>
          {aside && <div className="flex shrink-0 items-center gap-1">{aside}</div>}
        </header>
      )}
      {children ? <div className={cn("grid gap-2 p-3", bodyClassName)}>{children}</div> : null}
    </section>
  );
}

/** The grip that starts a drag. Always visible; quiet until it is wanted. */
export function DragHandle({
  label,
  testId,
  setRef,
  listeners,
  attributes,
  className,
}: {
  label: string;
  testId?: string;
  setRef?: (node: HTMLElement | null) => void;
  /** dnd-kit's own handle props, passed straight through. */
  listeners?: React.DOMAttributes<HTMLElement>;
  attributes?: React.HTMLAttributes<HTMLElement>;
  className?: string;
}) {
  return (
    <button
      ref={setRef}
      type="button"
      aria-label={label}
      className={cn("flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing", className)}
      data-testid={testId}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

/** A small icon button in a section's title bar. */
export function Handle({ label, onClick, disabled, destructive, testId, children }: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("text-muted-foreground", destructive && "hover:text-destructive")} data-testid={testId}>
      {children}
    </Button>
  );
}

/** A few options, one of them chosen: the pill group used wherever a select would be too much. */
export function Segmented<T extends string>({ options, value, onChange, label, testId }: { options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (value: T) => void; label: string; testId?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center rounded-full border border-border/70 p-0.5" data-testid={testId}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("h-6 rounded-full px-2.5 text-2xs font-medium transition-colors", value === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          data-testid={testId ? `${testId}-${option.value}` : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

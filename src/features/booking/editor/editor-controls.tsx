"use client";

import { GripVertical } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The two controls every part of the form editor is built from. */

/** Text that stays text until it is clicked: a borderless box that shows its edge on hover and focus. */
export function TextBox({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
  testId,
  multiline,
  rows,
  quiet,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  testId?: string;
  multiline?: boolean;
  rows?: number;
  /**
   * For a box whose words are not on the form at this spot — an empty hint, or
   * one that will be shown inside the control or behind a question mark.
   *
   * It keeps its place in the layout but stays invisible until the block is
   * approached, so at rest the page is the form and not a form with its own
   * scaffolding printed next to it.
   */
  quiet?: boolean;
}) {
  const classes = cn(
    "-mx-1.5 block w-[calc(100%+0.75rem)] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-inherit outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-ring focus:bg-background",
    quiet && "opacity-0 transition-opacity group-hover/frame:opacity-100 focus:opacity-100",
    className,
  );
  if (multiline) return <textarea value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} rows={rows ?? 2} className={cn(classes, "resize-y")} data-testid={testId} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} className={classes} data-testid={testId} />;
}

/**
 * The frame every editable part of the form wears.
 *
 * The form is drawn as the stakeholder will meet it, so the handles that only
 * an editor needs — reorder, duplicate, remove, required, where a description
 * goes — cannot sit in the layout without turning the picture into a
 * description of one. They ride in a strip pinned to the top edge of the frame
 * that appears under the cursor and whenever anything inside has focus, which
 * is also what makes the whole thing reachable from the keyboard.
 */
export function EditorFrame({
  chrome,
  handle,
  children,
  className,
  testId,
  innerRef,
  style,
}: {
  chrome?: React.ReactNode;
  /** A drag handle, placed in the margin so it is beside the form and not in it. */
  handle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  testId?: string;
  innerRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div
      ref={innerRef}
      style={style}
      // The top band is empty on purpose: it is where the strip of handles
      // appears, so it never covers the question it belongs to and nothing
      // moves when it does.
      className={cn("group/frame relative rounded-xl border border-transparent px-3 pt-5 pb-2.5 transition-colors hover:border-border/70 hover:bg-surface/30 focus-within:border-border/70", className)}
      data-testid={testId}
    >
      {handle}
      {chrome && (
        <div className="pointer-events-none absolute top-0 right-2 z-[2] flex items-center gap-1 rounded-lg border border-border bg-card px-1.5 py-0.5 opacity-0 shadow-xs transition-opacity group-hover/frame:pointer-events-auto group-hover/frame:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
          {chrome}
        </div>
      )}
      {children}
    </div>
  );
}

/** The grip that starts a drag, in the frame's left margin. */
export function DragHandle({
  label,
  testId,
  setRef,
  listeners,
  attributes,
}: {
  label: string;
  testId?: string;
  setRef?: (node: HTMLElement | null) => void;
  /** dnd-kit's own handle props, passed straight through. */
  listeners?: React.DOMAttributes<HTMLElement>;
  attributes?: React.HTMLAttributes<HTMLElement>;
}) {
  return (
    <button
      ref={setRef}
      type="button"
      aria-label={label}
      className="absolute top-5 -left-5 flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity group-hover/frame:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
      data-testid={testId}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );
}

export function Handle({ label, onClick, disabled, testId, children }: { label: string; onClick: () => void; disabled?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="text-muted-foreground" data-testid={testId}>
      {children}
    </Button>
  );
}

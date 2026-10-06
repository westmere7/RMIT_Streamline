"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface InlineEditProps {
  value: string;
  onSubmit: (value: string) => void;
  /** Whether the field is currently in edit mode (controlled). */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  /** Renders the display value. Defaults to plain text. */
  children?: React.ReactNode;
  /** How to enter edit mode. */
  trigger?: "click" | "doubleClick";
  disabled?: boolean;
  ariaLabel?: string;
  selectOnFocus?: boolean;
}

/**
 * Text that looks like a display value until interacted with. Enter submits,
 * Escape cancels, blur submits.
 */
export function InlineEdit({
  value,
  onSubmit,
  editing,
  onEditingChange,
  className,
  inputClassName,
  placeholder,
  children,
  trigger = "click",
  disabled,
  ariaLabel,
  selectOnFocus = true,
}: InlineEditProps) {
  const [draft, setDraft] = React.useState(value);
  const [wasEditing, setWasEditing] = React.useState(editing);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Re-seed the draft from the current value whenever editing starts (render-time sync).
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) setDraft(value);
  }

  const settling = useEditFocus(editing, inputRef, selectOnFocus);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSubmit(next);
    onEditingChange(false);
  };

  if (editing && !disabled) {
    return (
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          // Focus taken away as a menu closes is not the person leaving the field.
          if (settling()) return;
          commit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onEditingChange(false);
          }
        }}
        className={cn(
          "h-full w-full min-w-0 rounded-sm border border-ring bg-background px-1.5 text-inherit outline-none",
          inputClassName,
        )}
      />
    );
  }

  const handlers = disabled
    ? {}
    : trigger === "click"
      ? { onClick: () => onEditingChange(true) }
      : { onDoubleClick: () => onEditingChange(true) };

  return (
    <span
      {...handlers}
      {...(disabled || trigger !== "click"
        ? {}
        : {
            role: "button",
            tabIndex: 0,
            "aria-label": ariaLabel ? `Edit ${ariaLabel.toLowerCase()}` : undefined,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === "F2") {
                e.preventDefault();
                onEditingChange(true);
              }
            },
          })}
      className={cn("block min-w-0 truncate", !disabled && "cursor-text", className)}
      title={typeof children === "string" ? children : value}
    >
      {children ?? value}
    </span>
  );
}

/**
 * Puts the caret in a field that has just opened for editing, and keeps it there.
 *
 * A rename is often started from a menu, and a closing menu hands focus back to
 * the button that opened it a moment later, after its exit animation. Focused
 * once, the field would lose it straight away; its blur would then end the edit
 * before a key was pressed. So focus is placed again until it holds, and for
 * the first half second a blur is treated as that hand-back, not as leaving:
 * the returned function says whether a blur now is one to ignore.
 */
export function useEditFocus(editing: boolean, inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>, selectOnFocus = true): () => boolean {
  const openedAt = React.useRef(0);
  React.useEffect(() => {
    if (!editing) return;
    openedAt.current = Date.now();
    let selected = false;
    const place = () => {
      const input = inputRef.current;
      if (!input || document.activeElement === input) return;
      input.focus({ preventScroll: true });
      if (selectOnFocus && !selected) {
        input.select();
        selected = true;
      }
    };
    const frame = requestAnimationFrame(place);
    const timers = [60, 160, 320, 480].map((ms) => window.setTimeout(place, ms));
    return () => {
      cancelAnimationFrame(frame);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [editing, inputRef, selectOnFocus]);
  return React.useCallback(() => {
    if (Date.now() - openedAt.current > 500) return false;
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return true;
  }, [inputRef]);
}

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
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (selectOnFocus) inputRef.current?.select();
      });
    }
  }, [editing, value, selectOnFocus]);

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
        onBlur={commit}
        onKeyDown={(e) => {
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
      className={cn("block min-w-0 truncate", !disabled && "cursor-text", className)}
      title={typeof children === "string" ? children : value}
    >
      {children ?? value}
    </span>
  );
}

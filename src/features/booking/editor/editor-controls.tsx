"use client";

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
    "-mx-1.5 block w-[calc(100%+0.75rem)] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-inherit outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-ring focus:bg-background",
    className,
  );
  if (multiline) return <textarea value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} rows={rows ?? 2} className={cn(classes, "resize-y")} data-testid={testId} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} className={classes} data-testid={testId} />;
}

export function Handle({ label, onClick, disabled, testId, children }: { label: string; onClick: () => void; disabled?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="text-muted-foreground" data-testid={testId}>
      {children}
    </Button>
  );
}

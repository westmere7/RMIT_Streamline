"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Extra content between description and footer (e.g. a "type to confirm" input). */
  children?: React.ReactNode;
  confirmDisabled?: boolean;
}

/** Reusable confirmation dialog for archive/delete style actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  /*
   * These confirmations are usually opened from a dropdown or context menu. When
   * a menu and a dialog overlap like that, Radix can leave `pointer-events: none`
   * on <body> after the menu unmounts, which makes the dialog visible but dead:
   * Confirm and Cancel both stop responding. Clearing it while the dialog is open
   * keeps the buttons clickable; the dialog has its own focus trap and overlay,
   * so nothing behind it becomes reachable.
   */
  React.useEffect(() => {
    if (!open) return;
    const clear = () => {
      if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
    };
    clear();
    const frame = requestAnimationFrame(clear);
    return () => {
      cancelAnimationFrame(frame);
      clear();
    };
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} data-testid="confirm-cancel">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-action"
            disabled={pending || confirmDisabled}
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

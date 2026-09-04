"use client";

import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Board } from "@/domain";

export function DeleteBoardDialog({
  board,
  open,
  onOpenChange,
  onConfirm,
}: {
  board: Board;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = React.useState("");
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange(next);
      }}
      title={`Delete “${board.name}”?`}
      description="This permanently deletes the board with all of its groups, items, updates and files. This cannot be undone."
      confirmLabel="Delete board"
      destructive
      confirmDisabled={typed.trim() !== board.name}
      onConfirm={onConfirm}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="delete-board-confirm">
          Type <span className="font-semibold">{board.name}</span> to confirm
        </Label>
        <Input id="delete-board-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="delete-board-confirm" />
      </div>
    </ConfirmDialog>
  );
}

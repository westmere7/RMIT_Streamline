"use client";

import { Archive, ArrowRight, Copy, Trash2, X } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useBoardContext } from "@/features/boards/board-context";
import { colorClasses } from "@/lib/colors";
import { cn, pluralize } from "@/lib/utils";
import { useBoardUi, useBoardUiStore } from "@/stores/board-ui-store";

export function BulkActionsBar() {
  const { board, model, mutations } = useBoardContext();
  const ui = useBoardUi(board.id);
  const clearSelection = useBoardUiStore((s) => s.clearSelection);
  const [confirm, setConfirm] = React.useState<"archive" | "delete" | null>(null);
  const ids = ui.selectedItemIds.filter((id) => model.itemById.has(id));

  // Escape drops the selection — the way out of a selection is the way out of
  // everything else. Only when there is nothing else for it to close first: a
  // menu, a dialog or a field being typed in all answer Escape before the
  // board does, and this bar is only mounted while something is selected.
  React.useEffect(() => {
    if (ids.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]')) return;
      clearSelection(board.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ids.length, board.id, clearSelection]);

  if (ids.length === 0) return null;

  const clear = () => clearSelection(board.id);

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        data-testid="bulk-actions"
        className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-border/70 bg-popover px-2.5 py-2 shadow-xl animate-in fade-in-0 slide-in-from-bottom-2"
      >
        <span className="flex h-7 items-center rounded-full bg-primary px-2.5 text-xs font-semibold text-white tabular">{ids.length}</span>
        <span className="mr-2 text-[13px]">{ids.length === 1 ? "item selected" : "items selected"}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <ArrowRight /> Move to
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            {model.groups.map((g) => (
              <DropdownMenuItem
                key={g.id}
                onSelect={() => {
                  void mutations.moveItemsToGroup(ids, g.id);
                  clear();
                }}
              >
                <span className={cn("size-2.5 rounded-full", colorClasses(g.color).dot)} /> {g.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            ids.forEach((id) => void mutations.duplicateItem(id));
            clear();
          }}
        >
          <Copy /> Duplicate
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm("archive")}>
          <Archive /> Archive
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirm("delete")}>
          <Trash2 /> Delete
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={clear}>
          <X />
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === "archive"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Archive ${pluralize(ids.length, "item")}?`}
        description="Archived items are hidden from the board. They can be restored from the data layer later."
        confirmLabel="Archive"
        onConfirm={async () => {
          await mutations.archiveItems(ids);
          clear();
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Delete ${pluralize(ids.length, "item")}?`}
        description="This permanently deletes the selected items, their subitems and updates."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await mutations.deleteItems(ids);
          clear();
        }}
      />
    </>
  );
}

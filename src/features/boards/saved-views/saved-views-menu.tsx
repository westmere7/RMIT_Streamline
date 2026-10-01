"use client";

import { Bookmark, Check, ChevronDown, Copy, Lock, Pencil, Plus, RotateCcw, Save, Trash2, Users } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_VIEW_NAME, SAVED_VIEW_NAME_MAX, type SavedBoardView } from "@/domain";
import { canChangeView, type SavedViewsController } from "@/features/boards/saved-views/saved-views";
import { cn } from "@/lib/utils";

type NameDialog = { mode: "new" } | { mode: "rename"; view: SavedBoardView } | { mode: "copy"; view: SavedBoardView };

/**
 * The board's saved views, beside the filters: which one is open, the Default
 * view, and everything done to the open one. Edited, it says so, and Save sits
 * beside it for whoever may save it. The Default view saves like the rest but
 * keeps its name, stays shared and cannot be deleted.
 */
export function SavedViewsMenu({ controller, compact = false }: { controller: SavedViewsController; compact?: boolean }) {
  const { views, active, onDefault, dirty, maySave, canEdit, userId } = controller;
  const [dialog, setDialog] = React.useState<NameDialog | null>(null);
  const [deleting, setDeleting] = React.useState<SavedBoardView | null>(null);
  const [saving, setSaving] = React.useState(false);
  // A view with a name of its own, as opposed to the Default view.
  const named = active && !active.isDefault ? active : null;
  const mayChange = !!named && canChangeView(named, userId, canEdit);
  const shared = views.filter((v) => v.shared);
  const own = views.filter((v) => !v.shared);
  // An unsaved Default view can be saved as it stands, changed or not.
  const canSave = maySave && (dirty || (onDefault && !active));
  const title = named ? named.name : DEFAULT_VIEW_NAME;
  // Not modal, so a dialog opened from it is the only thing holding the page.
  const later = (fn: () => void) => () => fn();

  const save = async () => {
    setSaving(true);
    try {
      await controller.saveChanges();
    } catch {
      // the controller has said why
    } finally {
      setSaving(false);
    }
  };

  const row = (view: SavedBoardView) => (
    <DropdownMenuItem key={view.id} onSelect={() => controller.open(view)} data-testid="saved-view-option" data-view-name={view.name}>
      {view.shared ? <Users /> : <Lock />}
      <span className="min-w-0 flex-1 truncate">{view.name}</span>
      {active?.id === view.id && dirty && <span className="text-2xs text-amber-600 dark:text-amber-400">Edited</span>}
      {active?.id === view.id && <Check className="size-3.5" />}
    </DropdownMenuItem>
  );

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "max-w-56 shrink-0 rounded-full",
              // On a phone it is one of the tool chips, and looks it.
              compact && "h-11 max-w-44 border px-3 text-[13px]",
              compact && !named && "border-border/70 text-muted-foreground",
              named && (compact ? "border-ring bg-accent-soft/60 text-accent-soft-foreground" : "state-on hover:bg-accent-soft hover:text-accent-soft-foreground"),
            )}
            aria-label={`Saved views: ${title}${dirty ? ", edited" : ""}`}
            data-testid="saved-views-button"
          >
            <Bookmark className={cn(named && "fill-current")} />
            {/* Always the view on screen, the Default view included, so Save beside it says what it saves. */}
            <span className="truncate">{title}</span>
            {dirty && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" data-testid="saved-view-edited" />}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72" data-testid="saved-views-menu">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => controller.open(null)} data-testid="saved-view-default">
            <Bookmark />
            <span className="flex-1">{DEFAULT_VIEW_NAME}</span>
            {onDefault && dirty && <span className="text-2xs text-amber-600 dark:text-amber-400">Edited</span>}
            {onDefault && <Check className="size-3.5" />}
          </DropdownMenuItem>
          {shared.length > 0 && <DropdownMenuLabel className="pt-2 text-2xs font-medium text-muted-foreground uppercase">Shared</DropdownMenuLabel>}
          {shared.map(row)}
          {own.length > 0 && <DropdownMenuLabel className="pt-2 text-2xs font-medium text-muted-foreground uppercase">Only you</DropdownMenuLabel>}
          {own.map(row)}

          {(named || maySave || dirty) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="truncate text-2xs font-medium text-muted-foreground">{title}</DropdownMenuLabel>
              {maySave && (
                <DropdownMenuItem disabled={!canSave || saving} onSelect={() => void save()} data-testid="saved-view-save">
                  <Save /> Save changes
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={!dirty} onSelect={() => controller.discard()} data-testid="saved-view-discard">
                <RotateCcw /> Discard changes
              </DropdownMenuItem>
              {mayChange && named && (
                <DropdownMenuItem onSelect={later(() => setDialog({ mode: "rename", view: named }))} data-testid="saved-view-rename">
                  <Pencil /> Rename…
                </DropdownMenuItem>
              )}
              {active && (
                <DropdownMenuItem onSelect={later(() => setDialog({ mode: "copy", view: active }))} data-testid="saved-view-duplicate">
                  <Copy /> Duplicate…
                </DropdownMenuItem>
              )}
              {mayChange && named && canEdit && (
                <DropdownMenuItem onSelect={() => void controller.update(named, { shared: !named.shared }).catch(() => undefined)} data-testid="saved-view-share">
                  {named.shared ? <Lock /> : <Users />} {named.shared ? "Make private" : "Share with the board"}
                </DropdownMenuItem>
              )}
              {mayChange && named && (
                <DropdownMenuItem variant="destructive" onSelect={later(() => setDeleting(named))} data-testid="saved-view-delete">
                  <Trash2 /> Delete…
                </DropdownMenuItem>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={later(() => setDialog({ mode: "new" }))} data-testid="saved-view-new">
            <Plus /> Save as new view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dirty && maySave && (
        <Button variant="outline" size="sm" className="shrink-0 rounded-full" disabled={saving} onClick={() => void save()} data-testid="saved-view-save-button">
          <Save /> Save
        </Button>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-sm" data-testid="saved-view-dialog">
          {dialog && <NameForm dialog={dialog} controller={controller} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "view"}?`}
        description={deleting?.shared ? "It goes for everyone on the board." : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (deleting) await controller.remove(deleting).catch(() => undefined);
          setDeleting(null);
        }}
      />
    </>
  );
}

function NameForm({ dialog, controller, onDone }: { dialog: NameDialog; controller: SavedViewsController; onDone: () => void }) {
  const { canEdit } = controller;
  const initialName = dialog.mode === "new" ? "" : dialog.mode === "rename" ? dialog.view.name : `${dialog.view.name} copy`.slice(0, SAVED_VIEW_NAME_MAX);
  const [name, setName] = React.useState(initialName);
  const [shared, setShared] = React.useState(dialog.mode === "new" ? false : dialog.view.shared && canEdit);
  const [pending, setPending] = React.useState(false);
  const title = dialog.mode === "new" ? "Save view" : dialog.mode === "rename" ? "Rename view" : "Duplicate view";

  const submit = async () => {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      if (dialog.mode === "new") await controller.create(name, shared);
      else if (dialog.mode === "copy") await controller.create(name, shared, dialog.view.config);
      else await controller.update(dialog.view, { name, shared });
      onDone();
    } catch {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="saved-view-name">Name</Label>
        <Input id="saved-view-name" autoFocus value={name} maxLength={SAVED_VIEW_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="e.g. This sprint" data-testid="saved-view-name" />
      </div>
      {canEdit && (
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={shared} onCheckedChange={(checked) => setShared(checked === true)} data-testid="saved-view-shared" />
          Share with everyone on this board
        </label>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!name.trim() || pending} data-testid="saved-view-submit">
          {dialog.mode === "rename" ? "Save" : "Save view"}
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ColorPicker } from "@/components/shared/color-picker";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DEFAULT_TOOLBAR_BUTTON_ICON,
  MAX_QUICK_RUN_ITEMS,
  newToolbarCommand,
  TOOLBAR_BUTTON_LABEL_MAX,
  TOOLBAR_BUTTONS_MAX,
  TOOLBAR_COMMAND_LABELS,
  TOOLBAR_SCOPE_COMMANDS,
  TOOLBAR_SCOPE_LABELS,
  TOOLBAR_SCOPES,
  toolbarCommandIncomplete,
  toolbarSlot,
  buttonActionIncomplete,
  type AutomationRule,
  type ToolbarButton,
  type ToolbarCommandKind,
  type ToolbarScope,
  type ToolbarSlot,
} from "@/domain";
import { AutomationsDialog, RunPicker } from "@/features/automations/automations-dialog";
import { useQuickRun, useRuleVocabulary } from "@/features/automations/hooks";
import { useBoardContext } from "@/features/boards/board-context";
import { useButtonPress } from "@/features/boards/button-column";
import { StepsEditor } from "@/features/boards/components/dialogs/button-settings-dialog";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { SavedViewsContext } from "@/features/boards/saved-views/saved-views";
import { useServices } from "@/features/data/data-context";
import { colorClasses } from "@/lib/colors";
import { newId } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { useBoardUi } from "@/stores/board-ui-store";

/**
 * The toolbar's first button, a slot.
 *
 * New item is always there and never changes. Beside it a board manager can
 * make buttons of the board's own: a label, an icon and a colour first, where
 * it shows, then what it does. With nothing ticked a button can run a quick
 * run, open a saved view or a link; one for ticked tasks takes the slot while
 * any are ticked and runs steps or a quick run on them. One of each is chosen
 * for everyone; the arrow beside it is where they are made, chosen, edited
 * and deleted.
 */
export function PrimaryActionSlot({ newItem }: { newItem: React.ReactNode }) {
  const { board, model, canEdit, canManage } = useBoardContext();
  const services = useServices();
  const actions = useBoardActions(board);
  const savedViews = React.useContext(SavedViewsContext);
  const slot = toolbarSlot(board.primaryAction);
  const boardActive = slot.buttons.find((b) => b.id === slot.activeId) ?? null;
  const selectionActive = slot.buttons.find((b) => b.id === slot.selectionActiveId) ?? null;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ToolbarButton | "new" | null>(null);
  const [picking, setPicking] = React.useState<AutomationRule | null>(null);
  const [managing, setManaging] = React.useState(false);
  const selected = useBoardUi(board.id).selectedItemIds;
  const tickedCount = selected.filter((id) => model.itemById.has(id)).length;
  // Ticked tasks bring their own button, when the board has chosen one.
  const active = tickedCount > 0 && selectionActive ? selectionActive : boardActive;
  const run = useQuickRun(board.id);
  const steps = useButtonPress();
  const vocabulary = useRuleVocabulary(model.columns, model.groups);

  // The automations screens' cache, without their live channel, and only when
  // a button needs the quick runs: one in the slot, or the editor open.
  const rules = useQuery({
    queryKey: queryKeys.automations(board.id),
    queryFn: () => services.automations.listByBoard(board.id),
    staleTime: 60_000,
    enabled: canEdit && (boardActive?.command.kind === "quick_run" || selectionActive?.command.kind === "quick_run" || editing !== null),
  });
  const quickRuns = (rules.data ?? []).filter((r) => r.trigger.kind === "manual");

  const save = (next: ToolbarSlot) => actions.updateBoard.mutate({ primaryAction: next.buttons.length || next.activeId || next.selectionActiveId ? next : null });
  const remove = (id: string) =>
    save({ buttons: slot.buttons.filter((b) => b.id !== id), activeId: slot.activeId === id ? null : slot.activeId, selectionActiveId: slot.selectionActiveId === id ? null : slot.selectionActiveId });
  const option = (b: ToolbarButton, chosen: boolean, choose: () => void) => (
    <DropdownMenuItem key={b.id} onSelect={choose} data-testid="primary-action-option" data-button-label={b.label}>
      <DynamicIcon name={b.icon} className={colorClasses(b.color).text} /> <span className="min-w-0 flex-1 truncate">{b.label}</span>
      {chosen && <Check className="size-3.5" />}
    </DropdownMenuItem>
  );
  const ticked = () =>
    selected
      .map((id) => model.itemById.get(id))
      .filter((i): i is NonNullable<typeof i> => !!i)
      .slice(0, MAX_QUICK_RUN_ITEMS);

  const press = (button: ToolbarButton) => {
    const command = button.command;
    switch (command.kind) {
      case "steps": {
        const items = ticked();
        if (items.length === 0) return void toast.message(`Tick the tasks to ${button.label.toLowerCase()} first.`);
        void steps.runOnItems(items, command.actions.filter((a) => !buttonActionIncomplete(a)), button.label);
        return;
      }
      case "quick_run": {
        const rule = quickRuns.find((r) => r.id === command.ruleId);
        if (!rule) return void toast.error("That quick run is not on this board any more.");
        const needsTask = rule.actions.some((a) => a.kind !== "notify" && a.kind !== "create_item");
        const items = ticked();
        if (items.length > 0) run.mutate({ ruleId: rule.id, itemIds: items.map((i) => i.id) });
        else if (!needsTask) run.mutate({ ruleId: rule.id, itemIds: [] });
        else setPicking(rule);
        return;
      }
      case "open_view": {
        const view = savedViews?.views.find((v) => v.id === command.viewId) ?? (savedViews?.defaultView?.id === command.viewId ? savedViews.defaultView : null);
        if (!view || !savedViews) return void toast.error("That saved view is not on this board any more.");
        savedViews.open(view);
        return;
      }
      case "open_link":
        window.open(command.url.trim(), "_blank", "noopener,noreferrer");
        return;
    }
  };

  if (!canEdit) return null;
  const busy = run.isPending || steps.running === "toolbar";

  return (
    <>
      <div className="flex shrink-0 items-center">
        {active ? (
          <Button
            size="sm"
            className={cn(colorClasses(active.color).solid, colorClasses(active.color).solidHover, canManage && "rounded-r-none")}
            onClick={() => press(active)}
            disabled={busy}
            data-testid="primary-action-run"
          >
            <DynamicIcon name={active.icon} /> <span className="max-w-36 truncate">{active.label}</span>
            {(active.command.kind === "steps" || active.command.kind === "quick_run") && tickedCount > 0 && (
              <span className="rounded-full bg-white/25 px-1.5 text-2xs tabular">{Math.min(tickedCount, MAX_QUICK_RUN_ITEMS)}</span>
            )}
          </Button>
        ) : (
          <span className={cn(canManage && "[&_button]:rounded-r-none")}>{newItem}</span>
        )}
        {canManage && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className={cn("rounded-l-none border-l border-white/20 px-1.5", active && colorClasses(active.color).solid, active && colorClasses(active.color).solidHover)} aria-label="Choose this button" data-testid="primary-action-menu">
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>When nothing is ticked</DropdownMenuLabel>
              {/* Always here and never edited: the board's own way to add a task. */}
              <DropdownMenuItem onSelect={() => save({ ...slot, activeId: null })} data-testid="primary-action-new-item">
                <Plus /> <span className="flex-1">New item</span>
                {!boardActive && <Check className="size-3.5" />}
              </DropdownMenuItem>
              {slot.buttons.filter((b) => b.scope === "board").map((b) => option(b, boardActive?.id === b.id, () => save({ ...slot, activeId: b.id })))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>When tasks are ticked</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => save({ ...slot, selectionActiveId: null })} data-testid="primary-action-selection-none">
                <span className="flex-1 pl-6 text-muted-foreground">Same as above</span>
                {!selectionActive && <Check className="size-3.5" />}
              </DropdownMenuItem>
              {slot.buttons.filter((b) => b.scope === "selection").map((b) => option(b, selectionActive?.id === b.id, () => save({ ...slot, selectionActiveId: b.id })))}
              <DropdownMenuSeparator />
              {slot.buttons.length < TOOLBAR_BUTTONS_MAX && (
                <DropdownMenuItem onSelect={() => setEditing("new")} data-testid="primary-action-new-button">
                  <Plus /> New button…
                </DropdownMenuItem>
              )}
              {[boardActive, selectionActive].filter((b): b is ToolbarButton => !!b).map((b) => (
                <React.Fragment key={b.id}>
                  <DropdownMenuItem onSelect={() => setEditing(b)} data-testid="primary-action-edit">
                    <Pencil /> Edit {b.label}…
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => remove(b.id)} data-testid="primary-action-delete">
                    <Trash2 /> Delete {b.label}
                  </DropdownMenuItem>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined} data-testid="toolbar-button-dialog">
          {editing !== null && (
            <ToolbarButtonForm
              initial={editing === "new" ? null : editing}
              initialScope={tickedCount > 0 ? "selection" : "board"}
              quickRuns={quickRuns}
              quickRunsLoading={rules.isLoading}
              views={savedViews ? [...(savedViews.defaultView ? [savedViews.defaultView] : []), ...savedViews.views] : []}
              onManageQuickRuns={() => setManaging(true)}
              onCancel={() => setEditing(null)}
              onSave={(button) => {
                const exists = slot.buttons.some((b) => b.id === button.id);
                const buttons = exists ? slot.buttons.map((b) => (b.id === button.id ? button : b)) : [...slot.buttons, button];
                // Chosen where it now belongs, and taken out of the place it left.
                save({
                  buttons,
                  activeId: button.scope === "board" ? button.id : slot.activeId === button.id ? null : slot.activeId,
                  selectionActiveId: button.scope === "selection" ? button.id : slot.selectionActiveId === button.id ? null : slot.selectionActiveId,
                });
                setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!picking} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{picking?.name ?? "Quick run"}</DialogTitle>
          {picking && <RunPicker rule={picking} items={model.snapshot.items} groups={model.groups} boardId={board.id} vocabulary={vocabulary} onDone={() => setPicking(null)} />}
        </DialogContent>
      </Dialog>

      {canManage && <AutomationsDialog board={board} canManage open={managing} onOpenChange={setManaging} />}
    </>
  );
}

/** A button of the board's own: how it looks first, then what it does. */
function ToolbarButtonForm({
  initial,
  initialScope,
  quickRuns,
  quickRunsLoading,
  views,
  onManageQuickRuns,
  onCancel,
  onSave,
}: {
  initial: ToolbarButton | null;
  initialScope: ToolbarScope;
  quickRuns: AutomationRule[];
  quickRunsLoading: boolean;
  views: Array<{ id: string; name: string }>;
  onManageQuickRuns: () => void;
  onCancel: () => void;
  onSave: (button: ToolbarButton) => void;
}) {
  const [draft, setDraft] = React.useState<ToolbarButton>(
    () => initial ?? { id: newId(), label: "", color: "blue", icon: DEFAULT_TOOLBAR_BUTTON_ICON, scope: initialScope, command: newToolbarCommand(TOOLBAR_SCOPE_COMMANDS[initialScope][0]!) },
  );
  const kinds = TOOLBAR_SCOPE_COMMANDS[draft.scope];
  const setScope = (scope: ToolbarScope) =>
    setDraft((d) => ({ ...d, scope, command: TOOLBAR_SCOPE_COMMANDS[scope].includes(d.command.kind) ? d.command : newToolbarCommand(TOOLBAR_SCOPE_COMMANDS[scope][0]!) }));
  const set = (patch: Partial<ToolbarButton>) => setDraft((d) => ({ ...d, ...patch }));
  const command = draft.command;
  const ready = draft.label.trim() !== "" && !toolbarCommandIncomplete(command);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSave({ ...draft, label: draft.label.trim().slice(0, TOOLBAR_BUTTON_LABEL_MAX) });
      }}
    >
      <DialogHeader>
        <DialogTitle>{initial ? `Edit ${initial.label}` : "New button"}</DialogTitle>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="toolbar-button-label">Label</Label>
            <span className={cn("text-2xs tabular", draft.label.length >= TOOLBAR_BUTTON_LABEL_MAX ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} data-testid="toolbar-button-label-count">
              {draft.label.length}/{TOOLBAR_BUTTON_LABEL_MAX}
            </span>
          </div>
          <Input id="toolbar-button-label" autoFocus value={draft.label} maxLength={TOOLBAR_BUTTON_LABEL_MAX} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Send to print" data-testid="toolbar-button-label" />
        </div>
        <div className="space-y-1.5">
          <Label>Preview</Label>
          <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-border/80 px-3">
            <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium", colorClasses(draft.color).solid)}>
              <DynamicIcon name={draft.icon} className="size-4" /> <span className="max-w-36 truncate">{draft.label.trim() || "Button"}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Icon</Label>
          <IconPicker value={draft.icon} onChange={(icon) => set({ icon })} />
        </div>
        <div className="space-y-1.5">
          <Label>Colour</Label>
          <ColorPicker value={draft.color} onChange={(color) => set({ color })} className="grid-cols-6" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Shows</Label>
        <div role="radiogroup" aria-label="Shows" className="flex w-fit gap-1 rounded-lg bg-surface p-0.5" data-testid="toolbar-button-scope">
          {TOOLBAR_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              role="radio"
              aria-checked={draft.scope === scope}
              onClick={() => setScope(scope)}
              className={cn("h-7 rounded-md px-2.5 text-xs font-medium", draft.scope === scope ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {TOOLBAR_SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>When pressed</Label>
        <Select value={command.kind} onValueChange={(kind) => set({ command: newToolbarCommand(kind as ToolbarCommandKind) })}>
          <SelectTrigger className="w-72" data-testid="toolbar-button-command">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {TOOLBAR_COMMAND_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {command.kind === "steps" && <StepsEditor actions={command.actions} onChange={(next) => set({ command: { kind: "steps", actions: next } })} />}

        {command.kind === "quick_run" &&
          (quickRuns.length > 0 ? (
            <Select value={command.ruleId ?? ""} onValueChange={(ruleId) => set({ command: { kind: "quick_run", ruleId } })}>
              <SelectTrigger className="w-72" data-testid="toolbar-button-quick-run">
                <SelectValue placeholder="Pick a quick run" />
              </SelectTrigger>
              <SelectContent>
                {quickRuns.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {quickRunsLoading ? "Loading…" : "No quick runs on this board yet."}
              {!quickRunsLoading && (
                <Button type="button" variant="outline" size="sm" onClick={onManageQuickRuns}>
                  <Settings2 /> Make a quick run…
                </Button>
              )}
            </p>
          ))}

        {command.kind === "open_view" &&
          (views.length > 0 ? (
            <Select value={command.viewId ?? ""} onValueChange={(viewId) => set({ command: { kind: "open_view", viewId } })}>
              <SelectTrigger className="w-72" data-testid="toolbar-button-view">
                <SelectValue placeholder="Pick a saved view" />
              </SelectTrigger>
              <SelectContent>
                {views.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    {view.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-[13px] text-muted-foreground">No saved views on this board yet. Save one from Saved views beside the filters.</p>
          ))}

        {command.kind === "open_link" && (
          <Input value={command.url} onChange={(e) => set({ command: { kind: "open_link", url: e.target.value } })} placeholder="https://" data-testid="toolbar-button-url" />
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready} data-testid="toolbar-button-save">
          {initial ? "Save" : "Make button"}
        </Button>
      </DialogFooter>
    </form>
  );
}

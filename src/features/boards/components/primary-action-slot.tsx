"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Play, Plus, Settings2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { boardPrimaryAction, MAX_QUICK_RUN_ITEMS, PRIMARY_ACTION_LABEL_MAX, type AutomationRule } from "@/domain";
import { AutomationsDialog, RunPicker } from "@/features/automations/automations-dialog";
import { useQuickRun, useRuleVocabulary } from "@/features/automations/hooks";
import { useBoardContext } from "@/features/boards/board-context";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { useBoardUi } from "@/stores/board-ui-store";

/**
 * The toolbar's first button, a slot: New item, or one of the board's quick
 * runs under a label of its own. A board manager picks which from the arrow
 * beside it; everyone else just gets the button.
 *
 * A quick run pressed with tasks ticked runs on those at once. With none it
 * asks which, in the same picker as the automations' Quick runs tab, unless it
 * needs no task at all. A slot whose quick run has since been deleted is New
 * item again.
 */
export function PrimaryActionSlot({ newItem }: { newItem: React.ReactNode }) {
  const { board, model, canEdit, canManage } = useBoardContext();
  const services = useServices();
  const actions = useBoardActions(board);
  const slot = boardPrimaryAction(board.primaryAction);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [picking, setPicking] = React.useState<AutomationRule | null>(null);
  const [labelling, setLabelling] = React.useState<AutomationRule | null>(null);
  const [managing, setManaging] = React.useState(false);
  const selected = useBoardUi(board.id).selectedItemIds;
  const run = useQuickRun(board.id);
  const vocabulary = useRuleVocabulary(model.columns, model.groups);

  // The same cache the automations screens use, without their live channel:
  // read only once the slot holds a quick run or its menu is opened.
  const rules = useQuery({
    queryKey: queryKeys.automations(board.id),
    queryFn: () => services.automations.listByBoard(board.id),
    staleTime: 60_000,
    enabled: canEdit && (slot.kind === "quick_run" || menuOpen),
  });
  const quickRuns = (rules.data ?? []).filter((r) => r.trigger.kind === "manual");
  const rule = slot.kind === "quick_run" ? quickRuns.find((r) => r.id === slot.ruleId) : undefined;

  if (!canEdit) return null;

  const press = (target: AutomationRule) => {
    const needsTask = target.actions.some((a) => a.kind !== "notify" && a.kind !== "create_item");
    const ticked = selected.filter((id) => model.itemById.has(id)).slice(0, MAX_QUICK_RUN_ITEMS);
    if (ticked.length > 0) run.mutate({ ruleId: target.id, itemIds: ticked });
    else if (!needsTask) run.mutate({ ruleId: target.id, itemIds: [] });
    else setPicking(target);
  };

  const choose = (next: AutomationRule | null) => {
    if (!next) actions.updateBoard.mutate({ primaryAction: null });
    else setLabelling(next);
  };

  return (
    <>
      <div className="flex shrink-0 items-center">
        {rule ? (
          <Button size="sm" className={cn(canManage && "rounded-r-none")} onClick={() => press(rule)} disabled={run.isPending} title={rule.name} data-testid="primary-action-run">
            <Play /> {slot.kind === "quick_run" && slot.label ? slot.label : rule.name}
            {selected.length > 0 && <span className="rounded-full bg-white/25 px-1.5 text-2xs tabular">{Math.min(selected.length, MAX_QUICK_RUN_ITEMS)}</span>}
          </Button>
        ) : (
          <span className={cn(canManage && "[&_button]:rounded-r-none")}>{newItem}</span>
        )}
        {canManage && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-l-none border-l border-white/20 px-1.5" aria-label="Change this button" data-testid="primary-action-menu">
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>This button</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => choose(null)} data-testid="primary-action-new-item">
                <Plus /> <span className="flex-1">New item</span>
                {!rule && <Check className="size-3.5" />}
              </DropdownMenuItem>
              {quickRuns.length > 0 && <DropdownMenuLabel className="pt-2 text-2xs font-medium text-muted-foreground uppercase">Quick runs</DropdownMenuLabel>}
              {rules.isLoading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>}
              {quickRuns.map((r) => (
                <DropdownMenuItem key={r.id} onSelect={() => choose(r)} data-testid="primary-action-option" data-rule-name={r.name}>
                  <Play /> <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  {rule?.id === r.id && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
              {!rules.isLoading && quickRuns.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No quick runs on this board yet.</p>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setManaging(true)} data-testid="primary-action-manage">
                <Settings2 /> {quickRuns.length > 0 ? "Manage quick runs…" : "Make a quick run…"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={!!picking} onOpenChange={(open) => !open && setPicking(null)}>
        <DialogContent className="sm:max-w-xl" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{picking?.name ?? "Quick run"}</DialogTitle>
          {picking && <RunPicker rule={picking} items={model.snapshot.items} groups={model.groups} boardId={board.id} vocabulary={vocabulary} onDone={() => setPicking(null)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!labelling} onOpenChange={(open) => !open && setLabelling(null)}>
        <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
          {labelling && (
            <SlotLabelForm
              rule={labelling}
              onSave={(label) => {
                actions.updateBoard.mutate({ primaryAction: { kind: "quick_run", ruleId: labelling.id, label } });
                setLabelling(null);
              }}
              onCancel={() => setLabelling(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {canManage && <AutomationsDialog board={board} canManage open={managing} onOpenChange={setManaging} />}
    </>
  );
}

/** The words on the button, the quick run's own name to start with. */
function SlotLabelForm({ rule, onSave, onCancel }: { rule: AutomationRule; onSave: (label: string) => void; onCancel: () => void }) {
  const [label, setLabel] = React.useState(rule.name.slice(0, PRIMARY_ACTION_LABEL_MAX));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(label.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>Button for {rule.name}</DialogTitle>
      </DialogHeader>
      <Input autoFocus value={label} maxLength={PRIMARY_ACTION_LABEL_MAX} onChange={(e) => setLabel(e.target.value)} aria-label="Button label" data-testid="primary-action-label" />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!label.trim()} data-testid="primary-action-save">
          Use this button
        </Button>
      </div>
    </form>
  );
}

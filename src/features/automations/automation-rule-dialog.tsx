"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { AutomationRule, Board } from "@/domain";
import { useAutomationMutations, useRuleVocabulary } from "@/features/automations/hooks";
import type { Recipe } from "@/features/automations/recipes";
import { RuleBuilder, blankDraft, type RuleDraft } from "@/features/automations/rule-builder";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { queryKeys } from "@/lib/query/keys";
import { describeRule } from "@/services";

/**
 * Writing one rule, wherever it was reached from.
 *
 * The board's own dialog edits in place — the builder takes over the panel the
 * list was in, so a person is never two dialogs deep — and the workspace
 * manager opens this as a dialog of its own. Both are built on `useRuleEditor`,
 * which owns the draft, the name and the save, so there is one builder to keep
 * right rather than two that drift.
 *
 * A recipe arrives as `preset` and is turned into a draft the moment the board's
 * columns are known — which is also the moment it can be, since a recipe asks
 * for "the status column" and only the board can say which that is.
 */

export interface RuleEditorOptions {
  board: Board;
  rule: AutomationRule | null;
  preset?: Recipe;
  /** Writing a quick run: no trigger to choose, nothing to check, only what it does. */
  quick?: boolean;
  /** When given, the board may be changed while creating. Empty means it may not. */
  boards?: Board[];
  onBoardChange?: (board: Board) => void;
  /** Whether the editor is on screen; the board is only read while it is. */
  active: boolean;
  /**
   * Changes whenever a fresh edit begins. Two "New automation" clicks in a row
   * would otherwise share one draft, and the second would start where the
   * first was abandoned.
   */
  session?: string | number;
  onSaved: () => void;
}

export interface RuleEditor {
  heading: string;
  blurb: string;
  /** The builder, the name field and any error, ready to drop into a scroller. */
  body: React.ReactNode;
  save: () => Promise<void>;
  saveLabel: string;
  /** False until the board's columns are in hand and a draft exists. */
  ready: boolean;
  busy: boolean;
}

export function useRuleEditor({ board, rule, preset, quick = false, boards, onBoardChange, active, session, onSaved }: RuleEditorOptions): RuleEditor {
  const ws = useWorkspace();
  const services = useServices();
  const snapshot = useQuery({
    queryKey: queryKeys.boardSnapshot(board.id),
    queryFn: () => services.items.loadBoardSnapshot(board.id),
    enabled: active,
    staleTime: 30_000,
  });
  const vocabulary = useRuleVocabulary(snapshot.data?.columns ?? EMPTY, snapshot.data?.groups ?? EMPTY);
  const mutations = useAutomationMutations(board.id, vocabulary);

  const [draft, setDraft] = React.useState<RuleDraft | null>(null);
  const [name, setName] = React.useState(rule ? rule.name : "");
  const [error, setError] = React.useState<string | null>(null);

  // The draft cannot be built until the board's columns are in hand, and it has
  // to be rebuilt when the board changes underneath it — a rule half-written
  // against one board's columns means nothing against another's.
  //
  // Adjusted during render rather than in an effect: React re-runs this pass
  // before touching the DOM, so the builder never draws once against a draft
  // that belongs to the wrong board.
  const ready = !!snapshot.data;
  const signature = `${board.id}:${rule?.id ?? preset?.id ?? (quick ? "quick" : "blank")}:${session ?? ""}:${ready}`;
  const [builtFor, setBuiltFor] = React.useState<string | null>(null);
  if (ready && active && builtFor !== signature) {
    setBuiltFor(signature);
    if (rule) {
      setDraft({ trigger: rule.trigger, conditionMatch: rule.conditionMatch, conditions: rule.conditions, actions: rule.actions });
      setName(rule.name === describeRule(rule.trigger, rule.conditions, rule.actions, rule.conditionMatch, vocabulary) ? "" : rule.name);
    } else if (preset) {
      const recipe = preset.build({ columns: vocabulary.columns, groups: vocabulary.groups });
      setDraft(recipe ? { trigger: recipe.trigger, conditionMatch: "all", conditions: recipe.conditions ?? [], actions: recipe.actions } : blankDraft(vocabulary));
      setName("");
    } else {
      setDraft(blankDraft(vocabulary, quick ? "quick" : "rule"));
      setName("");
    }
    setError(null);
  }

  const save = async () => {
    if (!draft) return;
    setError(null);
    const written = name.trim() || describeRule(draft.trigger, draft.conditions, draft.actions, draft.conditionMatch, vocabulary);
    try {
      if (rule) await mutations.update.mutateAsync({ id: rule.id, patch: { name: written, ...draft } });
      else
        await mutations.create.mutateAsync({
          workspaceId: board.workspaceId,
          boardId: board.id,
          name: written,
          enabled: true,
          createdBy: ws.currentUser.id,
          ...draft,
        });
      onSaved();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "That automation could not be saved.");
    }
  };

  const busy = mutations.create.isPending || mutations.update.isPending;
  const canPickBoard = !rule && (boards?.length ?? 0) > 1;

  const heading = quick ? (rule ? "Edit quick run" : "New quick run") : rule ? "Edit automation" : preset ? preset.title : "New automation";
  const blurb = quick
    ? "A group of actions you point at tasks and run. No trigger, no conditions — it does what it says the moment you press Run."
    : "These run on a server, so they happen whether or not anybody has the app open.";
  const saveLabel = rule ? "Save changes" : quick ? "Save quick run" : "Create automation";

  const body = (
    <div className="space-y-5">
      {canPickBoard && (
        <div>
          <label htmlFor="automation-board" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            On which board
          </label>
          <Select value={board.id} onValueChange={(id) => onBoardChange?.(boards!.find((b) => b.id === id) ?? board)}>
            <SelectTrigger id="automation-board" className="w-full" data-testid="automation-board">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boards!.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!ready || !draft ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <RuleBuilder draft={draft} onChange={setDraft} vocabulary={vocabulary} mode={quick ? "quick" : "rule"} />
          <div>
            <label htmlFor="automation-name" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              Name
            </label>
            <Input
              id="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={describeRule(draft.trigger, draft.conditions, draft.actions, draft.conditionMatch, vocabulary)}
              data-testid="automation-name"
            />
          </div>
        </>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-[13px] text-destructive" data-testid="automation-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );

  return { heading, blurb, body, save, saveLabel, ready: ready && !!draft, busy };
}

/** The editor as a dialog of its own, for the workspace-wide manager. */
export function AutomationRuleDialog({
  board,
  rule,
  preset,
  boards,
  quick = false,
  open,
  onOpenChange,
  onBoardChange,
}: {
  board: Board;
  rule: AutomationRule | null;
  preset?: Recipe;
  quick?: boolean;
  boards?: Board[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBoardChange?: (board: Board) => void;
}) {
  const isMobile = useIsMobile();
  const editor = useRuleEditor({ board, rule, preset, quick, boards, onBoardChange, active: open, onSaved: () => onOpenChange(false) });

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          title={editor.heading}
          description={editor.blurb}
          footer={
            <div className="flex flex-col gap-2">
              <Button className="h-11 w-full" onClick={editor.save} disabled={editor.busy || !editor.ready} data-testid="save-automation">
                <Check /> {editor.saveLabel}
              </Button>
              <Button variant="ghost" className="h-11 w-full" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          }
          data-testid="automation-rule-dialog"
        >
          <div className="pb-2">{editor.body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[88vh] overflow-hidden" data-testid="automation-rule-dialog">
        <DialogHeader>
          <DialogTitle>{editor.heading}</DialogTitle>
          <DialogDescription>{editor.blurb}</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin max-h-[62vh] overflow-y-auto px-1">{editor.body}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={editor.save} disabled={editor.busy || !editor.ready} data-testid="save-automation">
            <Check /> {editor.saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPTY: never[] = [];

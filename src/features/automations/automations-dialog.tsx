"use client";

import { AlertTriangle, ArrowLeft, Check, CircleSlash, Plus, Trash2, Zap } from "lucide-react";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import type { AutomationRule, Board, BoardColumn, BoardGroup } from "@/domain";
import { TRIGGER_TIMING } from "@/domain";
import { useAutomationMutations, useAutomationRuns, useAutomations, useRuleVocabulary } from "@/features/automations/hooks";
import { RuleBuilder, blankDraft, type RuleDraft } from "@/features/automations/rule-builder";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { describeRule } from "@/services";
import { cn } from "@/lib/utils";

/** Stable empties, so the vocabulary is not a new object on every render. */
const EMPTY_COLUMNS: readonly BoardColumn[] = [];
const EMPTY_GROUPS: readonly BoardGroup[] = [];

/**
 * A board's automations: what it does on its own.
 *
 * Two screens behind one door. The list is what a rule *is*, written back out
 * as the sentence somebody meant by it; the log is what it has actually done,
 * which is the only honest answer to "is this thing working". Skipped runs are
 * in the log too, because "why did it not fire" is the question people bring.
 */
export function AutomationsDialog({
  board,
  canManage,
  open,
  onOpenChange,
}: {
  board: Board;
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ws = useWorkspace();
  // Read here rather than handed down: the board header that opens this dialog
  // sits above the board's own context, and the snapshot is already in the
  // query cache by the time anybody reaches the menu.
  const snapshot = useBoardSnapshot(open ? board.id : null);
  const vocabulary = useRuleVocabulary(snapshot.data?.columns ?? EMPTY_COLUMNS, snapshot.data?.groups ?? EMPTY_GROUPS);
  const rules = useAutomations(board.id);
  const mutations = useAutomationMutations(board.id, vocabulary);
  const [tab, setTab] = React.useState("rules");
  const runs = useAutomationRuns(board.id, open && tab === "log");
  const [editing, setEditing] = React.useState<{ rule: AutomationRule | null; draft: RuleDraft; name: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const startNew = () => {
    setError(null);
    setEditing({ rule: null, draft: blankDraft(vocabulary), name: "" });
  };
  const startEdit = (rule: AutomationRule) => {
    setError(null);
    setEditing({
      rule,
      draft: { trigger: rule.trigger, conditionMatch: rule.conditionMatch, conditions: rule.conditions, actions: rule.actions },
      // The auto-written sentence is not a name somebody chose, so editing
      // starts from empty and the sentence is rewritten unless they type one.
      name: rule.name === describeRule(rule.trigger, rule.conditions, rule.actions, rule.conditionMatch, vocabulary) ? "" : rule.name,
    });
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      if (editing.rule) {
        await mutations.update.mutateAsync({
          id: editing.rule.id,
          patch: { name: editing.name.trim() || describeRule(editing.draft.trigger, editing.draft.conditions, editing.draft.actions, editing.draft.conditionMatch, vocabulary), ...editing.draft },
        });
      } else {
        await mutations.create.mutateAsync({
          workspaceId: board.workspaceId,
          boardId: board.id,
          name: editing.name,
          enabled: true,
          createdBy: ws.currentUser.id,
          ...editing.draft,
        });
      }
      setEditing(null);
    } catch (thrown) {
      // Shown here rather than as a toast: it is about the thing on screen, and
      // the thing on screen is what has to change to fix it.
      setError(thrown instanceof Error ? thrown.message : "That automation could not be saved.");
    }
  };

  const busy = mutations.create.isPending || mutations.update.isPending;

  // Closing throws the draft away rather than an effect doing it afterwards: a
  // dialog reopened should never show half a rule somebody walked away from.
  const close = (next: boolean) => {
    if (!next) {
      setEditing(null);
      setError(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="xl" className="max-h-[85vh] overflow-hidden" data-testid="automations-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4 text-primary" /> Automations
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "These run on the server, so they happen whether or not anybody has this open."
              : `What ${board.name} does on its own.`}
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <>
            <div className="scrollbar-thin max-h-[58vh] space-y-4 overflow-y-auto px-1">
              <RuleBuilder draft={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} vocabulary={vocabulary} />
              <div>
                <label htmlFor="automation-name" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </label>
                <Input
                  id="automation-name"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder={describeRule(editing.draft.trigger, editing.draft.conditions, editing.draft.actions, editing.draft.conditionMatch, vocabulary)}
                  data-testid="automation-name"
                />
              </div>
              {error && (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-[13px] text-destructive" data-testid="automation-error">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={save} disabled={busy} data-testid="save-automation">
                <Check /> {editing.rule ? "Save changes" : "Create automation"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="min-h-0">
            <div className="flex items-center justify-between gap-3">
              <UnderlineTabsList>
                <UnderlineTabsTrigger value="rules" data-testid="automations-tab-rules">
                  Rules {rules.data && rules.data.length > 0 ? `(${rules.data.length})` : ""}
                </UnderlineTabsTrigger>
                <UnderlineTabsTrigger value="log" data-testid="automations-tab-log">
                  Activity
                </UnderlineTabsTrigger>
              </UnderlineTabsList>
              {canManage && (
                <Button size="sm" onClick={startNew} data-testid="new-automation">
                  <Plus /> New automation
                </Button>
              )}
            </div>

            <TabsContent value="rules" className="scrollbar-thin max-h-[58vh] overflow-y-auto">
              {rules.isLoading || snapshot.isLoading ? (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : (rules.data ?? []).length === 0 ? (
                <EmptyState
                  icon={Zap}
                  title="This board does nothing on its own yet"
                  description={canManage ? "An automation watches for something and then does something. It runs on the server, so it works with nobody signed in." : "Only somebody who can manage this board can add one."}
                />
              ) : (
                <ul className="space-y-2 py-2">
                  {(rules.data ?? []).map((rule) => (
                    <li key={rule.id}>
                      <RuleRow
                        rule={rule}
                        sentence={describeRule(rule.trigger, rule.conditions, rule.actions, rule.conditionMatch, vocabulary)}
                        canManage={canManage}
                        onToggle={(enabled) => mutations.setEnabled.mutate({ id: rule.id, enabled })}
                        onEdit={() => startEdit(rule)}
                        onRemove={() => mutations.remove.mutate(rule.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="log" className="scrollbar-thin max-h-[58vh] overflow-y-auto">
              {runs.isLoading ? (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : (runs.data ?? []).length === 0 ? (
                <EmptyState icon={CircleSlash} title="Nothing has run yet" description="Every firing lands here, including the ones a condition held back." compact />
              ) : (
                <ul className="divide-y divide-border/60 py-1">
                  {(runs.data ?? []).map((run) => (
                    <li key={run.id} className="flex items-start gap-3 py-2" data-testid="automation-run">
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          run.status === "ran" ? "bg-green-500" : run.status === "skipped" ? "bg-muted-foreground/50" : "bg-destructive",
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px]">{run.summary}</p>
                        {run.detail && <p className="text-2xs text-muted-foreground">{run.detail}</p>}
                      </div>
                      <span className="shrink-0 text-2xs text-muted-foreground">
                        <RelativeTime iso={run.createdAt} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RuleRow({
  rule,
  sentence,
  canManage,
  onToggle,
  onEdit,
  onRemove,
}: {
  rule: AutomationRule;
  sentence: string;
  canManage: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const scheduled = TRIGGER_TIMING[rule.trigger.kind] === "schedule";
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-3 shadow-xs", !rule.enabled && "opacity-60")} data-testid="automation-rule">
      <div className="flex items-start gap-3">
        <Switch
          checked={rule.enabled}
          onCheckedChange={onToggle}
          disabled={!canManage}
          aria-label={rule.enabled ? `Turn off ${rule.name}` : `Turn on ${rule.name}`}
          data-testid="automation-toggle"
        />
        <button
          type="button"
          onClick={canManage ? onEdit : undefined}
          className={cn("min-w-0 flex-1 text-left", canManage && "hover:underline")}
          data-testid="automation-open"
        >
          <p className="text-[13px] font-medium">{rule.name}</p>
          {rule.name !== sentence && <p className="mt-0.5 text-2xs text-muted-foreground">{sentence}</p>}
        </button>
        {canManage && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${rule.name}`} data-testid="automation-remove">
            <Trash2 />
          </Button>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-2xs text-muted-foreground">
        {scheduled && <span className="rounded-full bg-surface-strong/70 px-1.5 py-0.5">on a schedule</span>}
        {rule.lastRunAt ? (
          <span>
            last ran <RelativeTime iso={rule.lastRunAt} /> · {rule.runCount} {rule.runCount === 1 ? "time" : "times"}
          </span>
        ) : (
          <span>has not run yet</span>
        )}
        {rule.lastError && <span className="text-destructive">last time: {rule.lastError}</span>}
      </p>
    </div>
  );
}

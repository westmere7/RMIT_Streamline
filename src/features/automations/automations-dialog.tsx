"use client";

import { AlertTriangle, ArrowRight, CircleSlash, ExternalLink, Plus, Trash2, Zap } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import type { AutomationRule, Board, BoardColumn, BoardGroup } from "@/domain";
import { TRIGGER_TIMING } from "@/domain";
import { AutomationRuleDialog } from "@/features/automations/automation-rule-dialog";
import { useAutomationMutations, useAutomationRunnerHealth, useAutomationRuns, useAutomations, useRuleVocabulary } from "@/features/automations/hooks";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import type { RuleVocabulary } from "@/services";
import { describeAutomationAction, describeTrigger } from "@/services";
import { cn } from "@/lib/utils";

/** Stable empties, so the vocabulary is not a new object on every render. */
const EMPTY_COLUMNS: readonly BoardColumn[] = [];
const EMPTY_GROUPS: readonly BoardGroup[] = [];

/**
 * One board's automations: what it does on its own.
 *
 * The list writes each rule back out as its two halves — the thing watched for,
 * and the things done — rather than as one long sentence. A list of twenty
 * sentences cannot be scanned; a list of twenty when/then pairs can.
 *
 * Writing a rule opens the shared dialog, the same one the workspace-wide
 * manager opens, so there is one builder to keep right rather than two that
 * drift. Everything that is about more than this board — whether the runner is
 * alive at all, the recipes, the log across every board — lives on that page,
 * and this one links to it instead of growing a second copy.
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
  // Read here rather than handed down: the board header that opens this sits
  // above the board's own context, and the snapshot is already in the cache.
  const snapshot = useBoardSnapshot(open ? board.id : null);
  const vocabulary = useRuleVocabulary(snapshot.data?.columns ?? EMPTY_COLUMNS, snapshot.data?.groups ?? EMPTY_GROUPS);
  const rules = useAutomations(board.id);
  const mutations = useAutomationMutations(board.id, vocabulary);
  const [tab, setTab] = React.useState("rules");
  const runs = useAutomationRuns(board.id, open && tab === "log");
  const health = useAutomationRunnerHealth(open && (rules.data ?? []).length > 0);
  const [editing, setEditing] = React.useState<{ rule: AutomationRule | null } | null>(null);

  const list = rules.data ?? [];

  return (
    <>
      <Dialog open={open && !editing} onOpenChange={onOpenChange}>
        <DialogContent size="xl" className="max-h-[85vh] overflow-hidden" data-testid="automations-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="size-4 text-primary" /> Automations
            </DialogTitle>
            <DialogDescription>What {board.name} does on its own.</DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} className="min-h-0">
            <div className="flex items-center justify-between gap-3">
              <UnderlineTabsList>
                <UnderlineTabsTrigger value="rules" data-testid="automations-tab-rules">
                  Rules {list.length > 0 ? `(${list.length})` : ""}
                </UnderlineTabsTrigger>
                <UnderlineTabsTrigger value="log" data-testid="automations-tab-log">
                  Activity
                </UnderlineTabsTrigger>
              </UnderlineTabsList>
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                  <Link href={routes.automations(ws.slug)} onClick={() => onOpenChange(false)} data-testid="all-automations">
                    All automations <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
                {canManage && (
                  <Button size="sm" onClick={() => setEditing({ rule: null })} data-testid="new-automation">
                    <Plus /> New
                  </Button>
                )}
              </div>
            </div>

            <TabsContent value="rules" className="scrollbar-thin max-h-[58vh] overflow-y-auto">
              {rules.isLoading || snapshot.isLoading ? (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))}
                </div>
              ) : list.length === 0 ? (
                <EmptyState
                  icon={Zap}
                  title="This board does nothing on its own yet"
                  description={
                    canManage
                      ? "An automation watches for something and then acts. It runs on a server, so it works with nobody signed in."
                      : "Only somebody who can manage this board can add one."
                  }
                />
              ) : (
                <ul className="space-y-2 py-2">
                  {health.stale && (
                    <li>
                      <p
                        className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-[13px] text-amber-700 dark:text-amber-300"
                        data-testid="automation-runner-stale"
                      >
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>
                          {health.beat
                            ? `Nothing has run these automations for ${Math.round(health.minutesAgo ?? 0)} minutes.`
                            : "Nothing has ever run these automations."}{" "}
                          They are carried out by a server on a timer, so a rule cannot fire until something calls it.
                        </span>
                      </p>
                    </li>
                  )}
                  {list.map((rule) => (
                    <li key={rule.id}>
                      <RuleRow
                        rule={rule}
                        vocabulary={vocabulary}
                        ready={!!snapshot.data}
                        canManage={canManage}
                        onToggle={(enabled) => mutations.setEnabled.mutate({ id: rule.id, enabled })}
                        onEdit={() => setEditing({ rule })}
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
                        aria-hidden
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          run.status === "ran" ? "bg-green-500" : run.status === "skipped" ? "bg-muted-foreground/50" : "bg-destructive",
                        )}
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
        </DialogContent>
      </Dialog>

      {editing && (
        <AutomationRuleDialog
          board={board}
          rule={editing.rule}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      )}
    </>
  );
}

function RuleRow({
  rule,
  vocabulary,
  ready,
  canManage,
  onToggle,
  onEdit,
  onRemove,
}: {
  rule: AutomationRule;
  vocabulary: RuleVocabulary;
  ready: boolean;
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
          className="mt-0.5"
          data-testid="automation-toggle"
        />
        <button type="button" onClick={canManage ? onEdit : undefined} className="min-w-0 flex-1 text-left" data-testid="automation-open">
          <p className="text-[13px] font-medium">{rule.name}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs">
            <Chip tone={scheduled ? "clock" : "when"}>{ready ? describeTrigger(rule.trigger, vocabulary) : "…"}</Chip>
            <ArrowRight aria-hidden className="size-3 shrink-0 text-muted-foreground/60" />
            {rule.actions.slice(0, 3).map((action, i) => (
              <Chip key={i} tone="then">
                {ready ? describeAutomationAction(action, vocabulary) : "…"}
              </Chip>
            ))}
            {rule.actions.length > 3 && <span className="text-muted-foreground">+{rule.actions.length - 3} more</span>}
          </p>
        </button>
        {canManage && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${rule.name}`} data-testid="automation-remove">
            <Trash2 />
          </Button>
        )}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 pl-12 text-2xs text-muted-foreground">
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

/**
 * The two halves of a rule, coloured apart.
 *
 * What is watched for reads as the board's own furniture; what is done reads in
 * the brand colour, because that is the half that changes something. A schedule
 * takes a third colour: it is the one trigger with no event behind it, and
 * telling those apart at a glance is most of what somebody scanning this list
 * is doing.
 */
function Chip({ children, tone }: { children: React.ReactNode; tone: "when" | "then" | "clock" }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 font-medium",
        tone === "then"
          ? "bg-primary/10 text-primary"
          : tone === "clock"
            ? "bg-violet-500/10 text-violet-600 dark:text-violet-300"
            : "bg-surface-strong/80 text-foreground/80",
      )}
    >
      {children}
    </span>
  );
}

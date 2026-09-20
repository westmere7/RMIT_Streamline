"use client";

import { AlertTriangle, ArrowRight, Check, CircleSlash, ExternalLink, Play, Plus, Search, Trash2, X, Zap } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import type { AutomationRule, Board, BoardColumn, BoardGroup, Item } from "@/domain";
import { MAX_QUICK_RUN_ITEMS, TRIGGER_TIMING } from "@/domain";
import { AutomationRuleDialog } from "@/features/automations/automation-rule-dialog";
import { useAutomationMutations, useAutomationRunnerHealth, useAutomationRuns, useAutomations, useQuickRun, useRuleVocabulary } from "@/features/automations/hooks";
import { useBoardSnapshot } from "@/features/boards/hooks/use-board-snapshot";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { routes } from "@/lib/routes";
import type { RuleVocabulary } from "@/services";
import { describeAutomationAction, describeTrigger } from "@/services";
import { cn } from "@/lib/utils";

/** Stable empties, so the vocabulary is not a new object on every render. */
const EMPTY_COLUMNS: readonly BoardColumn[] = [];
const EMPTY_GROUPS: readonly BoardGroup[] = [];

/**
 * One board's automations: what it does on its own, and what it can do on
 * request.
 *
 * Three tabs. Rules are what the board does when nobody is looking, written as
 * two coloured halves — the thing watched for and the things done — because a
 * list of twenty sentences cannot be scanned and a list of twenty when/then
 * pairs can. Quick runs are saved groups of actions with no trigger at all,
 * pointed at tasks and fired by hand; they live here and nowhere else, because
 * they are a thing a person does to a board while looking at it. Activity is
 * what any of it actually did.
 *
 * Writing either kind opens the shared dialog, the same one the workspace-wide
 * manager opens, so there is one builder to keep right rather than two that
 * drift.
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
  const isMobile = useIsMobile();
  // Read here rather than handed down: the board header that opens this sits
  // above the board's own context, and the snapshot is already in the cache.
  const snapshot = useBoardSnapshot(open ? board.id : null);
  const vocabulary = useRuleVocabulary(snapshot.data?.columns ?? EMPTY_COLUMNS, snapshot.data?.groups ?? EMPTY_GROUPS);
  const rules = useAutomations(board.id);
  const mutations = useAutomationMutations(board.id, vocabulary);
  const [tab, setTab] = React.useState("rules");
  const runs = useAutomationRuns(board.id, open && tab === "log");
  const health = useAutomationRunnerHealth(open && (rules.data ?? []).some((r) => r.trigger.kind !== "manual"));
  const [editing, setEditing] = React.useState<{ rule: AutomationRule | null; quick: boolean } | null>(null);
  const [running, setRunning] = React.useState<AutomationRule | null>(null);

  const all = rules.data ?? [];
  const automatic = all.filter((r) => r.trigger.kind !== "manual");
  const quick = all.filter((r) => r.trigger.kind === "manual");
  const loading = rules.isLoading || snapshot.isLoading;

  const close = (next: boolean) => {
    if (!next) setRunning(null);
    onOpenChange(next);
  };

  const blurb = `What ${board.name} does on its own, and on request.`;
  const shown = open && !editing;
  // On a phone the sheet's own body scrolls; on a desktop each pane does.
  const paneClass = isMobile ? "pb-2" : "scrollbar-thin max-h-[58vh] overflow-y-auto";
  const newLabel = tab === "quick" ? "New quick run" : "New automation";
  const openNew = () => setEditing({ rule: null, quick: tab === "quick" });

  const panes = (
    <Tabs value={tab} onValueChange={setTab} className="min-h-0">
      <div className="flex items-center justify-between gap-3">
        <UnderlineTabsList className={isMobile ? "w-full [&>button]:flex-1 [&>button]:justify-center" : undefined}>
          <UnderlineTabsTrigger value="rules" data-testid="automations-tab-rules">
            Rules {automatic.length > 0 ? `(${automatic.length})` : ""}
          </UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="quick" data-testid="automations-tab-quick">
            Quick runs {quick.length > 0 ? `(${quick.length})` : ""}
          </UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="log" data-testid="automations-tab-log">
            Activity
          </UnderlineTabsTrigger>
        </UnderlineTabsList>
        {!isMobile && (
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href={routes.automations(ws.slug)} onClick={() => onOpenChange(false)} data-testid="all-automations">
                All automations <ExternalLink className="size-3.5" />
              </Link>
            </Button>
            {canManage && tab !== "log" && (
              <Button size="sm" onClick={openNew} data-testid="new-automation">
                <Plus /> {tab === "quick" ? "New quick run" : "New"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ---- Rules ---- */}
      <TabsContent value="rules" className={paneClass}>
        {loading ? (
          <RowSkeletons />
        ) : automatic.length === 0 ? (
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
            {automatic.map((rule) => (
              <li key={rule.id}>
                <RuleRow
                  rule={rule}
                  vocabulary={vocabulary}
                  ready={!!snapshot.data}
                  canManage={canManage}
                  onToggle={(enabled) => mutations.setEnabled.mutate({ id: rule.id, enabled })}
                  onEdit={() => setEditing({ rule, quick: false })}
                  onRemove={() => mutations.remove.mutate(rule.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      {/* ---- Quick runs ---- */}
      <TabsContent value="quick" className={paneClass}>
        {loading ? (
          <RowSkeletons />
        ) : running ? (
          <RunPicker
            rule={running}
            items={snapshot.data?.items ?? []}
            groups={snapshot.data?.groups ?? []}
            boardId={board.id}
            vocabulary={vocabulary}
            onDone={() => setRunning(null)}
          />
        ) : quick.length === 0 ? (
          <EmptyState
            icon={Play}
            title="No quick runs yet"
            description={
              canManage
                ? "A quick run is a group of actions you save once and fire by hand against whichever tasks you pick — no trigger, no conditions."
                : "Only somebody who can manage this board can add one."
            }
          />
        ) : (
          <ul className="space-y-2 py-2">
            {quick.map((rule) => (
              <li key={rule.id}>
                <QuickRunRow
                  rule={rule}
                  vocabulary={vocabulary}
                  ready={!!snapshot.data}
                  canManage={canManage}
                  onRun={() => setRunning(rule)}
                  onEdit={() => setEditing({ rule, quick: true })}
                  onRemove={() => mutations.remove.mutate(rule.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      {/* ---- Activity ---- */}
      <TabsContent value="log" className={paneClass}>
        {runs.isLoading ? (
          <RowSkeletons height="h-10" count={5} />
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
  );

  return (
    <>
      {isMobile ? (
        // A sheet, like every other overlay on the phone. The buttons the
        // desktop keeps beside the tabs have no room there at 375px; they
        // become the sheet's footer, where a thumb already is.
        <Sheet open={shown} onOpenChange={close}>
          <SheetContent
            title="Automations"
            description={blurb}
            footer={
              <div className="flex flex-col gap-2">
                {canManage && tab !== "log" && !running && (
                  <Button className="h-11 w-full" onClick={openNew} data-testid="new-automation">
                    <Plus /> {newLabel}
                  </Button>
                )}
                <Button variant="ghost" asChild className="h-11 w-full text-muted-foreground">
                  <Link href={routes.automations(ws.slug)} onClick={() => onOpenChange(false)} data-testid="all-automations">
                    All automations <ExternalLink className="size-3.5" />
                  </Link>
                </Button>
              </div>
            }
            data-testid="automations-dialog"
          >
            {panes}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={shown} onOpenChange={close}>
          <DialogContent size="xl" className="max-h-[85vh] overflow-hidden" data-testid="automations-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="size-4 text-primary" /> Automations
              </DialogTitle>
              <DialogDescription>{blurb}</DialogDescription>
            </DialogHeader>
            {panes}
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <AutomationRuleDialog
          board={board}
          rule={editing.rule}
          quick={editing.quick}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
        />
      )}
    </>
  );
}

function RowSkeletons({ height = "h-20", count = 3 }: { height?: string; count?: number }) {
  return (
    <div className="space-y-2 pt-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn(height, "rounded-xl")} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

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
            <ActionChips rule={rule} vocabulary={vocabulary} ready={ready} />
          </p>
        </button>
        {canManage && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${rule.name}`} data-testid="automation-remove">
            <Trash2 />
          </Button>
        )}
      </div>
      <Tally rule={rule} />
    </div>
  );
}

/**
 * A quick run has no switch: off would mean "cannot be run", and a thing you
 * do not want run is a thing you delete. It has a Run button instead, which is
 * the whole point of it.
 */
function QuickRunRow({
  rule,
  vocabulary,
  ready,
  canManage,
  onRun,
  onEdit,
  onRemove,
}: {
  rule: AutomationRule;
  vocabulary: RuleVocabulary;
  ready: boolean;
  canManage: boolean;
  onRun: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 shadow-xs" data-testid="quick-run">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Play className="size-3.5" />
        </span>
        <button type="button" onClick={canManage ? onEdit : undefined} className="min-w-0 flex-1 text-left" data-testid="quick-run-open">
          <p className="text-[13px] font-medium">{rule.name}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs">
            <ActionChips rule={rule} vocabulary={vocabulary} ready={ready} limit={4} />
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" onClick={onRun} disabled={!ready} data-testid="quick-run-start">
            <Play /> Run…
          </Button>
          {canManage && (
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${rule.name}`} data-testid="automation-remove">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <Tally rule={rule} />
    </div>
  );
}

function ActionChips({ rule, vocabulary, ready, limit = 3 }: { rule: AutomationRule; vocabulary: RuleVocabulary; ready: boolean; limit?: number }) {
  return (
    <>
      {rule.actions.slice(0, limit).map((action, i) => (
        <Chip key={i} tone="then">
          {ready ? describeAutomationAction(action, vocabulary) : "…"}
        </Chip>
      ))}
      {rule.actions.length > limit && <span className="text-muted-foreground">+{rule.actions.length - limit} more</span>}
    </>
  );
}

function Tally({ rule }: { rule: AutomationRule }) {
  return (
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

// ---------------------------------------------------------------------------
// Pointing a quick run at tasks
// ---------------------------------------------------------------------------

/**
 * Which tasks, then Run.
 *
 * The list is the board's own live tasks with a search box over them, because
 * "the six in Ideas that still say Not Started" is how people actually think
 * about it, and a picker that made them type ids would not be a picker. Capped
 * at MAX_QUICK_RUN_ITEMS: past that this stops being a quick run.
 */
function RunPicker({
  rule,
  items,
  groups,
  boardId,
  vocabulary,
  onDone,
}: {
  rule: AutomationRule;
  items: readonly Item[];
  groups: readonly BoardGroup[];
  boardId: string;
  vocabulary: RuleVocabulary;
  onDone: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [chosen, setChosen] = React.useState<Set<string>>(() => new Set());
  const run = useQuickRun(boardId);

  const live = React.useMemo(() => items.filter((i) => i.archivedAt === null && i.parentItemId === null), [items]);
  const groupName = React.useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const shown = React.useMemo(() => {
    const words = search.trim().toLowerCase();
    if (!words) return live;
    return live.filter((i) => i.name.toLowerCase().includes(words) || (i.ticket ?? "").toLowerCase().includes(words) || (groupName.get(i.groupId) ?? "").toLowerCase().includes(words));
  }, [live, search, groupName]);

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_QUICK_RUN_ITEMS) next.add(id);
      return next;
    });
  const selectShown = () => setChosen(new Set(shown.slice(0, MAX_QUICK_RUN_ITEMS).map((i) => i.id)));
  const needsTask = rule.actions.some((a) => a.kind !== "notify" && a.kind !== "create_item");
  const canRun = !run.isPending && (chosen.size > 0 || !needsTask);

  return (
    <div className="space-y-3 py-2" data-testid="quick-run-picker">
      <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Play className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{rule.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
            <ActionChips rule={rule} vocabulary={vocabulary} ready limit={6} />
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDone} aria-label="Back to quick runs">
          <X />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find tasks" aria-label="Find tasks" className="h-8 pl-8" data-testid="quick-run-search" />
        </div>
        <Button variant="ghost" size="sm" onClick={selectShown} disabled={shown.length === 0}>
          Select {shown.length === live.length ? "all" : "shown"}
        </Button>
        {chosen.size > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setChosen(new Set())}>
            Clear
          </Button>
        )}
      </div>

      {live.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/80 px-3 py-6 text-center text-[13px] text-muted-foreground">This board has no live tasks to run it on.</p>
      ) : (
        <ul className="scrollbar-thin max-h-[32vh] divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70 bg-card" data-testid="quick-run-tasks">
          {shown.map((item) => {
            const on = chosen.has(item.id);
            const full = !on && chosen.size >= MAX_QUICK_RUN_ITEMS;
            return (
              <li key={item.id}>
                {/* The whole row is the control. Not a <label> around a checkbox:
                    a click on the box then bubbles to the label, which clicks
                    the box again, and the tick never sticks. One button, one
                    toggle, and the box inside it is only a picture of the state. */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={full}
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50",
                    on && "bg-primary/5",
                  )}
                  data-testid="quick-run-task"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                      on ? "border-primary bg-primary text-white" : "border-input bg-background",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.ticket && <span className="shrink-0 text-2xs text-muted-foreground tabular">{item.ticket}</span>}
                  <span className="hidden shrink-0 text-2xs text-muted-foreground sm:block">{groupName.get(item.groupId)}</span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">Nothing matches.</li>}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground">
          {chosen.size === 0 ? (needsTask ? "Pick at least one task." : "Runs once, against no task.") : `${chosen.size} of up to ${MAX_QUICK_RUN_ITEMS} tasks.`}
        </p>
        <Button
          onClick={() => run.mutate({ ruleId: rule.id, itemIds: [...chosen] }, { onSuccess: onDone })}
          disabled={!canRun}
          data-testid="quick-run-go"
        >
          <Check /> Run{chosen.size > 0 ? ` on ${chosen.size} ${chosen.size === 1 ? "task" : "tasks"}` : ""}
        </Button>
      </div>
    </div>
  );
}

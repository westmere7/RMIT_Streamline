"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CircleSlash, Plus, Search, Trash2, Zap } from "lucide-react";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import type { AutomationRule, AutomationRun, Board } from "@/domain";
import { TRIGGER_TIMING } from "@/domain";
import { AutomationRuleDialog } from "@/features/automations/automation-rule-dialog";
import { useAutomationRunnerHealth, useRuleEnabled, useRuleRemoved, useWorkspaceAutomationRuns, useWorkspaceAutomations } from "@/features/automations/hooks";
import { RECIPES, type Recipe } from "@/features/automations/recipes";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useServices } from "@/features/data/data-context";
import { colorClasses } from "@/lib/colors";
import { canManageBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { describeAutomationAction, describeTrigger } from "@/services";
import { cn } from "@/lib/utils";

/**
 * Automations, for the whole workspace.
 *
 * The board dialog answers "what does this board do on its own". This answers
 * the question a person actually arrives with — "what is this place doing
 * behind my back, and is any of it broken" — which no per-board screen can,
 * because the answer is spread across every board they can see.
 *
 * Three things, in the order they matter: whether the runner is alive at all,
 * what could be set up in one click, and then the rules themselves. The health
 * strip is first because a dead scheduler makes every other thing on this page
 * a lie.
 *
 * Everything here is filtered by the database, not by this component. The
 * policies in supabase/policies/0017 mean a rule on a board somebody cannot see
 * is not returned to them, so "limited to the boards you have access to" is a
 * property of the data rather than a filter that can be forgotten.
 */
export function AutomationsPage() {
  const ws = useWorkspace();
  const rules = useWorkspaceAutomations(ws.workspace.id);
  const boardIds = React.useMemo(() => ws.boards.filter((b) => b.archivedAt === null).map((b) => b.id), [ws.boards]);
  const runs = useWorkspaceAutomationRuns(boardIds);
  const health = useAutomationRunnerHealth(true);

  const [search, setSearch] = React.useState("");
  const [boardFilter, setBoardFilter] = React.useState<string>("all");
  const [editing, setEditing] = React.useState<{ board: Board; rule: AutomationRule | null; preset?: Recipe } | null>(null);

  // Quick runs are not shown here. They are a thing a person does to a board
  // while looking at it, so they live on the board's own screen; this page is
  // about what happens when nobody is looking.
  const all = React.useMemo(() => (rules.data ?? []).filter((rule) => rule.trigger.kind !== "manual"), [rules.data]);
  const shown = React.useMemo(() => {
    const words = search.trim().toLowerCase();
    return all.filter((rule) => {
      if (boardFilter !== "all" && rule.boardId !== boardFilter) return false;
      if (!words) return true;
      const board = ws.boardById(rule.boardId)?.name ?? "";
      return rule.name.toLowerCase().includes(words) || board.toLowerCase().includes(words);
    });
  }, [all, boardFilter, search, ws]);

  // Grouped by board, because a rule only makes sense against the board whose
  // columns it names, and because that is how people go looking for one.
  const byBoard = React.useMemo(() => {
    const groups = new Map<string, AutomationRule[]>();
    for (const rule of shown) groups.set(rule.boardId, [...(groups.get(rule.boardId) ?? []), rule]);
    return [...groups.entries()]
      .map(([boardId, list]) => ({ board: ws.boardById(boardId), rules: list }))
      .filter((entry): entry is { board: Board; rules: AutomationRule[] } => !!entry.board)
      .sort((a, b) => a.board.name.localeCompare(b.board.name));
  }, [shown, ws]);

  const live = all.filter((r) => r.enabled).length;
  const failing = all.filter((r) => r.lastError).length;
  const boardsWithRules = new Set(all.map((r) => r.boardId)).size;
  const ranToday = (runs.data ?? []).filter((r) => r.status === "ran" && isToday(r.createdAt)).length;
  const manageable = ws.boards.filter((b) => b.archivedAt === null && canManageBoard(ws.permissions, b));

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto" data-testid="automations-page">
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader
          title="Automations"
          description={
            rules.data ? (
              all.length === 0
                ? "Nothing runs on its own yet. Pick something below to start."
                : `${live} running across ${boardsWithRules} ${boardsWithRules === 1 ? "board" : "boards"}.`
            ) : (
              <SkeletonLine className="w-56 max-w-full" />
            )
          }
          actions={
            manageable.length > 0 && (
              <Button size="sm" onClick={() => setEditing({ board: manageable[0]!, rule: null })} data-testid="new-automation">
                <Plus /> New automation
              </Button>
            )
          }
        />

        <div className="space-y-8 px-4 pb-12 sm:px-7">
          {/* Whether the thing that carries all of this out is alive. First,
              because if it is not then every figure below it is a fiction. */}
          <RunnerStrip health={health} live={live} ranToday={ranToday} failing={failing} loading={rules.isLoading} />

          {manageable.length > 0 && (
            <section>
              <SectionTitle icon={Zap} title="Start from a recipe" hint="One click, then change anything you like." />
              <RecipeGrid boards={manageable} onPick={(board, recipe) => setEditing({ board, rule: null, preset: recipe })} />
            </section>
          )}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionTitle icon={Activity} title="Your rules" hint={null} className="mb-0" />
              {all.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search rules"
                      aria-label="Search rules"
                      className="h-8 w-44 pl-8"
                      data-testid="automation-search"
                    />
                  </div>
                  <Select value={boardFilter} onValueChange={setBoardFilter}>
                    <SelectTrigger className="h-8 w-auto min-w-36" aria-label="Filter by board">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Every board</SelectItem>
                      {[...new Set(all.map((r) => r.boardId))]
                        .map((id) => ws.boardById(id))
                        .filter((b): b is Board => !!b)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((board) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {rules.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : all.length === 0 ? (
              <EmptyState
                icon={Zap}
                title="No board does anything on its own yet"
                description="An automation watches for something and then acts. It runs on a server, so it works with nobody signed in."
              />
            ) : byBoard.length === 0 ? (
              <EmptyState icon={Search} title="Nothing matches" description="No rule on any board you can see matches that." compact />
            ) : (
              <div className="space-y-6">
                {byBoard.map(({ board, rules: list }) => (
                  <BoardRules key={board.id} board={board} rules={list} onEdit={(rule) => setEditing({ board, rule })} />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionTitle icon={Activity} title="Lately" hint="What the rules have actually done, newest first." />
            <RunFeed runs={runs.data ?? []} loading={runs.isLoading} />
          </section>
        </div>
      </div>

      {editing && (
        <AutomationRuleDialog
          board={editing.board}
          rule={editing.rule}
          preset={editing.preset}
          boards={manageable}
          open
          onOpenChange={(next) => {
            if (!next) setEditing(null);
          }}
          onBoardChange={(board) => setEditing((current) => (current ? { ...current, board } : current))}
        />
      )}
    </div>
  );
}

function isToday(iso: string): boolean {
  return iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function SectionTitle({ icon: Icon, title, hint, className }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string | null; className?: string }) {
  return (
    <div className={cn("mb-3", className)}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      {hint && <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Is any of this actually running?
// ---------------------------------------------------------------------------

function RunnerStrip({
  health,
  live,
  ranToday,
  failing,
  loading,
}: {
  health: ReturnType<typeof useAutomationRunnerHealth>;
  live: number;
  ranToday: number;
  failing: number;
  loading: boolean;
}) {
  const ok = !health.stale && !!health.beat;
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 sm:p-5",
        ok ? "border-border/60 bg-card" : "border-amber-500/40 bg-amber-500/5",
      )}
      data-testid="runner-strip"
    >
      <span
        aria-hidden
        className={cn("pointer-events-none absolute -top-20 -right-16 size-56 rounded-full blur-3xl", ok ? "bg-primary/10" : "bg-amber-500/20")}
      />
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="min-w-56 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            {ok ? <CheckCircle2 className="size-4 text-green-500" /> : <AlertTriangle className="size-4 text-amber-500" />}
            {health.loading ? "Checking the runner…" : ok ? "The runner is live" : "Nothing is running these"}
          </p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {health.loading ? (
              <SkeletonLine className="w-64 max-w-full" />
            ) : ok ? (
              <>
                Last checked <RelativeTime iso={health.beat!.lastRunAt} />. Rules fire whether or not anybody has this open.
              </>
            ) : health.beat ? (
              `Nothing has run your automations for ${Math.round(health.minutesAgo ?? 0)} minutes. Until something does, no rule can fire.`
            ) : (
              "Your automations have never been run. They are carried out by a server on a timer, which has not been set up yet."
            )}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Figure label="running" value={loading ? null : live} />
          <Figure label="ran today" value={loading ? null : ranToday} />
          <Figure label="with errors" value={loading ? null : failing} tone={failing > 0 ? "bad" : undefined} />
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, tone }: { label: string; value: number | null; tone?: "bad" }) {
  return (
    <div>
      <p className={cn("text-2xl font-semibold tracking-tight tabular", tone === "bad" && value ? "text-destructive" : undefined)}>
        {value === null ? <SkeletonLine className="w-8" /> : value}
      </p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

function RecipeGrid({ boards, onPick }: { boards: Board[]; onPick: (board: Board, recipe: Recipe) => void }) {
  const services = useServices();
  const [board, setBoard] = React.useState<Board>(boards[0]!);
  // The recipes have to know the board's columns to say whether they apply, and
  // columns are not on the workspace context — they come with the snapshot.
  const snapshot = useQuery({
    queryKey: queryKeys.boardSnapshot(board.id),
    queryFn: () => services.items.loadBoardSnapshot(board.id),
    staleTime: 30_000,
  });
  const shape = React.useMemo(
    () => ({ columns: snapshot.data?.columns ?? [], groups: snapshot.data?.groups ?? [] }),
    [snapshot.data],
  );

  return (
    <>
      {boards.length > 1 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">for</span>
          <Select value={board.id} onValueChange={(id) => setBoard(boards.find((b) => b.id === id) ?? board)}>
            <SelectTrigger className="h-8 w-auto min-w-44" aria-label="Which board a recipe applies to" data-testid="recipe-board">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {boards.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {RECIPES.map((recipe) => {
          const why = snapshot.data ? (recipe.unavailable?.(shape) ?? null) : null;
          const waiting = snapshot.isLoading;
          return (
            <li key={recipe.id}>
              <button
                type="button"
                disabled={waiting || !!why}
                onClick={() => onPick(board, recipe)}
                className={cn(
                  "group relative flex h-full w-full flex-col gap-1.5 rounded-xl border border-border/70 bg-card p-3.5 text-left shadow-xs transition-[border-color,box-shadow,transform]",
                  why ? "cursor-not-allowed opacity-55" : "hover:-translate-y-0.5 hover:border-ring/60 hover:shadow-md",
                )}
                data-testid="automation-recipe"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <recipe.icon className="size-4" />
                </span>
                <span className="text-[13px] leading-snug font-medium">{recipe.title}</span>
                <span className="text-2xs leading-snug text-muted-foreground">{why ?? recipe.description}</span>
                {!why && !waiting && (
                  <span className="mt-auto flex items-center gap-1 pt-1 text-2xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Set it up <ArrowRight className="size-3" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

function BoardRules({ board, rules, onEdit }: { board: Board; rules: AutomationRule[]; onEdit: (rule: AutomationRule) => void }) {
  const ws = useWorkspace();
  const manage = canManageBoard(ws.permissions, board);
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
        <span className={cn("flex size-5 items-center justify-center rounded-md text-white", colorClasses(board.color).solid)}>
          <DynamicIcon name={board.icon} className="size-3" />
        </span>
        {board.name}
        <span className="rounded-full bg-surface-strong/70 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground tabular">{rules.length}</span>
      </h3>
      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id}>
            <RuleCard rule={rule} board={board} canManage={manage} onEdit={() => onEdit(rule)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RuleCard({ rule, board, canManage, onEdit }: { rule: AutomationRule; board: Board; canManage: boolean; onEdit: () => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const snapshot = useQuery({
    queryKey: queryKeys.boardSnapshot(board.id),
    queryFn: () => services.items.loadBoardSnapshot(board.id),
    staleTime: 60_000,
  });
  const vocabulary = React.useMemo(
    () => ({ columns: snapshot.data?.columns ?? [], groups: snapshot.data?.groups ?? [], users: ws.users }),
    [snapshot.data, ws.users],
  );
  const setEnabled = useRuleEnabled();
  const remove = useRuleRemoved();
  const scheduled = TRIGGER_TIMING[rule.trigger.kind] === "schedule";

  return (
    <div
      className={cn("rounded-xl border border-border/70 bg-card p-3.5 shadow-xs transition-colors", !rule.enabled && "opacity-60")}
      data-testid="automation-rule"
    >
      <div className="flex items-start gap-3">
        <Switch
          checked={rule.enabled}
          onCheckedChange={(next) => setEnabled.mutate({ id: rule.id, enabled: next })}
          disabled={!canManage}
          aria-label={rule.enabled ? `Turn off ${rule.name}` : `Turn on ${rule.name}`}
          className="mt-0.5"
          data-testid="automation-toggle"
        />
        <button type="button" onClick={canManage ? onEdit : undefined} className="min-w-0 flex-1 text-left" data-testid="automation-open">
          <p className="text-[13px] font-medium">{rule.name}</p>
          {/* The rule as two halves rather than one long sentence: the eye can
              find "when" and "then" in a list of twenty, and cannot find a
              clause in the middle of a paragraph. */}
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs">
            <Chip tone={scheduled ? "clock" : "when"}>{snapshot.data ? describeTrigger(rule.trigger, vocabulary) : "…"}</Chip>
            <ArrowRight aria-hidden className="size-3 shrink-0 text-muted-foreground/60" />
            {rule.actions.slice(0, 3).map((action, i) => (
              <Chip key={i} tone="then">
                {snapshot.data ? describeAutomationAction(action, vocabulary) : "…"}
              </Chip>
            ))}
            {rule.actions.length > 3 && <span className="text-muted-foreground">+{rule.actions.length - 3} more</span>}
          </p>
        </button>
        {canManage && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => remove.mutate(rule.id)}
            aria-label={`Remove ${rule.name}`}
            data-testid="automation-remove"
          >
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
// What has actually happened
// ---------------------------------------------------------------------------

function RunFeed({ runs, loading }: { runs: AutomationRun[]; loading: boolean }) {
  const ws = useWorkspace();
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!runs || runs.length === 0) {
    return <EmptyState icon={CircleSlash} title="Nothing has run yet" description="Every firing lands here, including the ones a condition held back." compact />;
  }
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
      {runs.slice(0, 40).map((run) => {
        const board = ws.boardById(run.boardId);
        return (
          <li key={run.id} className="flex items-start gap-3 px-3.5 py-2.5" data-testid="automation-run">
            <span
              aria-hidden
              className={cn(
                "mt-1.5 size-2 shrink-0 rounded-full",
                run.status === "ran" ? "bg-green-500" : run.status === "skipped" ? "bg-muted-foreground/50" : "bg-destructive",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px]">{run.summary}</p>
              {run.detail && <p className="text-2xs text-muted-foreground">{run.detail}</p>}
            </div>
            {board && <span className="hidden shrink-0 text-2xs text-muted-foreground sm:block">{board.name}</span>}
            <span className="shrink-0 text-2xs text-muted-foreground">
              <RelativeTime iso={run.createdAt} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { AutomationRule, AutomationRuleInput, AutomationRulePatch, EntityId } from "@/domain";
import { HEARTBEAT_STALE_MINUTES } from "@/domain";
import { NO_BUSY_BOARDS, reconcileBusy, type BusySince } from "@/features/automations/activity";
import { useDataContext, useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import type { RuleVocabulary } from "@/services";

/** The rules on a board, and the log of what they have done. */
export function useAutomations(boardId: EntityId) {
  const services = useServices();
  const bindings = React.useMemo<RealtimeBinding[]>(
    () => [
      { table: "automation_rules", filter: `board_id=eq.${boardId}`, keys: [queryKeys.automations(boardId)] },
      { table: "automation_runs", filter: `board_id=eq.${boardId}`, keys: [queryKeys.automationRuns(boardId)] },
    ],
    [boardId],
  );
  // Worth a channel while somebody has this open: a rule firing is the thing
  // they are watching for, and it happens on a server they are not.
  useRealtime(`automations:${boardId}`, bindings, { coalesceMs: 500, minIntervalMs: 2_000 });

  return useQuery({
    queryKey: queryKeys.automations(boardId),
    queryFn: () => services.automations.listByBoard(boardId),
    staleTime: 10_000,
  });
}

/** What the rules did, newest first. Read on demand: the log is a second screen, not the first. */
export function useAutomationRuns(boardId: EntityId, enabled: boolean) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.automationRuns(boardId),
    queryFn: () => services.automations.listRuns(boardId, 60),
    enabled,
    staleTime: 5_000,
    refetchInterval: enabled ? 15_000 : false,
  });
}

/**
 * Every rule on every board the reader can see.
 *
 * Not filtered here: `automation_rules_select` only returns rules on boards the
 * reader could open (supabase/policies/0017), so "limited to your boards" is a
 * property of the data rather than a filter a component could forget.
 */
export function useWorkspaceAutomations(workspaceId: EntityId) {
  const services = useServices();
  const bindings = React.useMemo<RealtimeBinding[]>(
    () => [{ table: "automation_rules", filter: `workspace_id=eq.${workspaceId}`, keys: [queryKeys.workspaceAutomations(workspaceId)] }],
    [workspaceId],
  );
  useRealtime(`automations-workspace:${workspaceId}`, bindings, { coalesceMs: 500, minIntervalMs: 2_000 });
  return useQuery({
    queryKey: queryKeys.workspaceAutomations(workspaceId),
    queryFn: () => services.automations.listByWorkspace(workspaceId),
    staleTime: 10_000,
  });
}

/** What the rules have been doing, across those same boards. */
export function useWorkspaceAutomationRuns(boardIds: EntityId[]) {
  const services = useServices();
  const key = React.useMemo(() => [...boardIds].sort().join(","), [boardIds]);
  return useQuery({
    queryKey: ["automation-runs-workspace", key],
    queryFn: () => services.repos.automations.listRunsForBoards(boardIds, 60),
    enabled: boardIds.length > 0,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

const NO_ACTIVITY: ReadonlySet<EntityId> = new Set();

/**
 * Boards in this workspace with an automation at work.
 *
 * "At work" means a row in `automation_events` for the board that the runner
 * has not processed yet — the honest signal, because it is the very thing the
 * runner reads. The queue is in the realtime publication (migrations/0054), so
 * a row appearing or being finished refreshes the answer within a moment; the
 * interval underneath is for a channel that dropped. The header and the
 * sidebar both ask, and share one channel and one query between them.
 *
 * A board stays in the set for a short hold after its queue empties
 * (`reconcileBusy`), because a nudged runner is usually done inside a second
 * and an indicator that never got a frame on screen told nobody anything.
 *
 * Only the Supabase provider has a runner. Anywhere else nothing is ever
 * running, and the set is empty.
 */
export function useAutomationActivity(): ReadonlySet<EntityId> {
  const services = useServices();
  const { providerKind } = useDataContext();
  const ws = useWorkspace();
  const live = providerKind === "supabase";

  // Unfiltered: the queue has no workspace column, and RLS already narrows it
  // to boards this person may see. Coalesced briefly, because the row this is
  // waiting on is often finished within the second it was raised.
  const bindings = React.useMemo<RealtimeBinding[]>(() => [{ table: "automation_events", keys: [queryKeys.automationPending] }], []);
  useRealtime(live ? `automation-activity:${ws.workspace.id}` : null, bindings, { coalesceMs: 150 });

  const { data: pending } = useQuery({
    queryKey: queryKeys.automationPending,
    queryFn: () => services.repos.automations.listPendingBoardIds(),
    enabled: live,
    staleTime: 2_000,
    refetchInterval: live ? 60_000 : false,
  });

  // The held set lives in a ref and is mirrored into state, so the timer that
  // lets a board go can read the current answer without going through React.
  const held = React.useRef<BusySince>(NO_BUSY_BOARDS);
  const [busy, setBusy] = React.useState<BusySince>(NO_BUSY_BOARDS);
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      timer = null;
      const { next, recheckIn } = reconcileBusy(held.current, pending ?? [], Date.now());
      if (next !== held.current) {
        held.current = next;
        setBusy(next);
      }
      if (recheckIn !== null) timer = setTimeout(settle, recheckIn);
    };
    settle();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pending]);

  // The policy scopes the answer to boards this person can see, across every
  // workspace they belong to; the shell only wants this one's.
  return React.useMemo(() => {
    if (busy.size === 0) return NO_ACTIVITY;
    return new Set([...busy.keys()].filter((id) => ws.boardById(id)));
  }, [busy, ws]);
}

/**
 * Switching a rule on or off, from anywhere.
 *
 * Its own hook rather than part of `useAutomationMutations` because the
 * workspace screen has no board vocabulary to hand and does not need one:
 * nothing is being validated, only a boolean flipped.
 */
export function useRuleEnabled() {
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: EntityId; enabled: boolean }) => services.automations.setEnabled(id, enabled),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not change the automation"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["automations"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-automations"] });
    },
  });
}

/**
 * Firing a quick run against chosen tasks.
 *
 * The board snapshot is invalidated afterwards because the actions almost
 * certainly changed cells on it, and the run log because every action wrote a
 * row. The toast says what the report says rather than "done": a run where two
 * of five tasks were skipped is not done, and the person should hear so.
 */
export function useQuickRun(boardId: EntityId) {
  const services = useServices();
  const queryClient = useQueryClient();
  const ws = useWorkspace();
  return useMutation({
    mutationFn: ({ ruleId, itemIds }: { ruleId: EntityId; itemIds: EntityId[] }) => services.automations.runNow(ruleId, itemIds, ws.currentUser.id),
    onSuccess: (report) => {
      const parts: string[] = [];
      if (report.ran > 0) parts.push(`${report.ran} ${report.ran === 1 ? "action" : "actions"} ran`);
      if (report.skipped > 0) parts.push(`${report.skipped} skipped`);
      if (report.failed > 0) parts.push(`${report.failed} failed`);
      const line = parts.join(", ") || "Nothing to do";
      if (report.failed > 0) toast.error(line);
      else toast.success(line);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "The quick run could not be started"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(boardId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automations(boardId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automationRuns(boardId) });
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Removing a rule from anywhere, board vocabulary not required. */
export function useRuleRemoved() {
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: EntityId) => services.automations.delete(id),
    onSuccess: () => toast.success("Automation removed"),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not remove the automation"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["automations"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-automations"] });
    },
  });
}

/**
 * Whether anything is actually driving the runner.
 *
 * The one question the rest of this screen cannot answer. A board with rules
 * and an empty log looks identical whether no rule has matched or nothing has
 * called the server since last week, and the second is the one that needs a
 * person. Only read while the dialog is open, and only when the board has a
 * rule worth worrying about.
 */
export function useAutomationRunnerHealth(enabled: boolean) {
  const services = useServices();
  // The age is worked out when the answer is fetched rather than when it is
  // rendered: reading the clock during render makes a component whose output
  // depends on when React happened to call it. A refetch every minute keeps the
  // figure inside a minute of the truth, against a twenty-minute threshold.
  const query = useQuery({
    queryKey: ["automation-heartbeat"],
    queryFn: async () => {
      const beat = await services.repos.automations.readHeartbeat();
      return { beat, minutesAgo: beat ? (Date.now() - Date.parse(beat.lastRunAt)) / 60_000 : null };
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
  });
  const beat = query.data?.beat ?? null;
  const minutesAgo = query.data?.minutesAgo ?? null;
  return {
    beat,
    loading: query.isLoading,
    // Never run at all, or not for longer than any shipped driver's interval.
    stale: enabled && !query.isLoading && query.isSuccess && (beat === null || (minutesAgo ?? 0) > HEARTBEAT_STALE_MINUTES),
    minutesAgo,
  };
}

export function useAutomationMutations(boardId: EntityId, vocabulary: RuleVocabulary) {
  const services = useServices();
  const queryClient = useQueryClient();
  const key = queryKeys.automations(boardId);
  const settled = { onSettled: () => queryClient.invalidateQueries({ queryKey: key }) };
  const failed = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const create = useMutation({
    mutationFn: (input: AutomationRuleInput) => services.automations.create(input, vocabulary),
    onSuccess: () => toast.success("Automation saved"),
    onError: failed("Could not save the automation"),
    ...settled,
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: EntityId; patch: AutomationRulePatch }) => services.automations.update(id, patch, vocabulary),
    onSuccess: () => toast.success("Automation saved"),
    onError: failed("Could not save the automation"),
    ...settled,
  });

  const setEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: EntityId; enabled: boolean }) => services.automations.setEnabled(id, enabled),
    // Answered in place: a switch that waits for a round trip feels broken.
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AutomationRule[]>(key);
      queryClient.setQueryData<AutomationRule[]>(key, (rules) => rules?.map((rule) => (rule.id === id ? { ...rule, enabled } : rule)));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      failed("Could not change the automation")(error);
    },
    ...settled,
  });

  const remove = useMutation({
    mutationFn: (id: EntityId) => services.automations.delete(id),
    onSuccess: () => toast.success("Automation removed"),
    onError: failed("Could not remove the automation"),
    ...settled,
  });

  return { create, update, setEnabled, remove };
}

/**
 * One nudge at a time, for the whole tab.
 *
 * A person dragging three cells in a row would otherwise send three requests
 * that each drain the same queue. The first waits a moment for the burst to
 * finish; anything that arrives while a nudge is in flight is folded into one
 * more nudge after it, so the last edit is never the one that got missed.
 */
const NUDGE_SETTLE_MS = 150;
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;
let nudgeInFlight: Promise<void> | null = null;
let nudgeAgain = false;

function nudgeSoon(send: () => Promise<void>): void {
  if (nudgeTimer) return;
  nudgeTimer = setTimeout(() => {
    nudgeTimer = null;
    if (nudgeInFlight) {
      nudgeAgain = true;
      return;
    }
    nudgeInFlight = send().finally(() => {
      nudgeInFlight = null;
      if (nudgeAgain) {
        nudgeAgain = false;
        nudgeSoon(send);
      }
    });
  }, NUDGE_SETTLE_MS);
}

/**
 * Asks the server to drain the queue now.
 *
 * Purely so somebody watching a board sees their rule fire in a second rather
 * than at the next tick of the cron. Fire-and-forget: `AutomationService.nudge`
 * swallows failure, and in the local provider it does nothing at all, because
 * there is no server to nudge.
 *
 * It also re-reads the pending set at once. The event row was written in the
 * same transaction as the edit, so it is already there to be found, and the
 * indicator can come on now rather than when the realtime channel gets round
 * to saying so. A board with no rule has no row, and stays quiet.
 */
export function useAutomationNudge(): () => void {
  const services = useServices();
  const queryClient = useQueryClient();
  return React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.automationPending });
    nudgeSoon(() => services.automations.nudge());
  }, [services, queryClient]);
}

/** The board's own words, which every picker in the builder is filled from. */
export function useRuleVocabulary(columns: RuleVocabulary["columns"], groups: RuleVocabulary["groups"]): RuleVocabulary {
  const ws = useWorkspace();
  return React.useMemo(() => ({ columns, groups, users: ws.users }), [columns, groups, ws.users]);
}

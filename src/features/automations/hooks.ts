"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { AutomationRule, AutomationRuleInput, AutomationRulePatch, EntityId } from "@/domain";
import { HEARTBEAT_STALE_MINUTES } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { getAppConfig } from "@/lib/config";
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
 * Asks the server to drain the queue now.
 *
 * Purely so somebody watching a board sees their rule fire in a second rather
 * than at the next tick of the cron. It is fire-and-forget and its failure is
 * silent on purpose: the runner is called on a schedule whatever happens here,
 * and a toast saying "could not run automations" after an edit that saved
 * perfectly well would be a lie about what went wrong.
 *
 * Only in the Supabase provider. In local mode there is no server to nudge.
 */
export function useAutomationNudge(): () => void {
  const supabase = getAppConfig().dataProvider === "supabase";
  return React.useCallback(() => {
    if (!supabase || typeof fetch !== "function") return;
    void fetch("/api/automations/run?sweep=0", { method: "POST", keepalive: true }).catch(() => undefined);
  }, [supabase]);
}

/** The board's own words, which every picker in the builder is filled from. */
export function useRuleVocabulary(columns: RuleVocabulary["columns"], groups: RuleVocabulary["groups"]): RuleVocabulary {
  const ws = useWorkspace();
  return React.useMemo(() => ({ columns, groups, users: ws.users }), [columns, groups, ws.users]);
}

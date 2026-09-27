"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Check } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Subscription, SubscriptionEvent, SubscriptionTarget } from "@/domain";
import { DEFAULT_BOARD_EVENTS, DEFAULT_ITEM_EVENTS, SUBSCRIPTION_EVENTS, SUBSCRIPTION_EVENT_HINTS, SUBSCRIPTION_EVENT_LABELS } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

/** Everything the reader follows in this workspace. */
export function useMySubscriptions() {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.subscriptions(ws.workspace.id, ws.currentUser.id),
    queryFn: () => services.subscriptions.listMine(ws.currentUser.id, ws.workspace.id),
    staleTime: 60_000,
  });
}

/** Follows, changes or stops following one board or task. */
export function useFollow() {
  const services = useServices();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const key = queryKeys.subscriptions(ws.workspace.id, ws.currentUser.id);
  return useMutation({
    mutationFn: ({ target, events }: { target: SubscriptionTarget; events: SubscriptionEvent[] }) => services.subscriptions.follow(ws.currentUser.id, ws.workspace.id, target, events),
    onMutate: async ({ target, events }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Subscription[]>(key);
      queryClient.setQueryData<Subscription[]>(key, (old = []) => {
        const rest = old.filter((s) => !(s.boardId === target.boardId && s.itemId === target.itemId));
        if (events.length === 0) return rest;
        const now = new Date().toISOString();
        const was = old.find((s) => s.boardId === target.boardId && s.itemId === target.itemId);
        return [...rest, { id: was?.id ?? `pending-${target.itemId ?? target.boardId}`, workspaceId: ws.workspace.id, userId: ws.currentUser.id, ...target, events, createdAt: was?.createdAt ?? now, updatedAt: now }];
      });
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      toast.error(error instanceof Error ? error.message : "Could not change what you follow");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences(ws.currentUser.id) });
    },
  });
}

/**
 * The bell on a board or a task: follow it, and choose which changes reach
 * you. Each tick saves at once; ticking none is unfollowing.
 */
export function FollowControl({ target, kind, size = "icon-sm" }: { target: SubscriptionTarget; kind: "board" | "task"; size?: "icon-sm" | "icon-xs" }) {
  const subscriptions = useMySubscriptions();
  const follow = useFollow();
  const current = subscriptions.data?.find((s) => s.boardId === target.boardId && s.itemId === target.itemId) ?? null;
  const following = !!current;
  const events = current?.events ?? [];
  const label = following ? `Following this ${kind}` : `Follow this ${kind}`;

  const toggle = (event: SubscriptionEvent) => follow.mutate({ target, events: events.includes(event) ? events.filter((e) => e !== event) : [...events, event] });

  return (
    <Popover>
      <SimpleTooltip label={label}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size={size} aria-label={label} aria-pressed={following} className={cn(following && "text-ring")} data-testid={`follow-${kind}`}>
            {following ? <BellRing /> : <Bell />}
          </Button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent align="end" className="w-72 p-2" data-testid={`follow-${kind}-popover`}>
        <div className="flex items-center justify-between gap-2 px-1.5 pt-1 pb-2">
          <p className="text-[13px] font-semibold">{following ? `Following this ${kind}` : `Follow this ${kind}`}</p>
          {following ? (
            <Button variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => follow.mutate({ target, events: [] })} data-testid="follow-stop">
              Stop
            </Button>
          ) : (
            <Button size="sm" className="h-7" onClick={() => follow.mutate({ target, events: kind === "board" ? DEFAULT_BOARD_EVENTS : DEFAULT_ITEM_EVENTS })} data-testid="follow-start">
              Follow
            </Button>
          )}
        </div>
        <ul className="space-y-0.5" role="group" aria-label="Changes to hear about">
          {SUBSCRIPTION_EVENTS.map((event) => {
            const on = events.includes(event);
            return (
              <li key={event}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(event)}
                  className={cn("flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-accent", !following && "opacity-80")}
                  data-testid={`follow-event-${event}`}
                >
                  <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border", on ? "border-ring bg-ring text-white" : "border-border/80")}>{on && <Check className="size-3" strokeWidth={3} />}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{SUBSCRIPTION_EVENT_LABELS[event]}</span>
                    <span className="block text-2xs text-muted-foreground">{SUBSCRIPTION_EVENT_HINTS[event]}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

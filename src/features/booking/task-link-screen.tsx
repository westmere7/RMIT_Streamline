"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useServices } from "@/features/data/data-context";
import { ShareClosed, ShareGuestProviders, SharePlaceholder, SHARE_REFRESH_MS } from "@/features/share/share-shell";
import { SharedItemScreen } from "@/features/share/shared-item-screen";
import { useReaderOpenings } from "@/features/items/shared-panel-menu";
import { scheduleToday } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";

/**
 * A booking's own task, read-only, from the link on its receipt
 * (src/domain/booking/task-link.ts). The same page a shared task gets, without
 * a password or a sign-in: the signature in the link is the key, and the link
 * works for as long as the task exists, archived included.
 */
export function TaskLinkScreen({ token }: { token: string }) {
  const services = useServices();
  const payload = useQuery({
    queryKey: ["task-link", token],
    queryFn: () => services.taskLinks.open(token),
    retry: false,
    staleTime: SHARE_REFRESH_MS,
    refetchInterval: SHARE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  // Where else it opens for this reader (its board, the portal): asked once the task has opened, and once only.
  const openings = useQuery({
    queryKey: ["task-link-openings", token],
    queryFn: () => services.taskLinks.openings(token),
    enabled: !!payload.data,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const readerOpenings = useReaderOpenings(openings.data);

  // An archived task is still the requester's: shown as it is, with a line saying so.
  // The shared-task view leaves archived rows out, so it is handed them as live.
  const archivedAt = payload.data?.items.find((item) => item.id === payload.data!.itemId)?.archivedAt ?? null;
  const shown = React.useMemo(() => (payload.data ? { ...payload.data, items: payload.data.items.map((item) => (item.archivedAt ? { ...item, archivedAt: null } : item)) } : null), [payload.data]);

  if (shown) {
    return (
      <ShareGuestProviders payload={shown} path={typeof window === "undefined" ? "" : window.location.pathname}>
        <div data-testid="task-link-page" data-archived={archivedAt ? "true" : undefined}>
          {archivedAt && (
            <p className="border-b border-border/60 bg-surface-strong/60 px-4 py-2 text-center text-[13px] text-muted-foreground" data-testid="task-link-archived">
              The team archived this request on {formatShortDate(scheduleToday(new Date(archivedAt)))}.
            </p>
          )}
          <SharedItemScreen payload={shown} openings={readerOpenings} archived={!!archivedAt} />
        </div>
      </ShareGuestProviders>
    );
  }
  if (payload.isError) {
    const message = payload.error instanceof Error ? payload.error.message : "";
    const off = /turned off|switched off|off/i.test(message) && !/does not open/i.test(message);
    return (
      <div data-testid="task-link-closed">
        <ShareClosed
          title={off ? "This link is switched off" : "This link does not open a task"}
          message={off ? "The team has turned off task links on their booking form. Ask them about your request." : "Check that you copied all of it, or ask the team for the link again."}
        />
      </div>
    );
  }
  return <SharePlaceholder label="Opening your request…" />;
}

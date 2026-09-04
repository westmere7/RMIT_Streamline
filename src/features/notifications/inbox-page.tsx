"use client";

import { AtSign, Bell, CalendarDays, CheckCheck, CircleDot, Inbox, Link2, MessageSquare, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notification, NotificationType } from "@/domain";
import { useNotificationMutations, useNotifications } from "@/features/notifications/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  MENTION: AtSign,
  ASSIGNED: UserPlus,
  DUE_DATE_CHANGED: CalendarDays,
  STATUS_CHANGED: CircleDot,
  COMMENT: MessageSquare,
  BOARD_INVITE: Bell,
  ITEM_LINKED: Link2,
};

export function InboxPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const notifications = useNotifications(ws.currentUser.id);
  const { markRead, markAllRead } = useNotificationMutations(ws.currentUser.id);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");

  const list = (notifications.data ?? []).filter((n) => filter === "all" || n.readAt === null);
  const unread = (notifications.data ?? []).filter((n) => n.readAt === null).length;

  const open = (n: Notification) => {
    if (n.readAt === null) markRead.mutate({ id: n.id, read: true });
    const board = ws.boardById(n.boardId ?? (n.entityType === "BOARD" ? n.entityId : null));
    if (!board) return;
    router.push(n.entityType === "ITEM" ? ws.boardPath(board, { itemId: n.entityId }) : ws.boardPath(board));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Inbox"
        description={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "You are all caught up."}
        actions={
          <>
            <div className="inline-flex h-8 items-center rounded-md bg-muted p-0.5 text-[13px]">
              {(["all", "unread"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn("h-7 rounded-[5px] px-3 font-medium capitalize", filter === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" disabled={unread === 0 || markAllRead.isPending} onClick={() => markAllRead.mutate()}>
              <CheckCheck /> Mark all read
            </Button>
          </>
        }
      />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto w-full max-w-5xl">
        {notifications.isLoading && (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        )}
        {notifications.isError && <ErrorState title="Could not load notifications." error={notifications.error} onRetry={() => notifications.refetch()} />}
        {notifications.data && list.length === 0 && (
          <EmptyState icon={Inbox} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} description="Mentions, assignments and due date changes will land here." />
        )}
        {list.length > 0 && (
          <ul className="mt-2 divide-y rounded-md border">
            {list.map((n) => {
              const Icon = TYPE_ICONS[n.type];
              const actor = ws.userById(n.actorId);
              const unreadItem = n.readAt === null;
              return (
                <li key={n.id}>
                  <div className={cn("flex items-start gap-3 px-3 py-2.5 hover:bg-accent", unreadItem && "bg-blue-50/40 dark:bg-navy-500/20")}>
                    <button type="button" onClick={() => open(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left" data-testid="notification">
                      <span className="relative mt-0.5">
                        <UserAvatar user={actor} size="md" tooltip={false} />
                        <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
                          <Icon className="size-2.5" />
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[13px]", unreadItem ? "font-medium" : "text-foreground/90")}>{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                        <span className="mt-0.5 block text-2xs text-muted-foreground">
                          <RelativeTime iso={n.createdAt} />
                          {n.boardId && ws.boardById(n.boardId) ? ` · ${ws.boardById(n.boardId)?.name}` : ""}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={unreadItem ? "Mark as read" : "Mark as unread"}
                      onClick={() => markRead.mutate({ id: n.id, read: unreadItem })}
                      className="mt-1.5 flex size-5 items-center justify-center rounded-full hover:bg-surface-strong"
                    >
                      <span className={cn("size-2 rounded-full", unreadItem ? "bg-primary" : "border border-input")} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </div>
    </div>
  );
}

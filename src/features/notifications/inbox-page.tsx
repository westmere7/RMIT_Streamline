"use client";

import { AtSign, Bell, CalendarDays, CheckCheck, CircleDot, Inbox, Link2, MessageSquare, Settings2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notification, NotificationType, StoredDelivery } from "@/domain";
import { countUnread } from "@/domain";
import { useNotificationMutations, useNotifications } from "@/features/notifications/hooks";
import { NotificationSettingsDialog } from "@/features/notifications/notification-settings-dialog";
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

/** The three lists: everything, the ones that interrupted, the quiet ones. */
type Tab = "all" | "notifications" | "updates";

const TABS: Array<{ id: Tab; label: string; delivery?: StoredDelivery }> = [
  { id: "all", label: "All" },
  { id: "notifications", label: "Notifications", delivery: "NOTIFICATION" },
  { id: "updates", label: "Updates", delivery: "UPDATE" },
];

export function InboxPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const notifications = useNotifications(ws.currentUser.id);
  const { markRead, markAllRead } = useNotificationMutations(ws.currentUser.id);
  const [tab, setTab] = React.useState<Tab>("all");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const all = React.useMemo(() => notifications.data ?? [], [notifications.data]);
  const current = TABS.find((t) => t.id === tab)!;
  const list = all
    .filter((n) => !current.delivery || n.delivery === current.delivery)
    .filter((n) => !unreadOnly || n.readAt === null);
  const counts = countUnread(all);
  const unreadHere = list.filter((n) => n.readAt === null).length;

  const open = (n: Notification) => {
    if (n.readAt === null) markRead.mutate({ id: n.id, read: true });
    const board = ws.boardById(n.boardId ?? (n.entityType === "BOARD" ? n.entityId : null));
    if (!board) return;
    router.push(n.entityType === "ITEM" ? ws.boardPath(board, { itemId: n.entityId }) : ws.boardPath(board));
  };

  const description = () => {
    if (counts.notifications === 0 && counts.updates === 0) return "You are all caught up.";
    const parts: string[] = [];
    if (counts.notifications > 0) parts.push(`${counts.notifications} unread notification${counts.notifications === 1 ? "" : "s"}`);
    if (counts.updates > 0) parts.push(`${counts.updates} unread update${counts.updates === 1 ? "" : "s"}`);
    return parts.join(" · ");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader
          title="Inbox"
          description={description()}
          actions={
            <>
              <div className="inline-flex h-8 items-center rounded-md bg-muted p-0.5 text-[13px]" role="tablist" aria-label="Inbox filter">
                {TABS.map((t) => {
                  const badge = t.id === "notifications" ? counts.notifications : t.id === "updates" ? counts.updates : 0;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.id}
                      onClick={() => setTab(t.id)}
                      data-testid={`inbox-tab-${t.id}`}
                      className={cn(
                        "flex h-7 items-center gap-1.5 rounded-[5px] px-3 font-medium",
                        tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t.label}
                      {badge > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 text-2xs font-semibold tabular",
                            t.id === "notifications" ? "bg-primary text-white" : "bg-surface-strong text-muted-foreground",
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <Button
                variant={unreadOnly ? "secondary" : "outline"}
                size="sm"
                aria-pressed={unreadOnly}
                onClick={() => setUnreadOnly((v) => !v)}
                data-testid="inbox-unread-only"
              >
                Unread only
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={unreadHere === 0 || markAllRead.isPending}
                onClick={() => markAllRead.mutate(current.delivery)}
                data-testid="mark-all-read"
              >
                <CheckCheck /> Mark all read
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} data-testid="notification-settings-button">
                <Settings2 /> Settings
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
            <EmptyState
              icon={Inbox}
              title={emptyTitle(tab, unreadOnly)}
              description={
                tab === "updates"
                  ? "Quiet things — status and date changes, linked items — collect here instead of interrupting you."
                  : "Mentions, assignments and due date changes will land here."
              }
            />
          )}
          {list.length > 0 && (
            <ul className="mt-2 divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
              {list.map((n) => {
                const Icon = TYPE_ICONS[n.type];
                const actor = ws.userById(n.actorId);
                const unreadItem = n.readAt === null;
                const quiet = n.delivery === "UPDATE";
                return (
                  <li key={n.id}>
                    <div
                      className={cn("flex items-start gap-3 px-3 py-2.5 hover:bg-accent", unreadItem && (quiet ? "bg-surface/70" : "bg-blue-50/40 dark:bg-navy-500/20"))}
                      data-testid="notification-row"
                      data-delivery={n.delivery}
                      data-unread={unreadItem ? "true" : "false"}
                    >
                      <button type="button" onClick={() => open(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left" data-testid="notification">
                        <span className="relative mt-0.5">
                          <UserAvatar user={actor} size="md" tooltip={false} />
                          <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
                            <Icon className="size-2.5" />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className={cn("min-w-0 flex-1 truncate text-[13px]", unreadItem ? "font-medium" : "text-foreground/90")}>{n.title}</span>
                            {quiet && (
                              <span className="shrink-0 rounded-full bg-surface-strong px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">Update</span>
                            )}
                          </span>
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
                        <span
                          className={cn(
                            "size-2 rounded-full",
                            unreadItem ? (quiet ? "bg-muted-foreground/70" : "bg-primary") : "border border-input",
                          )}
                        />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <NotificationSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}

function emptyTitle(tab: Tab, unreadOnly: boolean): string {
  if (unreadOnly) return tab === "updates" ? "No unread updates" : tab === "notifications" ? "No unread notifications" : "Nothing unread";
  return tab === "updates" ? "No updates yet" : tab === "notifications" ? "No notifications yet" : "No notifications yet";
}

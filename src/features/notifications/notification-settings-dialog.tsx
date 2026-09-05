"use client";

import { Bell, BellOff, Check, MonitorSmartphone } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { NotificationDelivery, NotificationType } from "@/domain";
import {
  DEFAULT_TYPE_DELIVERY,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_DESCRIPTIONS,
  NOTIFICATION_TYPE_LABELS,
  isBoardMuted,
} from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useBrowserPermission } from "@/features/notifications/use-browser-permission";
import { useNotificationPreferenceMutations, useNotificationPreferences } from "@/features/notifications/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import {
  browserNotificationsSupported,
  currentPermission,
  requestBrowserPermission,
  showOsNotification,
  type BrowserPermission,
} from "@/lib/browser-notifications";
import { colorClasses } from "@/lib/colors";
import { canViewBoard } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

const DELIVERY_CHOICES: Array<{ value: NotificationDelivery; label: string; hint: string }> = [
  { value: "NOTIFICATION", label: "Notify", hint: "Red badge, and an OS notification if allowed" },
  { value: "UPDATE", label: "Update", hint: "Grey badge in the inbox, no interruption" },
  { value: "OFF", label: "Off", hint: "Never written" },
];

const PERMISSION_TEXT: Record<BrowserPermission, string> = {
  unsupported: "This browser cannot show notifications.",
  default: "Your browser has not been asked yet.",
  granted: "Your browser is allowed to show notifications.",
  denied: "Your browser is blocking notifications for this site. Allow them in the site settings to turn this back on.",
};

export function NotificationSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const user = useCurrentUser();
  const ws = useWorkspace();
  const preferences = useNotificationPreferences(user.id);
  const { save, setBoardSubscribed } = useNotificationPreferenceMutations(user.id);
  // Subscribed rather than read once: the permission can change in the browser's
  // own site settings while this dialog is open.
  const permission = useBrowserPermission();

  const types = preferences.data?.types ?? DEFAULT_TYPE_DELIVERY;
  const browserEnabled = preferences.data?.browserEnabled ?? false;

  // Boards this person is a member of are the ones they can unsubscribe from.
  const myBoards = ws.boards
    .filter((board) => board.archivedAt === null)
    .filter((board) => ws.boardMembers.some((m) => m.boardId === board.id && m.userId === user.id))
    .filter((board) => canViewBoard(ws.permissions, board))
    .sort((a, b) => a.name.localeCompare(b.name));

  const enableBrowser = async (next: boolean) => {
    if (!next) {
      save.mutate({ browserEnabled: false });
      return;
    }
    // Asking has to happen inside this click: every browser refuses a prompt
    // that is not the direct result of a gesture.
    let state = currentPermission();
    if (state === "default") state = await requestBrowserPermission();
    if (state !== "granted") {
      toast.error(state === "denied" ? "Your browser is blocking notifications for this site." : "This browser cannot show notifications.");
      return;
    }
    save.mutate({ browserEnabled: true });
  };

  const sendTest = () => {
    const shown = showOsNotification(
      { id: `test-${Date.now()}`, title: "Streamline notifications are on", body: "This is what an incoming notification looks like.", url: `/workspace/${ws.slug}/inbox` },
      () => undefined,
    );
    if (!shown) toast.error("The browser would not show it. Check the site's notification permission.");
    else toast.success("Sent — look for it in the corner of your screen.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-4" data-testid="notification-settings">
        <DialogHeader>
          <DialogTitle>Notification settings</DialogTitle>
          <DialogDescription>
            Choose what interrupts you and what is collected quietly. Everything still lands in the inbox unless you turn it off.
          </DialogDescription>
        </DialogHeader>

        <div className="scrollbar-thin -mx-1 min-h-0 overflow-y-auto px-1">
        <section className="rounded-xl border border-border/70 bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-[13px] font-medium">
                <MonitorSmartphone className="size-4 text-muted-foreground" />
                Notifications on this device
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Shows a notification from your operating system when something arrives while you are working elsewhere. It needs a tab
                open — closing Streamline stops them.
              </p>
              <p className={cn("mt-1.5 text-2xs", permission === "denied" ? "text-destructive" : "text-muted-foreground")}>
                {PERMISSION_TEXT[permission]}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Switch
                checked={browserEnabled && permission === "granted"}
                disabled={!browserNotificationsSupported() || permission === "denied"}
                onCheckedChange={(next) => void enableBrowser(next)}
                aria-label="Notifications on this device"
                data-testid="browser-notifications-toggle"
              />
              {browserEnabled && permission === "granted" && (
                <Button variant="outline" size="sm" onClick={sendTest} data-testid="send-test-notification">
                  Send a test
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="mt-4">
          <h3 className="mb-2 text-[13px] font-medium">What reaches you, and how</h3>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card">
            {NOTIFICATION_TYPES.map((type) => (
              <li key={type} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{NOTIFICATION_TYPE_LABELS[type]}</span>
                  <span className="block text-xs text-muted-foreground">{NOTIFICATION_TYPE_DESCRIPTIONS[type]}</span>
                </span>
                <DeliveryPicker
                  type={type}
                  value={types[type] ?? DEFAULT_TYPE_DELIVERY[type]}
                  onChange={(delivery) => save.mutate({ types: { [type]: delivery } as Record<NotificationType, NotificationDelivery> })}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4">
          <h3 className="mb-1 text-[13px] font-medium">Boards you follow</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Unsubscribe from a board and nothing from it reaches your inbox — you keep your access to the board itself.
          </p>
          {myBoards.length === 0 ? (
            <p className="rounded-xl border border-border/70 bg-card px-3 py-4 text-[13px] text-muted-foreground">
              You are not a member of any board yet.
            </p>
          ) : (
            <ul className="scrollbar-thin max-h-64 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70 bg-card">
              {myBoards.map((board) => {
                const muted = isBoardMuted(preferences.data, board.id);
                return (
                  <li key={board.id} className="flex items-center gap-3 px-3 py-2" data-testid="board-subscription" data-board={board.name}>
                    <DynamicIcon name={board.icon} className={cn("size-4 shrink-0", colorClasses(board.color).text)} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{board.name}</span>
                    <span className={cn("text-2xs", muted ? "text-muted-foreground" : "text-muted-foreground/70")}>
                      {muted ? "Unsubscribed" : "Subscribed"}
                    </span>
                    <Switch
                      checked={!muted}
                      onCheckedChange={(next) => setBoardSubscribed.mutate({ boardId: board.id, subscribed: next })}
                      aria-label={`Notifications from ${board.name}`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Three states, one row: notify, quietly collect, or never write it. */
function DeliveryPicker({
  type,
  value,
  onChange,
}: {
  type: NotificationType;
  value: NotificationDelivery;
  onChange: (delivery: NotificationDelivery) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={NOTIFICATION_TYPE_LABELS[type]}
      className="inline-flex h-8 shrink-0 items-center rounded-lg bg-surface p-0.5 text-[13px]"
    >
      {DELIVERY_CHOICES.map((choice) => {
        const active = value === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${NOTIFICATION_TYPE_LABELS[type]}: ${choice.label}`}
            title={choice.hint}
            data-testid={`delivery-${type}-${choice.value}`}
            onClick={() => onChange(choice.value)}
            className={cn(
              "flex h-7 items-center gap-1 rounded-md px-2.5 font-medium transition-colors",
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && <Check className="size-3" />}
            {choice.label}
          </button>
        );
      })}
    </div>
  );
}

/** The icon the inbox and the board menu use for a muted board. */
export const MuteIcon = BellOff;
export const NotifyIcon = Bell;

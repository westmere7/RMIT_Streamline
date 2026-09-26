"use client";

import { BellRing } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useNotificationPreferenceMutations, useNotificationPreferences } from "@/features/notifications/hooks";
import { currentPermission, requestBrowserPermission, subscribeToPermission, type BrowserPermission } from "@/lib/browser-notifications";
import { cn } from "@/lib/utils";

/** "Not now" is remembered per browser: the permission it is about is the browser's too. */
const DISMISSED_KEY = "streamline.notifications.prompt";

const listeners = new Set<() => void>();

function subscribeDismissed(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function dismissedNow(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "dismissed";
  } catch {
    return true;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, "dismissed");
  } catch {
    // Not remembered; the card comes back next visit.
  }
  listeners.forEach((listener) => listener());
}

/**
 * Asks a browser that has never been asked to show notifications, so they
 * reach this person later, in another tab or window. Browsers only put up
 * their permission prompt for a tap, and quietly block a site that asks on
 * page load, so this is a card with a button rather than a prompt out of
 * nowhere. Allowing also switches on the person's own setting, which the
 * operating-system notifications need as well.
 *
 * Shown only while this browser's answer is still open: not once it has
 * allowed or blocked them, not where they cannot be shown, and not after
 * "Not now".
 */
export function NotificationPrompt({ className }: { className?: string }) {
  const user = useCurrentUser();
  // Nothing on the server or before hydration, so a browser that has already
  // answered never sees the card flash up and go.
  const permission = React.useSyncExternalStore<BrowserPermission>(subscribeToPermission, currentPermission, () => "unsupported");
  const dismissed = React.useSyncExternalStore(subscribeDismissed, dismissedNow, () => true);
  const preferences = useNotificationPreferences(user.id);
  const { save } = useNotificationPreferenceMutations(user.id);
  const [asking, setAsking] = React.useState(false);
  // Older Safari says nothing when the answer changes, so the card goes on the answer itself.
  const [answered, setAnswered] = React.useState(false);

  if (permission !== "default" || dismissed || answered || !preferences.data) return null;

  const turnOn = async () => {
    setAsking(true);
    try {
      const answer = await requestBrowserPermission();
      if (answer !== "default") setAnswered(true);
      if (answer === "granted") {
        if (!preferences.data?.browserEnabled) save.mutate({ browserEnabled: true });
        toast.success("Notifications are on.");
      } else if (answer === "denied") {
        toast("The browser blocked them. You can allow them in its site settings.");
      }
    } finally {
      setAsking(false);
    }
  };

  return (
    <section
      aria-label="Notifications"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-xs", className)}
      data-testid="notification-prompt"
    >
      <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BellRing className="size-4" />
      </span>
      <p className="min-w-0 flex-1 basis-56 text-[13px]">Get notified when someone mentions you or gives you work.</p>
      <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:[&>button]:flex-1">
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={asking} data-testid="notification-prompt-later">
          Not now
        </Button>
        <Button type="button" size="sm" onClick={() => void turnOn()} disabled={asking} data-testid="notification-prompt-allow">
          Turn on
        </Button>
      </div>
    </section>
  );
}

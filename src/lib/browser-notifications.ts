/**
 * Operating-system notifications, raised from the page with the Web
 * Notifications API — the same thing a mail or chat site does when it puts a
 * toast in the corner of your screen.
 *
 * This works whenever a tab is open, including a hidden one in another window
 * or space. It deliberately stops there: delivering with the app closed needs a
 * service worker, a push service and VAPID keys on a server, which is a
 * different piece of infrastructure. What is here covers the case that matters
 * for a work tracker people keep open all day.
 */

export type BrowserPermission = "unsupported" | "default" | "granted" | "denied";

/** Notification exists in this browser (it does not in some embedded webviews). */
export function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function currentPermission(): BrowserPermission {
  if (!browserNotificationsSupported()) return "unsupported";
  return window.Notification.permission as BrowserPermission;
}

/**
 * Asks the browser for permission. Must be called from a user gesture — every
 * browser refuses a prompt raised on page load, and Chrome permanently blocks
 * a site that asks without one.
 */
export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (!browserNotificationsSupported()) return "unsupported";
  try {
    return (await window.Notification.requestPermission()) as BrowserPermission;
  } catch {
    // Older Safari passes a callback instead of returning a promise.
    return currentPermission();
  }
}

/**
 * Watches the site's notification permission. The Permissions API is the only
 * way to hear about a change made in the browser's own UI (`Notification.permission`
 * never fires an event), and it is missing in older Safari — where the returned
 * unsubscribe is simply a no-op and the value is read once.
 */
export function subscribeToPermission(onChange: () => void): () => void {
  if (typeof navigator === "undefined" || !("permissions" in navigator)) return () => undefined;
  let status: PermissionStatus | null = null;
  let cancelled = false;
  navigator.permissions
    .query({ name: "notifications" as PermissionName })
    .then((result) => {
      if (cancelled) return;
      status = result;
      result.addEventListener("change", onChange);
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    status?.removeEventListener("change", onChange);
  };
}

export interface RaiseDecisionInput {
  /** How this one arrived; only the loud ones interrupt. */
  delivery: "NOTIFICATION" | "UPDATE";
  /** The person's own switch, from their notification preferences. */
  enabled: boolean;
  permission: BrowserPermission;
  /** `document.visibilityState`. Someone reading the app does not need a toast. */
  visibility: DocumentVisibilityState;
  /** Already shown once — a refetch must not raise it again. */
  alreadySeen: boolean;
}

/**
 * Whether this notification should become an OS notification. Pure, so the rule
 * can be tested without a browser.
 */
export function shouldRaiseOsNotification(input: RaiseDecisionInput): boolean {
  if (input.alreadySeen) return false;
  if (input.delivery !== "NOTIFICATION") return false;
  if (!input.enabled) return false;
  if (input.permission !== "granted") return false;
  // The badge is enough while the page is on screen.
  return input.visibility !== "visible";
}

export interface OsNotificationContent {
  /** Used as the tag, so the same notification never stacks up twice. */
  id: string;
  title: string;
  body: string | null;
  /** Where clicking it should take the reader. */
  url: string;
}

/**
 * Shows one OS notification. Clicking it focuses this tab and follows `onOpen`.
 * Returns false when the browser refused (permission revoked mid-session, or a
 * platform that only allows notifications from a service worker).
 */
export function showOsNotification(content: OsNotificationContent, onOpen: (url: string) => void): boolean {
  if (currentPermission() !== "granted") return false;
  try {
    const notification = new window.Notification(content.title, {
      body: content.body ?? undefined,
      tag: content.id,
      icon: "/icon.svg",
      badge: "/icon.svg",
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
      onOpen(content.url);
    };
    return true;
  } catch (error) {
    // Android Chrome throws here: it only allows notifications through a
    // service worker. Nothing to do but leave the in-app badge to do the job.
    console.warn("[notifications] the browser refused to show a notification", error);
    return false;
  }
}

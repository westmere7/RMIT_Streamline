"use client";

import { useSyncExternalStore } from "react";
import { currentPermission, subscribeToPermission, type BrowserPermission } from "@/lib/browser-notifications";

/**
 * The site's notification permission, kept in step with the browser — including
 * a change made in the browser's own site settings while the app is open.
 */
export function useBrowserPermission(): BrowserPermission {
  return useSyncExternalStore(subscribeToPermission, currentPermission, serverSnapshot);
}

/** Nothing is known before hydration; the settings screen reads it again on mount. */
function serverSnapshot(): BrowserPermission {
  return "default";
}

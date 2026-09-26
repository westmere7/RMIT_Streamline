"use client";

import { WifiOff } from "lucide-react";
import * as React from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Says so while the device has no connection. Nothing is lost meanwhile: a
 * change made offline waits in the page and is sent the moment the connection
 * returns (queries and mutations pause rather than fail), so the banner only
 * explains why nothing new is arriving.
 */
export function OfflineBanner() {
  const online = React.useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-300/60 bg-amber-50 px-3 py-1.5 text-[13px] font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      data-testid="offline-banner"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      You&rsquo;re offline. Changes save when you reconnect.
    </div>
  );
}

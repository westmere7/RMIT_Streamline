"use client";

import * as React from "react";
import { toast } from "sonner";
import { formatVersion, VERSION_CHECK_INTERVAL_MS } from "@/lib/version";
import { selectUpdateAvailable, useVersionStore } from "@/stores/version-store";

const TOAST_ID = "app-update";

/**
 * Keeps an open page aware of the build the server is running. It asks every
 * VERSION_CHECK_INTERVAL_MS while the tab is visible, and again the moment the
 * tab comes back into view or the connection returns. When the server has a
 * build this page does not, a notice offers to reload. Nothing is forced: the
 * page keeps working, and "Later" keeps the notice away for that build.
 */
export function VersionWatcher() {
  const check = useVersionStore((s) => s.check);
  const dismiss = useVersionStore((s) => s.dismiss);
  const latest = useVersionStore((s) => s.latest);
  const dismissedBuildId = useVersionStore((s) => s.dismissedBuildId);
  const updateAvailable = useVersionStore(selectUpdateAvailable);
  const notifiedBuildId = React.useRef<string | null>(null);

  React.useEffect(() => {
    void check();
    const tick = () => {
      if (document.visibilityState === "visible") void check();
    };
    const interval = window.setInterval(tick, VERSION_CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [check]);

  React.useEffect(() => {
    if (!updateAvailable || !latest) return;
    if (dismissedBuildId === latest.buildId || notifiedBuildId.current === latest.buildId) return;
    notifiedBuildId.current = latest.buildId;
    toast("A new version of Streamline is ready", {
      id: TOAST_ID,
      description: `${formatVersion(latest)} is live. Reload whenever suits you; what you are doing here is not lost.`,
      duration: Infinity,
      closeButton: true,
      action: { label: "Reload", onClick: () => window.location.reload() },
      cancel: { label: "Later", onClick: () => dismiss(latest.buildId) },
      onDismiss: () => dismiss(latest.buildId),
    });
  }, [updateAvailable, latest, dismissedBuildId, dismiss]);

  return null;
}

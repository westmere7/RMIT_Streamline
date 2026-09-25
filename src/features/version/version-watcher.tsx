"use client";

import * as React from "react";
import { ChangelogDialog } from "@/features/version/changelog-dialog";
import { VERSION_CHECK_INTERVAL_MS } from "@/lib/version";
import { selectUpdateAvailable, useVersionStore } from "@/stores/version-store";

/**
 * Keeps an open page aware of the build the server is running. It asks every
 * VERSION_CHECK_INTERVAL_MS while the tab is visible, and again the moment the
 * tab comes back into view or the connection returns. When the server has a
 * build this page does not, a pop-up says what changed and offers to refresh.
 * Nothing is forced: the page keeps working, and "Later" keeps it away for that
 * build.
 */
export function VersionWatcher() {
  const check = useVersionStore((s) => s.check);
  const dismiss = useVersionStore((s) => s.dismiss);
  const latest = useVersionStore((s) => s.latest);
  const dismissedBuildId = useVersionStore((s) => s.dismissedBuildId);
  const updateAvailable = useVersionStore(selectUpdateAvailable);

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

  const open = updateAvailable && latest !== null && dismissedBuildId !== latest.buildId;
  if (!latest) return null;
  return (
    <ChangelogDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss(latest.buildId);
      }}
      latest={latest.version}
      onRefresh={() => window.location.reload()}
    />
  );
}

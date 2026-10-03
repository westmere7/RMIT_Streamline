"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, LoaderCircle, WifiOff } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { getAppConfig } from "@/lib/config";
import {
  checkNow,
  dataServerProbe,
  getServerStatus,
  heartbeat,
  HEARTBEAT_MS,
  onServerRecovered,
  setDeviceOnline,
  setServerProbe,
  subscribeServerStatus,
  type ServerStatusSnapshot,
} from "@/lib/server-status";

const SERVER_SNAPSHOT: ServerStatusSnapshot = { status: "ok", retryAt: null };

export function useServerStatus(): ServerStatusSnapshot {
  return React.useSyncExternalStore(subscribeServerStatus, getServerStatus, () => SERVER_SNAPSHOT);
}

/**
 * Covers the app while it cannot reach its server, or the device has no
 * network. Nothing typed in that time could be saved, so nothing can be typed:
 * clicks land on the cover, keys are swallowed, and whatever had focus loses
 * it. The page stays visible underneath. When the server answers again the
 * cover lifts and every query reads afresh, so the screen is never left
 * showing what was there before the gap.
 */
export function ConnectionGuard() {
  const queryClient = useQueryClient();
  const { status, retryAt } = useServerStatus();

  React.useEffect(() => {
    const config = getAppConfig();
    if (config.dataProvider === "supabase" && config.supabaseUrl && config.supabaseAnonKey) {
      setServerProbe(dataServerProbe(config.supabaseUrl, config.supabaseAnonKey));
    }
    const online = () => setDeviceOnline(true);
    const offline = () => setDeviceOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (!navigator.onLine) offline();
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") heartbeat();
    }, HEARTBEAT_MS);
    const visible = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", visible);
    const stopRecovered = onServerRecovered(() => {
      void queryClient.resumePausedMutations();
      void queryClient.invalidateQueries();
    });
    return () => {
      setServerProbe(null);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", visible);
      stopRecovered();
    };
  }, [queryClient]);

  const blocked = status === "down" || status === "offline";

  React.useEffect(() => {
    if (!blocked) return;
    (document.activeElement as HTMLElement | null)?.blur();
    const block = (event: KeyboardEvent) => {
      // Reloading stays possible; nothing else reaches the page.
      if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) return;
      if (event.target instanceof Node && document.querySelector("[data-testid='connection-guard']")?.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener("keydown", block, true);
    return () => window.removeEventListener("keydown", block, true);
  }, [blocked]);

  if (!blocked) return null;
  return createPortal(<Cover offline={status === "offline"} retryAt={retryAt} />, document.body);
}

function Cover({ offline, retryAt }: { offline: boolean; retryAt: number | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  const [trying, setTrying] = React.useState(false);
  React.useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
  const tryNow = async () => {
    setTrying(true);
    await checkNow();
    setTrying(false);
  };
  const Icon = offline ? WifiOff : CloudOff;
  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-background/70 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="connection-guard-title"
      aria-describedby="connection-guard-detail"
      data-testid="connection-guard"
      data-state={offline ? "offline" : "down"}
    >
      <div className="w-[min(24rem,100%)] rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <Icon className="size-5" aria-hidden />
        </span>
        <p id="connection-guard-title" className="mt-4 text-[15px] font-semibold">
          {offline ? "You’re offline" : "Can’t reach the server"}
        </p>
        <p id="connection-guard-detail" className="mt-1 text-[13px] text-muted-foreground">
          Editing is paused until {offline ? "you reconnect" : "it’s back"}, so nothing gets lost.
        </p>
        {!offline && (
          <div className="mt-5 flex items-center justify-center gap-3">
            <span className="flex items-center gap-1.5 text-[12px] tabular-nums text-muted-foreground" aria-live="polite">
              {trying || seconds === null || seconds === 0 ? (
                <>
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                  Checking…
                </>
              ) : (
                `Trying again in ${seconds}s`
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => void tryNow()} disabled={trying} data-testid="connection-guard-retry">
              Try now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

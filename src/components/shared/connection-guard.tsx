"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CloudAlert, CloudOff, LoaderCircle, PencilOff, RefreshCw, WifiOff } from "lucide-react";
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
  SERVER_OK,
  subscribeServerStatus,
  type ServerStatusSnapshot,
} from "@/lib/server-status";

export function useServerStatus(): ServerStatusSnapshot {
  return React.useSyncExternalStore(subscribeServerStatus, getServerStatus, () => SERVER_OK);
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
  const snapshot = useServerStatus();
  const { status } = snapshot;

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
  return createPortal(<Cover snapshot={snapshot} />, document.body);
}

/** "under a minute", "3 min", "1 h 5 min". */
export function outageLength(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

/** What the cover says, by what is wrong. */
export function coverCopy(snapshot: ServerStatusSnapshot): { title: string; lead: string } {
  if (snapshot.status === "offline") {
    return { title: "You\u2019re offline", lead: "This device has lost its internet connection. Check your Wi\u2011Fi or mobile data." };
  }
  if (snapshot.reason === "error") {
    return { title: "The server is unavailable", lead: "The server answered with an error. It\u2019s most likely down for maintenance or under heavy load, and should be back shortly." };
  }
  if (snapshot.reason === "unreachable") {
    return { title: "Can\u2019t reach the server", lead: "The server isn\u2019t answering. It may be down for maintenance, or something between you and it is blocking the connection." };
  }
  return { title: "Reconnecting", lead: "Your device is back online. Checking the server is answering before you carry on." };
}

function Cover({ snapshot }: { snapshot: ServerStatusSnapshot }) {
  const [now, setNow] = React.useState(() => Date.now());
  const [trying, setTrying] = React.useState(false);
  React.useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  const offline = snapshot.status === "offline";
  const { retryAt, since, failures } = snapshot;
  const seconds = retryAt ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : null;
  const tryNow = async () => {
    setTrying(true);
    await checkNow();
    setTrying(false);
  };
  const { title, lead } = coverCopy(snapshot);
  const Icon = offline ? WifiOff : snapshot.reason === "error" ? CloudAlert : CloudOff;
  const sinceLabel = since ? new Date(since).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const points: [React.ComponentType<{ className?: string }>, string][] = [
    [PencilOff, "Editing is paused, so nothing you type now gets lost."],
    [CircleCheck, "Work saved before this is safe. Your last change may not have gone through; check it once this clears."],
    [RefreshCw, `This clears by itself when ${offline ? "you\u2019re back online" : "the server is back"}. No need to reload.`],
  ];
  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-background/70 p-4 backdrop-blur-[2px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="connection-guard-title"
      aria-describedby="connection-guard-detail"
      data-testid="connection-guard"
      data-state={offline ? "offline" : "down"}
      data-reason={snapshot.reason ?? undefined}
    >
      <div className="w-[min(28rem,100%)] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="p-6">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p id="connection-guard-title" className="text-[15px] font-semibold">
                {title}
              </p>
              <p id="connection-guard-detail" className="mt-1 text-[13px] text-muted-foreground">
                {lead}
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2 border-t border-border/60 pt-4">
            {points.map(([PointIcon, text]) => (
              <li key={text} className="flex gap-2.5 text-[13px]">
                <PointIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted-foreground">If it lasts more than a few minutes, let your workspace admin know.</p>
        </div>
        <div className="flex flex-col gap-2 border-t border-border/60 bg-surface/60 px-6 py-3 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-testid="connection-guard-status">
          <span className="min-w-0 tabular-nums">
            {sinceLabel && (
              <>
                {offline ? "Offline" : "Down"} since {sinceLabel} ({outageLength(now - since!)})
              </>
            )}
            {!offline && failures > 0 && <> · {failures} {failures === 1 ? "check" : "checks"} failed</>}
          </span>
          {offline ? (
            <span className="shrink-0">Waiting for the network…</span>
          ) : (
            <span className="flex shrink-0 items-center justify-between gap-2.5">
              <span className="flex items-center gap-1.5 tabular-nums" aria-live="polite">
                {trying || seconds === null || seconds === 0 ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                    Checking…
                  </>
                ) : (
                  `Next try in ${seconds}s`
                )}
              </span>
              <Button size="sm" variant="outline" onClick={() => void tryNow()} disabled={trying} data-testid="connection-guard-retry">
                Try now
              </Button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

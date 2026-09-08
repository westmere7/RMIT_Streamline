"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Eye, KeyRound, LoaderCircle, LockKeyhole, Moon, Sun } from "lucide-react";
import * as React from "react";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { PublicDashboardPayload } from "@/domain";
import { AuthShell, BrandMark } from "@/features/auth/components/auth-shell";
import { useServices } from "@/features/data/data-context";
import { LivePill } from "@/features/dashboard/dashboard-controls";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { useAgo } from "@/features/dashboard/hooks";
import { useDashboardPrefs } from "@/features/dashboard/prefs";
import { formatShortDate } from "@/lib/dates/dates";
import { resolveTheme, useThemePreference } from "@/lib/theme";
import { ShareAccessError } from "@/services";

/** How often the public dashboard asks for fresh figures. There is no session for realtime to ride on. */
const REFRESH_MS = 15_000;

/**
 * The page behind a public dashboard link: full screen, read-only, no account.
 * It asks what the link is, takes a password if the link wants one, then reads
 * the snapshot and keeps re-reading it on a short cycle.
 */
export function PublicDashboardPage({ token }: { token: string }) {
  const services = useServices();
  const [password, setPassword] = React.useState<string | null>(null);

  React.useEffect(() => {
    void useDashboardPrefs.persist.rehydrate();
  }, []);

  const gate = useQuery({ queryKey: ["dashboard-gate", token], queryFn: () => services.dashboard.gate(token), retry: false, staleTime: 60_000 });
  const needsPassword = gate.data?.needsPassword ?? false;
  const payload = useQuery({
    queryKey: ["dashboard-public", token],
    queryFn: () => services.dashboard.loadPublic(token, password),
    enabled: !!gate.data?.open && (!needsPassword || password !== null),
    retry: false,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  if (gate.isPending) return <FullPageLoader label="Opening the dashboard…" />;
  if (gate.isError || !gate.data?.open) {
    const message =
      gate.data?.refusal === "expired"
        ? "This link has expired. Ask whoever sent it for a new one."
        : gate.data?.refusal === "off"
          ? "Sharing has been turned off for this dashboard. Ask whoever sent you the link to turn it back on."
          : "This link does not open anything. Check that you copied all of it, or ask whoever sent it for a new one.";
    return <Closed message={message} />;
  }
  if (payload.data) return <PublicDashboardShell payload={payload.data} updatedAt={payload.dataUpdatedAt} refreshing={payload.isFetching} />;

  const wrongPassword = payload.error instanceof ShareAccessError && payload.error.reason === "password";
  if (needsPassword && (password === null || wrongPassword)) return <PasswordPrompt busy={payload.isFetching} wrong={wrongPassword} onSubmit={setPassword} />;
  if (payload.isError) return <Closed message={payload.error instanceof Error ? payload.error.message : "This dashboard could not be opened."} />;
  return <FullPageLoader label="Opening the dashboard…" />;
}

function PublicDashboardShell({ payload, updatedAt, refreshing }: { payload: PublicDashboardPayload; updatedAt: number; refreshing: boolean }) {
  const ago = useAgo(updatedAt || null);
  useLinksStayHere();
  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background" data-testid="public-dashboard">
      <header className="relative flex shrink-0 items-center gap-3.5 border-b border-border/60 px-4 py-3 sm:px-6">
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-primary opacity-[0.06]" style={{ maskImage: "linear-gradient(to bottom, black, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black, transparent)" }} />
        <BrandMark className="relative size-9 rounded-xl" />
        <div className="relative min-w-0 flex-1">
          <h1 className="flex min-w-0 items-center gap-2.5 text-[17px] font-semibold tracking-tight">
            <span className="truncate">{payload.snapshot.workspace.name} · Dashboard</span>
            <LivePill ago={ago} refreshing={refreshing} />
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Eye className="size-3" /> View only · figures refresh every {REFRESH_MS / 1000} seconds
          </p>
        </div>
        {payload.expiresAt && (
          <SimpleTooltip label="After this day the link stops working.">
            <span className="relative hidden items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-2xs text-muted-foreground sm:flex" data-testid="dashboard-share-expiry">
              <CalendarClock className="size-3.5" /> Until {formatShortDate(payload.expiresAt)}
            </span>
          </SimpleTooltip>
        )}
      </header>
      <DashboardScreen snapshot={payload.snapshot} toolbarExtras={<ThemeButton />} />
    </div>
  );
}

/** Light or dark for the wall the dashboard hangs on. */
function ThemeButton() {
  const [preference, setPreference] = useThemePreference();
  const dark = resolveTheme(preference) !== "light";
  return (
    <SimpleTooltip label={dark ? "Light theme" : "Dark theme"} side="bottom">
      <Button variant="outline" size="icon-sm" className="rounded-full" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setPreference(dark ? "light" : "dark")}>
        {dark ? <Sun /> : <Moon />}
      </Button>
    </SimpleTooltip>
  );
}

/** Nothing on this page may lead into the app: a visitor has no account for what is on the other side. */
function useLinksStayHere(): void {
  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/dashboard/")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
}

function Closed({ message }: { message: string }) {
  return (
    <AuthShell headline="Shared with you." lead="Dashboards shared from Streamline open here, without an account." cardTestId="dashboard-closed">
      <div className="space-y-4 p-7 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <LockKeyhole className="size-5" />
        </span>
        <h2 className="text-[17px] font-semibold tracking-tight">This dashboard is not available</h2>
        <p className="text-[13px] text-muted-foreground">{message}</p>
      </div>
    </AuthShell>
  );
}

function PasswordPrompt({ busy, wrong, onSubmit }: { busy: boolean; wrong: boolean; onSubmit: (password: string) => void }) {
  const [value, setValue] = React.useState("");
  return (
    <AuthShell headline="Shared with you." lead="This dashboard is protected by a password." cardTestId="dashboard-password">
      <form
        className="space-y-4 p-7 sm:p-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value);
        }}
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
          <KeyRound className="size-5" />
        </span>
        <div className="space-y-2">
          <Label htmlFor="dashboard-password">Password</Label>
          <Input id="dashboard-password" type="password" autoFocus value={value} onChange={(e) => setValue(e.currentTarget.value)} aria-invalid={wrong || undefined} data-testid="dashboard-password-input" />
          {wrong && <p className="text-2xs text-destructive">That password is not right.</p>}
        </div>
        <Button type="submit" className="w-full" disabled={busy || !value.trim()}>
          {busy ? <LoaderCircle className="animate-spin" /> : null} Open the dashboard
        </Button>
      </form>
    </AuthShell>
  );
}

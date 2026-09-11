"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardViewKind, PortalGate } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import type { PortalCredentials } from "@/features/portal/portal-client";
import { PortalBooking } from "@/features/portal/portal-booking";
import { PortalBoardScreen } from "@/features/portal/portal-board-screen";
import { PortalHeader, PortalShell, PortalThemeScope } from "@/features/portal/portal-shell";
import { PortalAccessError } from "@/services/stakeholder-portal-service";

/**
 * How often the board is refreshed while somebody is looking at it.
 *
 * Short, because a stakeholder watching a request move is the whole point of
 * the page and fifteen seconds felt broken. Only while the tab is in front:
 * `refetchIntervalInBackground` is off, so a portal left open behind other
 * windows costs nothing. A socket would beat this and is the next step;
 * polling is the honest floor while there is no session to hang one on.
 */
const PORTAL_REFRESH_MS = 4_000;

/**
 * A department's portal.
 *
 * Four steps in order, the same shape the share links use: ask what the link
 * is, take a password if it wants one, then read the department's requests and
 * render them. Nothing about the department is fetched until the link has
 * answered for itself.
 *
 * The whole page is read-only for a stakeholder by construction — every write
 * it can reach is a route handler that re-checks a board seat, and a visitor
 * has none.
 */
export function PortalPage({ token }: { token: string }) {
  const services = useServices();
  const auth = useAuth();
  const router = useRouter();
  const [password, setPassword] = React.useState<string | null>(null);

  const gate = useQuery({
    queryKey: ["portal-gate", token],
    queryFn: () => services.portals.publicGate(token),
    retry: false,
    staleTime: 60_000,
  });

  const needsPassword = gate.data?.needsPassword ?? false;
  // Who is asking, for the local provider only. Under Supabase the transport
  // drops this and the server resolves the viewer from a bearer token it
  // verifies itself — a browser claiming to be somebody proves nothing.
  const viewer = auth.user ? { userId: auth.user.id, displayName: auth.user.displayName, isWorkspaceMember: true } : null;
  const credentials: PortalCredentials = { token, password, credentialVersion: gate.data?.credentialVersion, viewer };

  const page = useQuery({
    queryKey: ["portal-board", token, gate.data?.credentialVersion, password],
    queryFn: () => services.portals.publicBoard(credentials),
    enabled: !!gate.data?.open && (!needsPassword || password !== null),
    retry: false,
    staleTime: PORTAL_REFRESH_MS,
    // A department's work carries on while somebody reads about it, and there
    // is no session here to hang a subscription on. Polling is the honest floor;
    // it is bounded, it backs off when the tab is hidden, and the header says
    // when the figures were last true.
    refetchInterval: PORTAL_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // The open request lives in the URL, so Back, refresh and a pasted link all
  // behave, and the board keeps its place behind the panel. The board screen
  // reads the parameter for itself; this is here so booking can open what it
  // just created.
  const setOpenTask = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(window.location.search);
      if (id) next.set("task", id);
      else next.delete("task");
      const query = next.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router],
  );

  // Booking replaces the board rather than sitting beside it in a tab strip:
  // it is the one thing a stakeholder comes here to *do*, and it gets a button.
  const [booking, setBooking] = React.useState(false);

  if (gate.isPending) {
    return (
      <PortalShell>
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </PortalShell>
    );
  }

  if (gate.isError || !gate.data?.open) {
    return (
      <PortalShell>
        <Closed refusal={gate.data?.refusal ?? "unknown"} />
      </PortalShell>
    );
  }

  const context = page.data?.context ?? null;

  if (needsPassword && password === null) {
    return (
      <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
        <PortalShell>
          <PasswordPrompt gate={gate.data} onSubmit={setPassword} />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  // A password that the server refused: ask again rather than showing an empty
  // department, and say why.
  const wrongPassword = page.isError && page.error instanceof PortalAccessError && page.error.reason === "password";
  if (wrongPassword) {
    return (
      <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
        <PortalShell>
          <PasswordPrompt gate={gate.data} onSubmit={setPassword} error="That password does not open this portal." />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  // A link replaced while this tab was open: the gate is re-read, and if it is
  // gone the closed state takes over on the next tick.
  if (page.isError) {
    return (
      <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
        <PortalShell>
          <Closed refusal="unknown" onRetry={() => void gate.refetch()} />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  return (
    <PortalThemeScope token={token} preferred={gate.data.defaultTheme}>
      {/* Both tabs are one window tall now: the board scrolls its own rows,
          and the booking form scrolls inside its card so the bar at its foot
          never leaves the screen. */}
      <PortalShell fill>
        <PortalHeader
          token={token}
          departmentName={context?.departmentName ?? gate.data.departmentName}
          creativeTeamName={context?.creativeTeamName ?? gate.data.creativeTeamName}
          viewerName={context?.viewerName ?? null}
          servedAt={page.data?.servedAt ?? null}
          stale={page.isFetching}
          totals={booking || context?.showRecap === false ? null : (page.data?.totals ?? null)}
          description={context?.description ?? null}
        />

        {booking ? (
          // The column owns the window's height and hands it to the card, so
          // the form scrolls inside itself and the page behind it does not.
          <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-4 pt-4 pb-4 sm:px-6">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-3 text-muted-foreground"
              onClick={() => {
                setBooking(false);
                void page.refetch();
              }}
              data-testid="portal-our-tasks"
            >
              <ArrowLeft /> Our tasks
            </Button>
            <PortalBooking
              credentials={credentials}
              departmentName={gate.data.departmentName}
              onView={(itemId) => {
                void page.refetch();
                setBooking(false);
                setOpenTask(itemId);
              }}
              onBackToTasks={() => {
                setBooking(false);
                void page.refetch();
              }}
            />
          </div>
        ) : page.data ? (
          // The department's work, rendered by the board the workspace uses:
          // the same views, the same cells, the same item panel.
          <div className="flex min-h-0 flex-1 flex-col" data-testid="portal-board">
            <PortalBoardScreen
                token={token}
                payload={page.data}
                onBook={context?.allowBooking === false ? null : () => setBooking(true)}
                defaultView={(context?.defaultView ?? "table") as BoardViewKind}
              />
          </div>
        ) : (
          <div className="px-4 py-6 sm:px-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="mt-3 h-64 w-full" />
          </div>
        )}
      </PortalShell>
    </PortalThemeScope>
  );
}

/** Everything that is not "this link opens". Deliberately one message. */
function Closed({ refusal, onRetry }: { refusal: string; onRetry?: () => void }) {
  const message =
    refusal === "off"
      ? "This portal is closed at the moment. Ask the creative team when it will be back."
      : refusal === "revoked"
        ? "This link has been replaced. Ask the creative team for the current one."
        : "This link does not open a portal. Check that you copied all of it, or ask the creative team for a new one.";
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-strong/70 text-muted-foreground">
        <Lock className="size-5" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold tracking-tight">This link does not open a portal</h1>
      <p className="mt-1.5 text-[13px] text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function PasswordPrompt({ gate, onSubmit, error }: { gate: PortalGate; onSubmit: (password: string) => void; error?: string }) {
  const [value, setValue] = React.useState("");
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-16">
      <span className="mb-4 flex size-12 items-center justify-center self-center rounded-full bg-surface-strong/70 text-muted-foreground">
        <Lock className="size-5" aria-hidden />
      </span>
      <h1 className="text-center text-lg font-semibold tracking-tight">{gate.departmentName} asks for a password</h1>
      <p className="mt-1.5 text-center text-[13px] text-muted-foreground">Whoever sent you this link will have given you one.</p>
      <form
        className="mt-5 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (value) onSubmit(value);
        }}
      >
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          aria-label="Portal password"
          aria-invalid={!!error}
          autoFocus
          autoComplete="current-password"
          className="h-11 text-base"
          data-testid="portal-password"
        />
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11" disabled={!value}>
          Open the portal
        </Button>
      </form>
    </div>
  );
}

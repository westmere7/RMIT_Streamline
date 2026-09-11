"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardViewKind, PortalGate } from "@/domain";
import { DEFAULT_PORTAL_RANGE, EVERY_PORTAL_RANGE, formatPortalRange, parsePortalRange } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PortalCredentials } from "@/features/portal/portal-client";
import { PortalBookingDialog } from "@/features/portal/portal-booking";
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
 * The workspace's portal.
 *
 * Four steps in order, the same shape the share links use: ask what the link
 * is, take a password if it wants one, then read the team's requests and render
 * them. Nothing is fetched until the link has answered for itself.
 *
 * One portal carries every stakeholder's work, so two of the visitor's own
 * choices decide how much of it is on screen: whose work, and from which year.
 * Both live in the URL, so a link somebody passes on opens on the same view,
 * and both narrow a set the token has already settled — neither is
 * authorisation. A search sets the year aside and looks across all of them:
 * somebody hunting for a task by name is not asking about a year, and finding
 * nothing because it was booked in December would be a fault they could not
 * see.
 *
 * The whole page is read-only for a stakeholder by construction — every write
 * it can reach is a route handler that re-checks a board seat, and a visitor
 * has none.
 */
export function PortalPage({ token, startOnBooking = false }: { token: string; startOnBooking?: boolean }) {
  const services = useServices();
  const auth = useAuth();
  const router = useRouter();
  const [password, setPassword] = React.useState<string | null>(null);
  const searchParams = useSearchParams();

  // The two scope choices, in the URL so a link keeps them. An unreadable
  // range falls back to the default rather than to everything: the fallback for
  // a bad address must be the cheap read, not the expensive one.
  const stakeholderId = searchParams.get("for");
  const chosenRange = parsePortalRange(searchParams.get("range")) ?? DEFAULT_PORTAL_RANGE;

  // What the board's own search box holds, lifted so the request can widen to
  // every year while it is set.
  const [search, setSearch] = React.useState("");
  const searching = useDebouncedValue(search.trim(), 250).length > 0;

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

  // A search reads everything; otherwise the visitor's own window applies.
  const range = searching ? EVERY_PORTAL_RANGE : chosenRange;
  const scope = React.useMemo(() => ({ stakeholderId, range }), [stakeholderId, range]);

  const page = useQuery({
    queryKey: ["portal-board", token, gate.data?.credentialVersion, password, stakeholderId, formatPortalRange(range)],
    queryFn: () => services.portals.publicBoard(credentials, scope),
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

  const replaceParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
    [router],
  );

  // The open request lives in the URL, so Back, refresh and a pasted link all
  // behave, and the board keeps its place behind the panel. The board screen
  // reads the parameter for itself; this is here so booking can open what it
  // just created.
  const setOpenTask = React.useCallback((id: string | null) => replaceParams({ task: id }), [replaceParams]);

  // Booking replaces the board rather than sitting beside it in a tab strip:
  // it is the one thing a stakeholder comes here to *do*, and it gets a button.
  // `startOnBooking` is the dedicated booking link (/portal/<token>/book), which
  // opens straight onto the form: somebody sent that link to have a request
  // made, and making them find the button on a board of other people's work
  // first is a step with nothing in it for them.
  const [booking, setBooking] = React.useState(startOnBooking);

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
          portalName={context?.portalName ?? gate.data.portalName}
          creativeTeamName={context?.creativeTeamName ?? gate.data.creativeTeamName}
          viewerName={context?.viewerName ?? null}
          servedAt={page.data?.servedAt ?? null}
          stale={page.isFetching}
          totals={booking || context?.showRecap === false ? null : (page.data?.totals ?? null)}
          description={context?.description ?? null}
          stakeholders={context?.stakeholders ?? []}
          stakeholderId={stakeholderId}
          onStakeholder={(id) => replaceParams({ for: id })}
          years={context?.years ?? []}
          range={range}
          // Stored as it was chosen, so the address says what is on screen.
          onRange={(next) => replaceParams({ range: formatPortalRange(next) })}
          // A search has taken the window off; say so rather than leaving the
          // picker looking as though it were being ignored.
          rangeOverridden={searching}
        />

        <PortalBookingDialog
          open={booking}
          onOpenChange={(next) => {
            setBooking(next);
            if (!next) void page.refetch();
          }}
          credentials={credentials}
          stakeholder={context?.stakeholders.find((row) => row.id === stakeholderId) ?? null}
          // Chosen inside step one, so the dedicated booking link needs nothing
          // of the board behind it.
          stakeholders={context?.stakeholders ?? []}
          onView={(itemId) => {
            void page.refetch();
            setOpenTask(itemId);
          }}
        />

        {page.data ? (

          // The department's work, rendered by the board the workspace uses:
          // the same views, the same cells, the same item panel.
          <div className="flex min-h-0 flex-1 flex-col" data-testid="portal-board">
            <PortalBoardScreen
                token={token}
                payload={page.data}
                onBook={context?.allowBooking === false ? null : () => setBooking(true)}
                defaultView={(context?.defaultView ?? "table") as BoardViewKind}
                onSearchChange={setSearch}
                searchingAllYears={searching}
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
      <h1 className="text-center text-lg font-semibold tracking-tight">{gate.portalName} asks for a password</h1>
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

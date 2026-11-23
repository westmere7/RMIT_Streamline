"use client";

import { useQuery } from "@tanstack/react-query";
import { LoadingSweep } from "@/components/shared/loading-sweep";
import { useVisitorScale } from "@/components/shared/view-controls";
import { ClipboardX, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { BoardViewKind, PortalGate } from "@/domain";
import { DEFAULT_BOOKING_CLOSED_HEADING, DEFAULT_BOOKING_CLOSED_MESSAGE, DEFAULT_PORTAL_RANGE, EVERY_PORTAL_RANGE, formatPortalRange, parsePortalRange } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PortalCredentials } from "@/features/portal/portal-client";
import { PortalBookingScreen } from "@/features/portal/portal-booking";
import { PortalBoardScreen } from "@/features/portal/portal-board-screen";
import { PortalHeader, PortalRangePicker, PortalShell, PortalThemeScope } from "@/features/portal/portal-shell";
import { RichText } from "@/components/shared/rich-text";
import { cn } from "@/lib/utils";
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
export function PortalPage({ token, startOnBooking = false, workspaceSlug = null }: { token: string; startOnBooking?: boolean; /** Opened at the short address (/<workspace>/portal): every link it makes stays short. */ workspaceSlug?: string | null }) {
  const services = useServices();
  const auth = useAuth();
  const router = useRouter();
  const [password, setPassword] = React.useState<string | null>(null);
  const searchParams = useSearchParams();

  // The two scope choices, in the URL so a link keeps them. An unreadable
  // range falls back to the default rather than to everything: the fallback for
  // a bad address must be the cheap read, not the expensive one.
  const stakeholderId = searchParams.get("for") || null;
  const teamId = searchParams.get("team") || null;

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

  // The visitor's own size for the board, kept apart from the booking form's,
  // which starts from the size the team set for the form.
  const boardScale = useVisitorScale(`streamline.portal-scale:${token}:board`);

  const needsPassword = gate.data?.needsPassword ?? false;
  // The period the link opens on is the team's setting; one named in the
  // address wins, so a link somebody passes on keeps what they were looking at.
  const chosenRange = parsePortalRange(searchParams.get("range")) ?? parsePortalRange(gate.data?.defaultRange) ?? DEFAULT_PORTAL_RANGE;
  // Who is asking, for the local provider only. Under Supabase the transport
  // drops this and the server resolves the viewer from a bearer token it
  // verifies itself — a browser claiming to be somebody proves nothing.
  const viewer = auth.user ? { userId: auth.user.id, displayName: auth.user.displayName, isWorkspaceMember: true } : null;
  const credentials: PortalCredentials = { token, password, credentialVersion: gate.data?.credentialVersion, viewer };

  // A search reads everything; otherwise the visitor's own window applies.
  const range = searching ? EVERY_PORTAL_RANGE : chosenRange;
  const scope = React.useMemo(() => ({ stakeholderId, teamId, range }), [stakeholderId, teamId, range]);

  // A request's journey, read when it is opened rather than with every refresh of the board.
  // Keyed on the grant's own parts, so the board's data layer is not rebuilt on every render.
  const credentialVersion = gate.data?.credentialVersion;
  const viewerId = viewer?.userId ?? null;
  const loadJourney = React.useCallback(
    (itemId: string) => services.portals.publicJourney({ token, password, credentialVersion, viewer: viewerId && auth.user ? { userId: auth.user.id, displayName: auth.user.displayName, isWorkspaceMember: true } : null }, itemId),
    [services, token, password, credentialVersion, viewerId, auth.user],
  );

  const page = useQuery({
    queryKey: ["portal-board", token, gate.data?.credentialVersion, password, stakeholderId, teamId, formatPortalRange(range)],
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
    // Switching stakeholder or range is a new key. The board on screen stays
    // put until the next one has arrived, with a bar saying it is on its way,
    // rather than blanking to a skeleton between two arrangements of the same page.
    placeholderData: (previous) => previous,
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


  // Booking is a page of its own (/portal/<token>/book), opened in a new tab
  // from the board so the board is still there when the booking is done. It
  // carries the stakeholder on show, so the form opens on them.
  const bookHref = workspaceSlug ? routes.workspaceBooking(workspaceSlug, { for: stakeholderId }) : `/portal/${encodeURIComponent(token)}/book${stakeholderId ? `?for=${encodeURIComponent(stakeholderId)}` : ""}`;
  // The portal itself, and one request on it, at whichever address this page was opened on.
  const portalHref = (task: string | null = null) => (workspaceSlug ? routes.workspacePortal(workspaceSlug, { task }) : routes.portal(token, { task }));

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

  // The booking link of a form that takes no requests, or of a portal that is closed: the team's
  // message, not the form (which would only refuse on Book) and not a password prompt first.
  if (startOnBooking && gate.data && !gate.data.bookingOpen && (gate.data.open || gate.data.refusal === "off")) {
    return (
      <PortalThemeScope token={token} {...themeFor(gate.data, true)}>
        <PortalShell>
          <BookingClosed heading={gate.data.bookingClosedHeading} message={gate.data.bookingClosedMessage} teamName={gate.data.creativeTeamName} portalHref={gate.data.open ? portalHref() : null} />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  // The form of a closed portal that still takes requests opens on its own.
  const formOnly = startOnBooking && !!gate.data && !gate.data.open && gate.data.bookingOpen;
  if (gate.isError || (!gate.data?.open && !formOnly)) {
    return (
      <PortalShell>
        <Closed refusal={gate.data?.refusal ?? "unknown"} />
      </PortalShell>
    );
  }

  const context = page.data?.context ?? null;

  if (needsPassword && password === null) {
    return (
      <PortalThemeScope token={token} {...themeFor(gate.data, startOnBooking)}>
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
      <PortalThemeScope token={token} {...themeFor(gate.data, startOnBooking)}>
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
      <PortalThemeScope token={token} {...themeFor(gate.data, startOnBooking)}>
        <PortalShell>
          <Closed refusal="unknown" onRetry={() => void gate.refetch()} />
        </PortalShell>
      </PortalThemeScope>
    );
  }

  // Booking takes the whole window: the same page a direct booking link and
  // the app's own "book a task" open, so the form is one page everywhere. The
  // board comes back when the booking is done or given up on.
  if (startOnBooking) {
    const leave = () => router.push(portalHref());
    return (
      <PortalThemeScope token={token} {...themeFor(gate.data, startOnBooking)}>
        <PortalBookingScreen
          credentials={credentials}
          portalName={context?.portalName ?? gate.data.portalName}
          creativeTeamName={context?.creativeTeamName ?? gate.data.creativeTeamName}
          stakeholder={context?.stakeholders.find((row) => row.id === stakeholderId) ?? null}
          // Chosen inside step one; null until the portal has read them, so the
          // form does not appear and then grow a question. With the portal closed
          // there is no board to read them from: the department is found by name.
          stakeholders={formOnly ? [] : (context?.stakeholders ?? null)}
          headline={gate.data.bookingHeadline}
          lead={gate.data.bookingLead}
          offerSignIn={gate.data.bookingSignIn}
          scale={gate.data.bookingScale ?? 100}
          scaleSwitch={gate.data.bookingScaleSwitch ?? true}
          // Nothing to go back to while the portal is closed.
          onView={formOnly ? undefined : (itemId) => router.push(portalHref(itemId))}
          onClose={formOnly ? undefined : leave}
        />
      </PortalThemeScope>
    );
  }

  return (
    <PortalThemeScope token={token} {...themeFor(gate.data, startOnBooking)}>
      {/* One window tall: the board scrolls its own rows under a header that stays put. */}
      <PortalShell fill scale={boardScale.value}>
        <PortalHeader
          token={token}
          home={portalHref()}
          scale={boardScale}
          portalName={context?.portalName ?? gate.data.portalName}
          viewerName={context?.viewerName ?? null}
          servedAt={page.data?.servedAt ?? null}
          stale={page.isFetching}
          totals={context?.showRecap === false ? null : (page.data?.totals ?? null)}
          stakeholders={context?.stakeholders ?? []}
          stakeholderId={stakeholderId}
          onStakeholder={(id) => replaceParams({ for: id })}
          teams={context?.teams ?? []}
          teamId={teamId}
          onTeam={(id) => replaceParams({ team: id })}
          rangePicker={
            // Stored as it was chosen, so the address says what is on
            // screen; a search has taken the window off, and says so.
            <PortalRangePicker range={range} onRange={(next) => replaceParams({ range: formatPortalRange(next) })} years={context?.years ?? []} rangeOverridden={searching} />
          }
        />

        {/* The next board is on its way: the one on screen is the old one. */}
        {page.isPlaceholderData && <LoadingSweep testId="portal-switching" />}

        {page.data ? (

          // The department's work, rendered by the board the workspace uses:
          // the same views, the same cells, the same item panel.
          <div className={cn("flex min-h-0 flex-1 flex-col transition-opacity", page.isPlaceholderData && "pointer-events-none opacity-60")} data-testid="portal-board">
            <PortalBoardScreen
                token={token}
                home={portalHref()}
                loadJourney={loadJourney}
                payload={page.data}
                bookHref={context?.allowBooking === false ? null : bookHref}
                defaultView={(context?.defaultView ?? "table") as BoardViewKind}
                showItemGroups={context?.showItemGroups === true}
                onSearchChange={setSearch}
                searchingAllYears={searching}
                refreshing={page.isFetching}
                onShowAll={range.kind === "all" ? undefined : () => replaceParams({ range: formatPortalRange(EVERY_PORTAL_RANGE) })}
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

/** The theme settings of whichever page this is: the board and the booking form each have their own. */
function themeFor(gate: PortalGate, booking: boolean) {
  return booking
    ? { surface: "booking" as const, preferred: gate.bookingTheme, allowSwitch: gate.bookingThemeSwitch }
    : { surface: "board" as const, preferred: gate.defaultTheme, allowSwitch: gate.themeSwitch };
}

/**
 * The booking link while it takes no requests: a page of its own, no side panel, with the team's
 * heading and formatted message (or the built-in words), and the way to the portal when that is open.
 */
export function BookingClosed({ heading, message, teamName, portalHref }: { heading: string | null; message: string | null; teamName: string; portalHref: string | null }) {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center px-5 py-16" data-testid="booking-closed">
      <div className="w-full max-w-xl">
        <span className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-surface-strong/70 text-muted-foreground">
          <ClipboardX className="size-6" aria-hidden />
        </span>
        {teamName && <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{teamName}</p>}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl" data-testid="booking-closed-heading">
          {heading?.trim() || DEFAULT_BOOKING_CLOSED_HEADING}
        </h1>
        <RichText body={message?.trim() || DEFAULT_BOOKING_CLOSED_MESSAGE} className="mt-4 text-[15px] leading-relaxed text-foreground/80" />
        {portalHref && (
          <Button variant="outline" className="mt-8" asChild>
            <Link href={portalHref} data-testid="booking-closed-portal">
              See requests in the portal
            </Link>
          </Button>
        )}
      </div>
    </main>
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

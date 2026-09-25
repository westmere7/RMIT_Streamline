"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, LogIn, Minus, Plus } from "lucide-react";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import type { BookingForm as BookingFormData, PortalStakeholderOption } from "@/domain";
import { BOOKING_SCALE_MAX, BOOKING_SCALE_MIN, DEFAULT_BOOKING_HEADLINE, DEFAULT_BOOKING_LEAD, clampBookingScale } from "@/domain";
import { AuthShell, BrandMark } from "@/features/auth/components/auth-shell";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { newSubmissionKey, type PortalCredentials } from "@/features/portal/portal-client";
import { THEME_ICONS, usePortalTheme } from "@/features/portal/portal-shell";
import { cn } from "@/lib/utils";

/**
 * Booking from the portal, on the booking page.
 *
 * The same page a stakeholder's direct booking link opens and a member's "book
 * a task" opens: the brand frame, the form in the card. It used to be a dialog
 * over the board, which made a third look for the same form; now the board
 * steps aside and comes back when the booking is done or abandoned.
 *
 * Who the request is for is a question inside step one — a dropdown beside the
 * other things about the requester — and not a gate in front of the form.
 * Whatever is chosen is sent as an id and checked again on the server against
 * this workspace's own departments, so nothing here can point a booking at
 * another stakeholder.
 *
 * The submission key is made once and reused for every attempt of the same
 * booking. That is what makes a double tap or a retry after a dropped
 * connection resolve to one task: the server replays the first receipt rather
 * than booking again. A new key is only minted after one has been accepted.
 */
export function PortalBookingScreen({
  credentials,
  portalName,
  creativeTeamName,
  stakeholder,
  stakeholders,
  headline,
  lead,
  offerSignIn = true,
  scale: teamScale = 100,
  scaleSwitch = true,
  onView,
  onClose,
}: {
  credentials: PortalCredentials;
  portalName: string;
  creativeTeamName: string;
  /** Who the request will be for, as the portal currently has it. */
  stakeholder: PortalStakeholderOption | null;
  /** Every department this link serves, for step one's own question. Null until the portal has read them. */
  stakeholders: PortalStakeholderOption[] | null;
  /** The team's own words for the brand panel; null keeps the built-in ones. */
  headline?: string | null;
  lead?: string | null;
  /** Whether staff are offered a sign-in that fills their details in. */
  offerSignIn?: boolean;
  /** The interface size the team set for this form, in percent. */
  scale?: number;
  /** Whether the visitor may change that size for themselves. */
  scaleSwitch?: boolean;
  /** Opens the request that was just booked, on the board. */
  onView: (itemId: string) => void;
  /** Back to the board without booking, or once the ticket has been read. */
  onClose: () => void;
}) {
  const services = useServices();
  const queryClient = useQueryClient();
  const { scale, set: setScale } = useVisitorScale(credentials.token, teamScale, scaleSwitch);
  // The size the team set for this form. The page itself is zoomed (AuthShell's
  // `scale`), never the document: menus position themselves from on-screen
  // boxes, and under a zoomed document they were placed that much off to the
  // side. Their contents are zoomed by a rule in globals.css keyed on this
  // attribute instead, so they match the form; both are taken away on leaving.
  React.useEffect(() => {
    if (scale === 100) return;
    const root = document.documentElement;
    root.dataset.bookingZoom = "";
    root.style.setProperty("--booking-zoom", String(scale / 100));
    return () => {
      delete root.dataset.bookingZoom;
      root.style.removeProperty("--booking-zoom");
    };
  }, [scale]);
  // Some stakeholders do have an account here. If they are signed in the wizard
  // fills their details in, and they can still type over them.
  const auth = useAuth();
  const account = auth.user ? { name: auth.user.displayName, email: auth.user.email, title: auth.user.jobTitle, avatar: auth.user } : null;
  // The account's own department is not offered as a default here: this link
  // is somebody else's, and the request is for whoever it is showing.
  // Back to this portal once they have signed in; the login page only follows
  // a path on this site, so the round trip cannot be pointed anywhere else.
  const signInHref = `/login?next=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.pathname + window.location.search)}`;
  const [submissionKey, setSubmissionKey] = React.useState(() => newSubmissionKey());
  // Kept so the ticket can offer somewhere to go. The wizard keeps showing its
  // own receipt; leaving the moment a booking lands would take the ticket off
  // the screen just as somebody was reading it.
  const [booked, setBooked] = React.useState<string | null>(null);
  /**
   * Who the request is for is the form's own department question — the same
   * control, from the same list, as every other booking page — and it starts
   * on whichever department the portal was showing. The server still wants the
   * department's id, so the chosen name is looked up among the departments
   * this link serves before anything is sent.
   */
  const stakeholderFor = (name: string | null) => stakeholders?.find((s) => s.name === (name ?? "").trim()) ?? null;

  const form = useQuery({
    queryKey: ["portal-booking-form", credentials.token, credentials.credentialVersion],
    queryFn: (): Promise<BookingFormData> => services.portals.publicBookingForm(credentials),
    retry: false,
    staleTime: 60_000,
  });

  return (
    <AuthShell
      headline={headline || DEFAULT_BOOKING_HEADLINE}
      lead={lead || DEFAULT_BOOKING_LEAD}
      footnote={`${creativeTeamName} · Streamline`}
      cardTestId="portal-book"
      progress={form.isLoading || stakeholders === null}
      width="2xl"
      fill
      scale={scale / 100}
      extras={(tone) => <ViewControls tone={tone} scale={scale} teamScale={teamScale} allowScale={scaleSwitch} onScale={setScale} />}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-7 py-4 sm:px-8">
        <BrandMark className="size-9 rounded-lg text-sm" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight">{portalName}</p>
          <p className="text-xs text-muted-foreground">Task booking{account ? ` · signed in as ${account.name}` : ""}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="portal-book-close">
          <ArrowLeft /> Back to our tasks
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-7 py-6 sm:px-8">
        {/* The frame is on screen at once; the form waits inside it until both
            the questions and the departments are known, so nothing pops in
            under a visitor who has started reading. */}
        {form.isLoading || (stakeholders === null && !form.isError) ? (
          <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" /> Getting the form ready…
          </div>
        ) : form.isError || !form.data ? (
          <ErrorState title="Could not load the booking form." error={form.error} onRetry={() => form.refetch()} />
        ) : (
          <>
            {/* No account is needed to book. One just saves answering the
                questions the app can answer for itself. */}
            {!account && offerSignIn && (
              <p className="mb-4 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted-foreground" data-testid="portal-signin-hint">
                <LogIn className="size-3.5 shrink-0" aria-hidden />
                Work here and have a Streamline account?
                <a href={signInHref} className="font-medium text-foreground underline-offset-4 hover:underline">
                  Sign in
                </a>
                and we will fill your details in.
              </p>
            )}
            <BookingWizard
              form={form.data}
              account={account}
              signInHref={account || !offerSignIn ? null : signInHref}
              // Opens on the department the portal was showing; the visitor may change it.
              defaults={{ department: stakeholder?.name ?? "" }}
              // Scoped to the link, not to the browser: one machine may be
              // used to book for two departments, and the person doing it is
              // not always the same one. Nothing of this leaves the machine.
              remember={account ? null : `portal:${credentials.token}`}
              lookupRequester={account ? undefined : (email) => services.portals.publicLookupRequester(credentials, email, services.booking)}
              onSubmit={async (request) => {
                const forStakeholder = stakeholderFor(request.department);
                if (!forStakeholder) throw new Error("Pick which department this is for.");
                return services.portals.publicBook(credentials, submissionKey, request, forStakeholder.id, services.booking);
              }}
              // Nothing here links into the application: a stakeholder has no
              // account and the board is not theirs to open.
              itemHref={() => null}
              onBooked={(receipt) => {
                // The booking is in, so the next one is a different booking.
                setSubmissionKey(newSubmissionKey());
                setBooked(receipt.itemId);
                // The board this page read before the booking does not have it.
                // Read it again now, while the receipt is being read, so that
                // "View request" opens on a board the new task is already on.
                void queryClient.invalidateQueries({ queryKey: ["portal-board", credentials.token] });
              }}
            />
            {booked && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                <Button onClick={() => onView(booked)} data-testid="portal-view-request">
                  View request
                </Button>
                <Button variant="outline" onClick={onClose} data-testid="portal-back-to-tasks">
                  Back to our tasks
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}

// ---- the visitor's own view ------------------------------------------------------

/** How much one press of − or + changes the size. */
const VISITOR_SCALE_STEP = 10;

/**
 * The size this visitor reads the form at: the team's, unless the link lets
 * them choose and they have. A choice remembers the team size it was made
 * over and lapses when the team changes theirs, like the theme choice does.
 */
function useVisitorScale(token: string, teamScale: number, allow: boolean) {
  const key = `streamline.portal-scale:${token}`;
  const stored = React.useSyncExternalStore(
    (onChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
  // This visit's choice, for a browser that will not store it.
  const [override, setOverride] = React.useState<string | null>(null);
  const choice = allow ? parseScaleChoice(override ?? stored) : null;
  const scale = choice && choice.over === teamScale ? choice.scale : teamScale;
  const set = React.useCallback(
    (next: number) => {
      const value = clampBookingScale(next);
      const raw = JSON.stringify({ scale: value, over: teamScale });
      setOverride(raw);
      try {
        // Going back to the team's size is choosing to follow it.
        if (value === teamScale) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, raw);
      } catch {
        // The choice then lasts this visit.
      }
    },
    [key, teamScale],
  );
  return { scale, set };
}

function parseScaleChoice(raw: string | null): { scale: number; over: number } | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { scale?: unknown; over?: unknown };
    return typeof value.scale === "number" && typeof value.over === "number" ? { scale: clampBookingScale(value.scale), over: value.over } : null;
  } catch {
    return null;
  }
}

/**
 * The reader's view, kept small and out of the way: theme and size, at the foot
 * of the brand panel (under the card on a phone). Nothing at all when the link
 * lets the visitor change neither.
 */
function ViewControls({ tone, scale, teamScale, allowScale, onScale }: { tone: "navy" | "canvas"; scale: number; teamScale: number; allowScale: boolean; onScale: (scale: number) => void }) {
  const theme = usePortalTheme();
  const allowTheme = !!theme?.allowSwitch;
  if (!allowTheme && !allowScale) return null;
  const navy = tone === "navy";
  const hover = navy ? "hover:bg-white/10 hover:text-white" : "hover:bg-accent hover:text-foreground";
  const button = cn("flex size-7 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-35", hover);
  const active = navy ? "bg-white/15 text-white" : "bg-foreground/10 text-foreground";
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border p-0.5 text-2xs", navy ? "border-white/12 text-white/55" : "border-border/70 text-muted-foreground")} data-testid="booking-view-controls">
      {allowTheme && (
        <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5">
          {(["light", "dark", "system"] as const).map((option) => {
            const Icon = THEME_ICONS[option];
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={theme.theme === option}
                aria-label={`${option} theme`}
                title={`${option[0]!.toUpperCase()}${option.slice(1)} theme`}
                onClick={() => theme.set(option)}
                className={cn(button, theme.theme === option && active)}
                data-testid={`portal-theme-${option}`}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      )}
      {allowTheme && allowScale && <span aria-hidden className={cn("mx-1 h-3.5 w-px", navy ? "bg-white/15" : "bg-border")} />}
      {allowScale && (
        <div role="group" aria-label="Interface size" className="flex items-center gap-0.5">
          <button type="button" className={button} onClick={() => onScale(scale - VISITOR_SCALE_STEP)} disabled={scale <= BOOKING_SCALE_MIN} aria-label="Smaller" title="Smaller" data-testid="booking-scale-down">
            <Minus className="size-3.5" />
          </button>
          <button
            type="button"
            className={cn("h-7 min-w-11 rounded-full px-1.5 font-medium tabular transition-colors", hover)}
            onClick={() => onScale(teamScale)}
            title={scale === teamScale ? "Interface size" : `Back to ${teamScale}%`}
            aria-label={`Interface size ${scale}%${scale === teamScale ? "" : `, press for ${teamScale}%`}`}
            data-testid="booking-scale-value"
          >
            {scale}%
          </button>
          <button type="button" className={button} onClick={() => onScale(scale + VISITOR_SCALE_STEP)} disabled={scale >= BOOKING_SCALE_MAX} aria-label="Larger" title="Larger" data-testid="booking-scale-up">
            <Plus className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

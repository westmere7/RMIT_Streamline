"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { BrandMark, AuthShell } from "@/features/auth/components/auth-shell";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

/**
 * The booking page: the one form, wherever it was opened from.
 *
 * A stakeholder reaches it from the link the team sent them, with the key in
 * the address; a member reaches it from inside the app, with no key, because
 * their session answers for them. Either way it is this page — the brand frame
 * from sign-in, the form in the card — and not a copy of the form embedded
 * somewhere else, so there is one place the form looks and behaves like.
 */
export function BookingScreen({ workspaceSlug, bookingKey }: { workspaceSlug: string; bookingKey: string | null }) {
  const services = useServices();
  // Someone with an account who opens the public link is recognised: their
  // details are filled in and the booking is recorded as theirs.
  const { status, user } = useAuth();
  const signedIn = status === "signed-in" && !!user;
  const needsSignIn = bookingKey === null && status === "signed-out";
  const here = bookingKey === null ? routes.bookForm(workspaceSlug) : routes.publicBooking(workspaceSlug, bookingKey);
  const form = useQuery({
    queryKey: queryKeys.bookingForm(workspaceSlug, bookingKey),
    queryFn: () => services.booking.getForm({ workspaceSlug, key: bookingKey }),
    retry: false,
    staleTime: 5 * 60_000,
    // Without a key there is nothing to ask with until the session is known.
    enabled: bookingKey !== null || signedIn,
  });

  return (
    <AuthShell
      headline="Book a task with the creative team."
      lead="Tell us what you need and when. We route it to the right people and keep you posted — no account needed."
      footnote={`${form.data?.workspaceName ?? "RMIT Creative Team"} · Streamline`}
      cardTestId="booking-card"
      progress={form.isLoading || status === "loading"}
      width="2xl"
      fill
    >
      {needsSignIn ? (
        <div className="p-7 sm:p-8">
          <Unusable title="Sign in to book from the workspace" message="This address is for people with an account. Stakeholders use the link the team sent them." action={{ href: `/login?next=${encodeURIComponent(here)}`, label: "Sign in" }} />
        </div>
      ) : form.isLoading || (bookingKey === null && !signedIn) ? (
        <div className="flex items-center gap-2 p-8 text-[13px] text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" /> Getting the form ready…
        </div>
      ) : form.isError || !form.data ? (
        <div className="p-7 sm:p-8">
          <Unusable message={form.error instanceof Error ? form.error.message : "This link does not work. Ask the team for a fresh one."} />
        </div>
      ) : (
        <>
          {/* The header stays put; only the form underneath scrolls. */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-7 py-4 sm:px-8">
            <BrandMark className="size-9 rounded-lg text-sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[15px] font-semibold tracking-tight">{form.data.workspaceName}</p>
              <p className="text-xs text-muted-foreground">Task booking{signedIn ? ` · signed in as ${user.firstName}` : ""}</p>
            </div>
            {/* A member came from the app; the way back is on the page. */}
            {signedIn && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={routes.book(workspaceSlug)} data-testid="booking-back-to-workspace">
                  <ArrowLeft /> Back to the workspace
                </Link>
              </Button>
            )}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-7 py-6 sm:px-8">
            <BookingWizard
              key={signedIn ? user.id : "guest"}
              form={form.data}
              // Signed in: the questions about them are filled from the
              // account and still theirs to change. Not signed in: the offer to
              // sign in is made, and typing them is the other way.
              account={signedIn ? { name: user.displayName, email: user.email, title: user.jobTitle, avatar: user } : null}
              signInHref={signedIn ? null : `/login?next=${encodeURIComponent(here)}`}
              defaults={signedIn ? { requesterName: user.displayName, requesterEmail: user.email, department: user.stakeholderGroup ?? user.department ?? "" } : undefined}
              // A member is already known to the app; a visitor on the public
              // link is remembered by their own browser, per workspace.
              remember={signedIn ? null : `book:${workspaceSlug}`}
              onSubmit={(request) => services.booking.submit({ workspaceSlug, key: bookingKey, request, actorId: signedIn ? user.id : null })}
              // A member can follow the ticket to the board; a board they may
              // not open says so itself.
              itemHref={signedIn ? (receipt) => routes.board(workspaceSlug, receipt.boardSlug, { itemId: receipt.itemId }) : undefined}
            />
          </div>
        </>
      )}
    </AuthShell>
  );
}

function Unusable({ title = "This booking link does not work", message, action }: { title?: string; message: string; action?: { href: string; label: string } }) {
  return (
    <div className="space-y-4" data-testid="booking-unusable">
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
        <LockKeyhole className="size-5" />
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
      </div>
      <Button asChild variant="outline">
        <Link href={action?.href ?? routes.login()}>{action?.label ?? "Staff sign in"}</Link>
      </Button>
    </div>
  );
}

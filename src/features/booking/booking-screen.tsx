"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { BrandMark, AuthShell } from "@/features/auth/components/auth-shell";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

/**
 * The public booking page a stakeholder opens from the link the team sent
 * them. No account, no sidebar: the same brand frame as sign-in, with the form
 * in the card. The key in the URL is the only thing that lets them in.
 */
export function BookingScreen({ workspaceSlug, bookingKey }: { workspaceSlug: string; bookingKey: string }) {
  const services = useServices();
  // Someone with an account who opens the public link is recognised: their
  // details are filled in and the booking is recorded as theirs.
  const { status, user } = useAuth();
  const signedIn = status === "signed-in" && !!user;
  const form = useQuery({
    queryKey: queryKeys.bookingForm(workspaceSlug, bookingKey),
    queryFn: () => services.booking.getForm({ workspaceSlug, key: bookingKey }),
    retry: false,
    staleTime: 5 * 60_000,
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
      {form.isLoading ? (
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
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-semibold tracking-tight">{form.data.workspaceName}</p>
              <p className="text-xs text-muted-foreground">Task booking{signedIn ? ` · signed in as ${user.firstName}` : ""}</p>
            </div>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-7 py-6 sm:px-8">
            <BookingWizard
              key={signedIn ? user.id : "guest"}
              form={form.data}
              // Signed in: the three questions about them are filled from the
              // account and still theirs to change. Not signed in: the offer to
              // sign in is made, and typing them is the other way.
              account={signedIn ? { name: user.displayName, email: user.email } : null}
              signInHref={signedIn ? null : `/login?next=${encodeURIComponent(routes.publicBooking(workspaceSlug, bookingKey))}`}
              defaults={signedIn ? { requesterName: user.displayName, requesterEmail: user.email, department: user.department ?? "" } : undefined}
              // A member is already known to the app; a visitor on the public
              // link is remembered by their own browser, per workspace.
              remember={signedIn ? null : `book:${workspaceSlug}`}
              onSubmit={(request) => services.booking.submit({ workspaceSlug, key: bookingKey, request, actorId: signedIn ? user.id : null })}
            />
          </div>
        </>
      )}
    </AuthShell>
  );
}

function Unusable({ message }: { message: string }) {
  return (
    <div className="space-y-4" data-testid="booking-unusable">
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-muted-foreground">
        <LockKeyhole className="size-5" />
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">This booking link does not work</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{message}</p>
      </div>
      <Button asChild variant="outline">
        <Link href={routes.login()}>Staff sign in</Link>
      </Button>
    </div>
  );
}

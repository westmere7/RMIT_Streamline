"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookingForm } from "@/features/booking/booking-form";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canSeeSystemEntities, canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { routes } from "@/lib/routes";

/**
 * Booking from inside the app. Members use the same form as stakeholders, with
 * their own details filled in. Admins also see the public link to send out,
 * can replace it, and can jump to the Task Allocation board.
 */
export function BookTaskPage() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const admin = canSeeSystemEntities(ws.permissions);

  const form = useQuery({
    queryKey: queryKeys.bookingForm(ws.slug, null),
    queryFn: () => services.booking.getForm({ workspaceSlug: ws.slug, key: null }),
    staleTime: 60_000,
  });

  const onBooked = async (receipt: { boardId: string }) => {
    publishDataChange({ kinds: ["items", "board"] });
    await queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(receipt.boardId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.notifications(ws.currentUser.id) });
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <PageHeader
        title="Book a task"
        description="Ask the creative team for work. Requests wait on the Task Allocation board until a manager places them — unless the team you pick takes bookings directly."
        className="shrink-0"
      />
      {/* On a desktop the form card scrolls by itself under the header; on a phone the whole page scrolls. */}
      <div className="scrollbar-thin grid min-h-0 flex-1 gap-6 overflow-y-auto px-4 pb-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-visible">
        <section className="scrollbar-thin rounded-2xl border border-border/70 bg-card p-5 shadow-xs sm:p-7 lg:min-h-0 lg:overflow-y-auto" data-testid="book-task-card">
          {form.isLoading ? (
            <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" /> Getting the form ready…
            </div>
          ) : form.isError || !form.data ? (
            <ErrorState title="Could not load the booking form." error={form.error} onRetry={() => form.refetch()} />
          ) : (
            <BookingForm
              form={form.data}
              defaults={{ requesterName: ws.currentUser.displayName, requesterEmail: ws.currentUser.email, department: ws.currentUser.department ?? "" }}
              onSubmit={(request) => services.booking.submit({ workspaceSlug: ws.slug, key: null, request, actorId: ws.currentUser.id })}
              onBooked={(receipt) => void onBooked(receipt)}
              itemHref={(receipt) => {
                const board = ws.boardById(receipt.boardId);
                return board && canViewBoard(ws.permissions, board) ? routes.board(ws.slug, board.slug, { itemId: receipt.itemId }) : null;
              }}
            />
          )}
        </section>
        {admin && <AdminAside />}
      </div>
    </div>
  );
}

/** The public link and where bookings arrive: admins only. */
function AdminAside() {
  const ws = useWorkspace();
  const services = useServices();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const key = ws.workspace.bookingKey ?? null;
  // The origin is only known in the browser; until hydration the path alone is shown.
  const origin = React.useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const publicUrl = key ? `${origin}${routes.publicBooking(ws.slug, key)}` : "";
  const allocation = ws.boards.find((b) => b.system === "TASK_ALLOCATION");

  const regenerate = useMutation({
    mutationFn: () => services.workspace.regenerateBookingKey(ws.workspace.id),
    onSuccess: async () => {
      await ws.refresh();
      toast.success("New booking link ready", { description: "The previous link no longer works." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not replace the link"),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <aside className="scrollbar-thin space-y-4 lg:min-h-0 lg:overflow-y-auto">
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs" data-testid="booking-share">
        <h2 className="text-[15px] font-semibold tracking-tight">Share with stakeholders</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Anyone with this link can book a task without an account. Send it by email or put it on the intranet.</p>
        <div className="mt-3 flex gap-1.5">
          <Input readOnly value={publicUrl} aria-label="Public booking link" onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs" data-testid="booking-public-link" />
          <Button type="button" variant="outline" size="icon-sm" className="size-9 shrink-0" aria-label="Copy booking link" onClick={() => void copy()} disabled={!publicUrl} data-testid="booking-copy-link">
            {copied ? <Check className="text-green-600" /> : <Copy />}
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => setConfirmOpen(true)} disabled={regenerate.isPending} data-testid="booking-regenerate">
          <RefreshCw className={regenerate.isPending ? "animate-spin" : undefined} /> Replace the link
        </Button>
      </section>
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs">
        <h2 className="text-[15px] font-semibold tracking-tight">Where bookings land</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Every booking arrives on <span className="font-medium text-foreground">{allocation?.name ?? "Task Allocation"}</span> unless the chosen team has picked one of its boards to receive them (Team settings → Bookings land on).
        </p>
        {allocation && (
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link href={ws.boardPath(allocation)} data-testid="booking-open-allocation">
              <ExternalLink /> Open {allocation.name}
            </Link>
          </Button>
        )}
      </section>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace the booking link?"
        description="Everyone holding the current link loses access to the form. Send the new one out afterwards."
        confirmLabel="Replace link"
        onConfirm={() => regenerate.mutateAsync().then(() => undefined)}
      />
    </aside>
  );
}

function subscribeNever(): () => void {
  return () => {};
}

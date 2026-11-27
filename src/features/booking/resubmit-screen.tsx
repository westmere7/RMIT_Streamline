"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, MessageSquareWarning } from "lucide-react";
import * as React from "react";
import { RelativeTime } from "@/components/shared/relative-time";
import { Textarea } from "@/components/ui/textarea";
import { RESUBMIT_REPLY_MAX } from "@/domain";
import { AuthShell, RmitPixel } from "@/features/auth/components/auth-shell";
import { BookingWizard } from "@/features/booking/wizard/booking-wizard";
import { useServices } from "@/features/data/data-context";

/**
 * The requester's side of a send-back: /<workspace>/booking/r/<token>.
 *
 * Their form, with their answers in it and what the team asked for at the top.
 * No account: the token is the key, it works once, and it runs out.
 */
export function ResubmitScreen({ token }: { token: string }) {
  const services = useServices();
  const [reply, setReply] = React.useState("");
  const [done, setDone] = React.useState(false);
  const opened = useQuery({
    queryKey: ["resubmit", token],
    queryFn: () => services.bookingSendBacks.open(token),
    retry: false,
    staleTime: Infinity,
  });
  const data = opened.data;

  return (
    <AuthShell headline="Add what's missing" lead="The team needs a little more before they can start." cardTestId="resubmit-page" progress={opened.isLoading} width="2xl" fill>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/60 px-7 py-4 sm:px-8">
        <RmitPixel className="size-9" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight">{data?.title ?? "Your request"}</p>
          {data?.ticket && <p className="text-xs text-muted-foreground tabular">{data.ticket}</p>}
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-7 py-6 sm:px-8">
        {opened.isLoading ? (
          <div className="flex items-center gap-2 py-10 text-[13px] text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" /> Getting your form ready…
          </div>
        ) : opened.isError || !data ? (
          <div className="py-10 text-center" role="alert" data-testid="resubmit-unavailable">
            <p className="text-[15px] font-medium">{opened.error instanceof Error ? opened.error.message : "This link doesn't work any more."}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">If you still need to add something, ask the team.</p>
          </div>
        ) : (
          <>
            {!done && (
              <div className="mb-5 space-y-3">
                <div className="rounded-xl border border-amber-300/70 bg-amber-50 p-4 text-[13px] dark:border-amber-400/30 dark:bg-amber-500/10" data-testid="resubmit-note">
                  <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                    <MessageSquareWarning className="size-4" aria-hidden /> {data.sentByName} asked
                    <RelativeTime iso={data.sentAt} className="font-normal text-amber-800/70 dark:text-amber-200/60" />
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-amber-950/90 dark:text-amber-100/90">{data.note}</p>
                </div>
                {!data.prefill && <p className="text-[13px] text-muted-foreground">Fill the form in again, with what&apos;s missing.</p>}
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium">Anything to add? (optional)</span>
                  <Textarea value={reply} onChange={(e) => setReply(e.target.value.slice(0, RESUBMIT_REPLY_MAX))} rows={2} placeholder="A note for the team" data-testid="resubmit-reply" />
                </label>
              </div>
            )}
            <BookingWizard
              form={data.form}
              resubmit={{ initial: data.prefill }}
              remember={null}
              onSubmit={(request) => services.bookingSendBacks.resubmit(token, request, reply)}
              itemHref={() => null}
              onBooked={() => setDone(true)}
            />
          </>
        )}
      </div>
    </AuthShell>
  );
}

"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, ExternalLink, FileDown, History, LoaderCircle, LogIn, MessageSquareQuote, UserRound } from "lucide-react";
import * as React from "react";
import { InlineRichText } from "@/components/shared/inline-rich-text";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BookingForm as BookingFormData, BookingFormTemplate, BookingPastSummary, BookingReceipt, BookingRequest, BookingStandardKey, BookingStep, User } from "@/domain";
import { UserAvatar } from "@/components/shared/user-avatar";
import { changedParts, NOTHING_CHANGED, serviceById } from "@/domain";
import { formatShortDate, todayISO } from "@/lib/dates/dates";
import { newId } from "@/lib/ids";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { bookingRequestSchema, composeBrief, emptyBookingRequest, validateBookingStep } from "@/services/booking";
import { newAssetRow, type AssetRow, type EmailCheck } from "../booking-fields";
import { useBookingMemory, useMountedInBrowser, type PastBooking } from "../booking-remember";
import { StepAssets, StepBasics, StepBrief, StepReview } from "./wizard-steps";

/**
 * Booking, as four steps.
 *
 * One form used to ask everybody everything, which meant asking a photographer
 * about print bleed and a brand manager about call times. Now step one settles
 * who is asking and what kind of work it is, and the service they pick decides
 * which brief step two opens. Steps three and four — the deliverables, the
 * recap — are the same whichever way the second step went.
 *
 * Nothing is sent until the last step: the recap is the last chance to change
 * anything, and every card on it goes back to the step that owns it. A step
 * with a required answer missing will not let anybody past, and says which
 * answer under the question it belongs to.
 */

export interface BookingWizardProps {
  form: BookingFormData;
  /** Pre-filled: the signed-in member's own details, or the department a portal link already knows. */
  defaults?: Partial<Pick<BookingRequest, "requesterName" | "requesterEmail" | "department">>;
  /**
   * Who the app knows is signed in.
   *
   * Stronger than anything a browser remembers: the two questions about them
   * are answered by their account, so the wizard does not ask. They can still
   * book for somebody else — the banner says whose name it is going in under
   * and offers the way out.
   */
  account?: BookingAccount | null;
  /** Where signing in leads, for a page that has somewhere to send them back to. */
  signInHref?: string | null;
  /**
   * Standard questions this caller does not ask, whatever the template says.
   *
   * For context the caller already knows and the server decides for itself. The
   * portal omits "department": it comes from the link, is overwritten on the
   * server, and a box for it invited a stakeholder to type an answer that was
   * then thrown away.
   */
  omit?: readonly BookingStandardKey[];
  /**
   * Remember this browser's requester and half-finished booking under this key.
   * Null for a signed-in member, whose details the app already knows.
   */
  remember?: string | null;
  /**
   * A run of the form for somebody shaping it, not filling it in.
   *
   * Every step is reachable at once and nothing is required, because the point
   * is to read the form rather than to answer it; and the last step hands back
   * a made-up ticket instead of booking anything.
   */
  preview?: boolean;
  onSubmit: (request: BookingRequest) => Promise<BookingReceipt>;
  /**
   * The name the workspace has for an email, so a person it knows sees theirs
   * filled in as they finish typing it. Absent when signed in: the account says who.
   */
  lookupRequester?: (email: string) => Promise<string | null>;
  /** The other bookings made with an email, for the receipt when the form lists them. */
  pastBookings?: (email: string) => Promise<BookingPastSummary[]>;
  /** Where the booked item can be opened, for people who may see its board. Null hides the link. */
  itemHref?: (receipt: BookingReceipt) => string | null;
  onBooked?: (receipt: BookingReceipt) => void;
  /**
   * The form sent back to its requester (src/domain/booking/send-back.ts): it
   * opens on `initial`, who asked is fixed (their link is theirs), the button
   * sends it again, and the receipt says the team has it, with nothing to book next.
   */
  resubmit?: { initial: BookingRequest | null } | null;
}

/** Who the app knows is signed in, with enough about them to be shown as a person and not a pair of boxes. */
export interface BookingAccount {
  name: string;
  email: string;
  /** Their job title, when the account has one. */
  title?: string | null;
  avatar?: Pick<User, "id" | "firstName" | "lastName" | "displayName" | "avatarUrl"> | null;
}

/** The questions about the requester. */
const REQUESTER_KEYS: readonly BookingStandardKey[] = ["requesterName", "requesterEmail", "department"];
/**
 * The two an account answers outright, and so takes off the form. The
 * department stays a question whoever is signed in: it is picked from a list,
 * and the one on the account is a default rather than a fact.
 */
const ACCOUNT_KEYS: readonly BookingStandardKey[] = ["requesterName", "requesterEmail"];

export function BookingWizard(props: BookingWizardProps) {
  // One commit behind on purpose. The first draft is built from what this
  // browser remembers, and the server has no way to know that — so the wizard
  // is made once the answer is in rather than being filled in afterwards,
  // which is both a flicker and a fight with whatever has been typed since.
  const mounted = useMountedInBrowser();
  if (props.remember && !mounted) return <WizardSkeleton />;
  return <Wizard {...props} />;
}

function WizardSkeleton() {
  return (
    <div className="space-y-5" aria-hidden data-testid="booking-wizard-skeleton">
      <Skeleton className="h-8 w-full rounded-full" />
      <Skeleton className="h-10 w-2/3 rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-11 w-44 rounded-lg" />
    </div>
  );
}

interface StepDef {
  key: BookingStep;
  label: string;
}

function Wizard({ form, defaults, account, signInHref, omit, remember, preview, onSubmit, lookupRequester, pastBookings, itemHref, onBooked, resubmit }: BookingWizardProps) {
  const template = form.template;
  const memory = useBookingMemory(resubmit ? null : (remember ?? null));
  const initial = resubmit?.initial ?? null;

  const steps = React.useMemo<StepDef[]>(
    () =>
      [
        { key: "basics" as const, label: "Essentials" },
        { key: "brief" as const, label: "Brief" },
        ...(template.assets.enabled ? [{ key: "assets" as const, label: "Assets" }] : []),
        { key: "review" as const, label: "Confirm" },
      ] satisfies StepDef[],
    [template.assets.enabled],
  );

  const [request, setRequest] = React.useState<BookingRequest>(() => initial ? { ...emptyBookingRequest(), ...structuredClone(initial), department: listedDepartment(form.departments, initial.department), itemId: null } : ({
    ...emptyBookingRequest(),
    ...(memory.draft?.request ?? {}),
    requesterName: memory.draft?.request.requesterName || account?.name || memory.requester?.name || defaults?.requesterName || "",
    requesterEmail: memory.draft?.request.requesterEmail || account?.email || memory.requester?.email || defaults?.requesterEmail || "",
    // Only a department still on the list: an account or a remembered draft can
    // carry one that was renamed or removed since, and the server refuses those.
    department: listedDepartment(form.departments, memory.draft?.request.department ?? defaults?.department),
    itemId: null,
  }));
  const [assets, setAssets] = React.useState<AssetRow[]>(() => (initial?.assets ?? memory.draft?.request.assets ?? []).map((line) => ({ ...newAssetRow(line.name), quantity: line.quantity, notes: line.spec ?? "", assetType: line.assetType ?? null })));
  const [restored, setRestored] = React.useState(!!memory.draft);
  /**
   * The asset types the deliverables already name. They are part of the answer
   * to "asset type" whether or not anybody ticks them again, so the picker shows
   * them fixed and the request carries them.
   */
  const derivedTypes = React.useMemo(() => [...new Set(assets.map((a) => a.assetType?.trim() ?? "").filter(Boolean))], [assets]);
  const allAssetTypes = React.useCallback((chosen: readonly string[]) => [...derivedTypes, ...chosen.filter((t) => !derivedTypes.includes(t))], [derivedTypes]);
  // The booking's reference, settled before it is sent: the id the item will be
  // created with is made here, so the code on the recap is the code on the ticket.
  const [itemId, setItemId] = React.useState(() => newId());
  const [index, setIndex] = React.useState(0);
  // How far anybody has got. A step already passed stays reachable from the
  // bar in both directions: stepping back from the recap to change one answer
  // and then having to press Next three times to return to it is the kind of
  // small indignity that makes a form feel like a maze.
  const [furthest, setFurthest] = React.useState(0);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [failure, setFailure] = React.useState<string | null>(null);
  const [receipt, setReceipt] = React.useState<BookingReceipt | null>(null);
  // What was sent, for the receipt's PDF: the form itself is cleared for the next booking.
  const [submitted, setSubmitted] = React.useState<BookingRequest | null>(null);
  /** Which past booking this one was started from, so the strip can say so. */
  const [startedFrom, setStartedFrom] = React.useState<string | null>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  const step = steps[index]!;
  /**
   * Change part of the request.
   *
   * A patch may be a function of what is already there, and anything that reads
   * the request to build its own next value has to use that form. Two controls
   * can change in one tick — the two boxes of a link question, a paste that
   * fills several — and a patch built from the render's own copy of the request
   * would then be built from a copy that is already out of date, quietly
   * throwing away whatever the other control had just written.
   */
  const patch = (p: Partial<BookingRequest> | ((prev: BookingRequest) => Partial<BookingRequest>)) => setRequest((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) }));

  // A known email fills in the name the workspace has for it. It replaces the
  // name field only if that has not been touched since the email was typed:
  // typing a name first and then the email still fills it, but a name corrected
  // afterwards is theirs and stays. Whatever is submitted is saved as their name.
  const nameWhenEmailChanged = React.useRef(request.requesterName);
  const email = request.requesterEmail.trim().toLowerCase();
  React.useEffect(() => {
    nameWhenEmailChanged.current = request.requesterName;
    // Only the email moving should reset this, not every keystroke in the name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);
  // The latest lookup, so a parent that hands in a new function on every render
  // does not restart the wait each time: only the email moving should.
  const lookupRef = React.useRef(lookupRequester);
  React.useEffect(() => {
    lookupRef.current = lookupRequester;
  });
  // Signed in and booking as themselves, the account says who. Filling the two
  // boxes in by hand (booking for someone else) is checked like anyone's.
  const asAccount = !!account && request.requesterName.trim() === account.name && request.requesterEmail.trim() === account.email;
  const canLookUp = !!lookupRequester && !asAccount && !preview;
  const checkable = canLookUp && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  // The last answer, for the email it answered. Checking is simply an email
  // that has no answer yet, so nothing has to be set when typing starts.
  const [lookedUp, setLookedUp] = React.useState<{ email: string; name: string | null } | null>(null);
  React.useEffect(() => {
    if (!checkable) return;
    let live = true;
    const timer = window.setTimeout(() => {
      const lookup = lookupRef.current;
      if (!lookup) return;
      lookup(email)
        .catch(() => null)
        .then((name) => {
          if (!live) return;
          setLookedUp({ email, name });
          if (!name) return;
          setRequest((prev) => {
            if (prev.requesterEmail.trim().toLowerCase() !== email) return prev;
            // No side effects in here: React may run this twice.
            if (prev.requesterName !== nameWhenEmailChanged.current || prev.requesterName === name) return prev;
            return { ...prev, requesterName: name };
          });
        });
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [email, checkable]);
  const knownName = lookedUp?.email === email ? lookedUp.name : null;
  const emailCheck: EmailCheck | null = !checkable
    ? null
    : lookedUp?.email !== email
      ? { state: "checking" }
      : knownName
        ? { state: "known", name: knownName, onUseName: request.requesterName.trim() === knownName ? null : () => patch({ requesterName: knownName }) }
        : null;

  /** The request as it will be sent: the composer's rows as asset lines, and the brief written out. */
  const buildRequest = React.useCallback(
    (): BookingRequest => ({
      ...request,
      requesterEmail: request.requesterEmail.trim().toLowerCase(),
      department: omit?.includes("department") ? null : (request.department?.trim() || null),
      assets: template.assets.enabled ? assets.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), quantity: a.quantity, spec: a.notes?.trim() || null, assetType: a.assetType?.trim() || null })) : [],
      assetTypes: template.assets.enabled ? allAssetTypes(template.assets.askAssetTypes ? request.assetTypes : []) : [],
      referenceUrl: template.assets.enabled && template.assets.askLink ? (request.referenceUrl?.trim() || null) : null,
      brief: composeBrief(request, template),
      itemId,
      // Which form this was, so a booking made just as the form changed is checked against it.
      formVersion: form.version ?? null,
    }),
    [request, assets, template, omit, itemId, allAssetTypes, form.version],
  );

  // Sent back: the form has to come back different from what was sent (the server checks too).
  const unchanged = !!resubmit && !!initial && changedParts(initial, buildRequest()).length === 0;

  // Who the wizard is booking as without having to ask: the account first, and
  // then whatever this browser remembers.
  const known = account ?? memory.requester;
  const knownRequester = !!known && request.requesterName.trim() === known.name && request.requesterEmail.trim() === known.email;

  /** Keeps the half-finished booking in this browser, so leaving is not losing it. */
  const keep = React.useCallback(
    (next?: BookingRequest) => {
      if (!remember) return;
      const value = next ?? buildRequest();
      const worth = value.title.trim() || value.serviceTypeId || Object.keys(value.answers).length || value.assets.length;
      memory.saveDraft(worth ? { savedAt: new Date().toISOString(), request: { ...value, itemId: null } } : null);
    },
    [remember, buildRequest, memory],
  );

  const goTo = (next: number) => {
    setIndex(next);
    setFurthest((far) => Math.max(far, next));
    setFailure(null);
    // A step is a page: arriving halfway down one is disorienting, and the
    // first question of the new step is what anybody wants to see.
    bodyRef.current?.scrollIntoView({ block: "nearest" });
  };

  const advance = () => {
    if (!preview) {
      const found = validateBookingStep(step.key, buildRequest(), template, omit, todayISO());
      setErrors(found);
      if (Object.keys(found).length) return;
      keep();
    }
    goTo(Math.min(index + 1, steps.length - 1));
  };

  const back = () => {
    setErrors({});
    goTo(Math.max(index - 1, 0));
  };

  /**
   * Jump to a step already reached. Going back is always allowed; going
   * forward only as far as somebody has already been, and only through steps
   * that are still answered — an answer deleted on the way back has to be put
   * right before the recap is reachable again.
   */
  const jumpTo = (target: number) => {
    // Nothing is earned in a preview: every step is one click away.
    if (preview) {
      setErrors({});
      goTo(target);
      return;
    }
    if (target > furthest) return;
    if (target > index) {
      const value = buildRequest();
      for (let at = index; at < target; at++) {
        const found = validateBookingStep(steps[at]!.key, value, template, omit, todayISO());
        if (Object.keys(found).length) {
          setErrors(found);
          goTo(at);
          return;
        }
      }
    }
    setErrors({});
    goTo(target);
  };

  const submit = useMutation({
    mutationFn: async (value: BookingRequest) => {
      setFailure(null);
      return onSubmit(value);
    },
    onSuccess: (result, value) => {
      if (!preview) memory.remember(value, result.ticket, result.submittedAt);
      setRestored(false);
      setSubmitted(value);
      setReceipt(result);
      onBooked?.(result);
    },
    onError: (error) => setFailure(error instanceof Error ? error.message : "Something went wrong. Try again."),
  });

  /** Every step's rules, in step order, so a problem sends the reader to the step that owns it. */
  const confirm = () => {
    const value = buildRequest();
    // A preview books nothing. The ticket is shown so the last step can be read
    // like the rest, and `onSubmit` is the caller's stand-in for one.
    if (preview) {
      submit.mutate(value);
      return;
    }
    if (unchanged) {
      setFailure(NOTHING_CHANGED);
      return;
    }
    for (const [at, candidate] of steps.entries()) {
      const found = validateBookingStep(candidate.key, value, template, omit, todayISO());
      if (Object.keys(found).length) {
        setErrors(found);
        goTo(at);
        return;
      }
    }
    const parsed = bookingRequestSchema.safeParse(value);
    if (!parsed.success) {
      // Formats the template cannot describe: an address that is not an email,
      // a link without a scheme. They all live on the first or third step.
      const byKey: Record<string, BookingStep> = { requesterName: "basics", requesterEmail: "basics", title: "basics", dueDate: "basics", answers: "brief", referenceUrl: "assets", assets: "assets" };
      const issue = parsed.error.issues[0];
      const key = String(issue?.path[0] ?? "");
      const message = issue?.message ?? "Check this answer";
      const field = template.basics.fields.find((f) => f.key === key);
      // An answer's problem goes under its own question, by the block id in its path.
      const blockId = key === "answers" ? String(issue?.path[1] ?? "") : "";
      const owner = byKey[key] ?? "basics";
      const at = steps.findIndex((s) => s.key === owner);
      // goTo clears the message, so it is set after the move, not before.
      if (at >= 0) goTo(at);
      setErrors(field ? { [field.id]: message } : blockId ? { [blockId]: message } : {});
      setFailure(field || blockId ? null : message);
      return;
    }
    setErrors({});
    submit.mutate(parsed.data as BookingRequest);
  };

  /**
   * Start this booking from one this browser has already made.
   *
   * Everything but the deadline: a date that has passed is the one answer
   * nobody wants copied forward. The service comes with it, so the same brief
   * opens with the same answers already in it.
   */
  const startFrom = (past: PastBooking) => {
    setRequest((prev) => ({
      ...prev,
      title: past.title,
      serviceTypeId: serviceById(template, past.serviceTypeId) ? past.serviceTypeId : null,
      subServices: past.subServices,
      answers: past.answers,
      assetTypes: past.assetTypes,
      priority: past.priority,
      referenceUrl: past.referenceUrl,
      dueDate: null,
    }));
    setAssets(past.assets.map((line) => ({ ...newAssetRow(line.name), quantity: line.quantity, notes: line.spec ?? "", assetType: line.assetType ?? null })));
    setErrors({});
    setStartedFrom(past.id);
  };

  const startBlank = () => {
    setRequest((prev) => ({ ...emptyBookingRequest(), requesterName: prev.requesterName, requesterEmail: prev.requesterEmail, department: prev.department }));
    setAssets([]);
    setErrors({});
    setStartedFrom(null);
    setRestored(false);
    memory.saveDraft(null);
  };

  const showPast = template.review.showPastBookings === true;
  const pastFor = !preview && showPast && pastBookings && submitted?.requesterEmail.trim() ? submitted.requesterEmail.trim() : null;
  // A preview books nothing and looks nobody up: made-up rows, so the list can be seen as it will look.
  const past = preview && showPast ? { email: "preview", load: async () => [] as BookingPastSummary[], sample: samplePastBookings(form.ticketPrefix) } : pastFor && pastBookings ? { email: pastFor, load: pastBookings } : null;
  if (receipt) return <Receipt receipt={receipt} request={template.review.offerPdf === false ? null : submitted} past={resubmit ? null : past} workspaceName={form.workspaceName} template={template} itemHref={itemHref} resubmitted={!!resubmit} onAnother={() => {
    setReceipt(null);
    setSubmitted(null);
    setItemId(newId());
    setIndex(0);
    startBlank();
  }} />;

  const stepProps = { form, template, request, patch, errors, omit };
  const busy = submit.isPending;
  const last = index === steps.length - 1;

  return (
    <div className="flex min-h-0 flex-col gap-6" data-testid="booking-wizard">
      <ProgressBar steps={steps} index={index} furthest={preview ? steps.length - 1 : furthest} onJump={jumpTo} preview={preview} />

      <div ref={bodyRef} className="min-w-0">
        {index === 0 && (
          <StepBasics
            {...stepProps}
            // Signed in and booking as themselves: the card says who, and the
            // two boxes it answers are not on the form. "Booking for someone
            // else?" is what brings them back, empty.
            // Sent back: who asked is whoever the link was made for, fixed.
            hiddenKeys={resubmit && initial ? ACCOUNT_KEYS : account && knownRequester ? ACCOUNT_KEYS : undefined}
            emailCheck={emailCheck}
            identity={
              resubmit ? (
                // Where the account card sits, the same height as the department beside it.
                initial ? (
                  <div className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-surface/60 px-3 text-[13px]" data-testid="resubmit-identity">
                    <span className="shrink-0 text-muted-foreground">Requested by</span>
                    <span className="truncate font-medium">{initial.requesterName || initial.requesterEmail}</span>
                    {initial.requesterName && initial.requesterEmail && <span className="truncate text-muted-foreground">· {initial.requesterEmail}</span>}
                  </div>
                ) : null
              ) : <Identity
                account={account ?? null}
                known={known ?? null}
                knownRequester={knownRequester}
                signInHref={signInHref ?? null}
                asksRequester={template.basics.fields.some((f) => REQUESTER_KEYS.includes(f.key))}
                onForget={() => {
                  if (!account) memory.forgetRequester();
                  patch({ requesterName: "", requesterEmail: "" });
                }}
                onUseAccount={account ? () => patch({ requesterName: account.name, requesterEmail: account.email }) : null}
                history={memory.bookings}
                startedFrom={startedFrom}
                onStartFrom={startFrom}
                restored={restored}
                savedAt={memory.draft?.savedAt ?? null}
                onStartBlank={startBlank}
              />
            }
          />
        )}
        {index === 1 && <StepBrief {...stepProps} />}
        {step.key === "assets" && <StepAssets {...stepProps} assets={assets} onAssets={setAssets} derivedTypes={derivedTypes} onSkip={advance} />}
        {step.key === "review" && <StepReview {...stepProps} request={{ ...request, assetTypes: allAssetTypes(request.assetTypes) }} assets={assets} onEditStep={jumpTo} />}
      </div>

      {failure && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-3.5 py-2.5 text-[13px] text-destructive" role="alert" data-testid="booking-error">
          {failure}
        </p>
      )}

      {/* Pinned to the foot, not to the end: on a long brief the one button
          anybody came for was two screens down, and the page had to be scrolled
          to the bottom to find out it was there. */}
      <div className="sticky bottom-0 -mx-1 mt-auto flex flex-col gap-3 border-t border-border/60 bg-gradient-to-t from-card via-card to-card/85 px-1 pt-3 pb-1 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          {/* No code here any more. It used to be worked out in the browser from
              the id the form had made up, which is how it could be shown before
              anything was written — and is exactly why two bookings could end up
              with the same one. A ticket is a number in the team's series now,
              so the team gives it, and the first place it can honestly appear is
              the receipt. */}
          {last && unchanged && (
            <p className="text-2xs text-muted-foreground" data-testid="resubmit-unchanged">
              Change something to send it again.
            </p>
          )}
          {last && template.review.submitNote && (
            <p className="text-2xs text-muted-foreground">
              <InlineRichText text={template.review.submitNote} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="lg" onClick={back} disabled={index === 0 || busy} data-testid="booking-back">
            <ArrowLeft /> Back
          </Button>
          {last ? (
            <Button type="button" size="lg" onClick={confirm} disabled={busy || unchanged} className="sm:min-w-44" data-testid="booking-submit">
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" /> Booking…
                </>
              ) : (
                resubmit ? "Send again" : template.review.submitLabel
              )}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={advance} className="sm:min-w-32" data-testid="booking-next">
              Next <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Where the reader is, in four segments.
 *
 * A bar rather than a row of numbered circles: what somebody halfway through a
 * form wants to know is how much of it is left, and a filled proportion answers
 * that at a glance. A step already passed is a button back to itself; one not
 * yet reached is not, because the answers it needs are not in yet.
 */
function ProgressBar({ steps, index, furthest, onJump, preview }: { steps: StepDef[]; index: number; furthest: number; onJump: (index: number) => void; preview?: boolean }) {
  return (
    // Pinned: on a long brief the bar is the only thing saying how much is
    // left, and it was the first thing to leave the screen.
    <ol className="sticky top-0 z-10 flex gap-1.5 pb-2 before:absolute before:inset-y-0 before:-inset-x-10 before:-z-10 before:bg-card" data-testid="booking-progress" aria-label={`Step ${index + 1} of ${steps.length}: ${steps[index]?.label}`}>
      {steps.map((step, i) => {
        const done = i < index;
        const here = i === index;
        return (
          <li key={step.key} className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!preview && i > furthest}
              aria-current={here ? "step" : undefined}
              // Padded rather than taller: the bar keeps its height and the
              // step still takes a thumb on a phone.
              className={cn("group block w-full py-1.5 text-left focus-visible:outline-2 focus-visible:outline-ring sm:py-0", !preview && i > furthest ? "cursor-default" : "cursor-pointer")}
              data-testid={`booking-progress-${step.key}`}
            >
              <span className={cn("block h-1.5 rounded-full transition-colors", here ? "bg-primary" : done ? "bg-primary/45 group-hover:bg-primary/70" : "bg-border")} />
              <span className={cn("mt-1.5 flex items-center gap-1 text-2xs font-medium", here ? "text-foreground" : "text-muted-foreground")}>
                <span className="tabular">{i + 1}</span>
                <span className="min-w-0 truncate">{step.label}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Who this is going in under, what this browser remembers, and the ways out of
 * both.
 *
 * The three questions about the requester stay on the form whether or not the
 * app can answer them: filled in from an account, they are still the answers
 * being sent, and a form that hid them left somebody booking on behalf of a
 * colleague with nothing to change. So both ways are always open — sign in and
 * have them filled, or type them yourself — and the line here says which is in
 * force.
 */
function Identity({
  account,
  known,
  knownRequester,
  signInHref,
  asksRequester,
  onForget,
  onUseAccount,
  history,
  startedFrom,
  onStartFrom,
  restored,
  savedAt,
  onStartBlank,
}: {
  account: BookingAccount | null;
  known: { name: string; email: string } | null;
  knownRequester: boolean;
  signInHref: string | null;
  asksRequester: boolean;
  onForget: () => void;
  onUseAccount: (() => void) | null;
  history: PastBooking[];
  startedFrom: string | null;
  onStartFrom: (past: PastBooking) => void;
  restored: boolean;
  savedAt: string | null;
  onStartBlank: () => void;
}) {
  return (
    <div className="space-y-3">
      {restored && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl border border-border/60 bg-surface/40 px-3.5 py-2.5 text-[13px]" data-testid="booking-restored">
          <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Picked up where you left off{savedAt ? ` (${formatShortDate(savedAt.slice(0, 10))})` : ""}.
          <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onStartBlank} data-testid="booking-start-blank">
            Start fresh instead
          </button>
        </p>
      )}

      {history.length > 0 && !restored && (
        // One line, not a row of cards: a way in for the people who want it, out of the way of everyone else.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]" data-testid="booking-history">
          <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">Book something like last time?</span>
          <Select
            value={startedFrom ?? ""}
            onValueChange={(id) => {
              const past = history.find((p) => p.id === id);
              if (past) onStartFrom(past);
            }}
          >
            <SelectTrigger className="h-8 w-auto max-w-full min-w-[12rem] text-[13px]" aria-label="Start from a past booking" data-testid="booking-history-select">
              <SelectValue placeholder="Pick a past booking">{history.find((p) => p.id === startedFrom)?.title || undefined}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {history.map((past) => (
                <SelectItem key={past.id} value={past.id} data-testid="booking-history-item">
                  <span className="flex min-w-0 flex-col">
                    <span className="max-w-[22rem] truncate font-medium">{past.title || "Untitled request"}</span>
                    <span className="text-2xs text-muted-foreground">
                      <span className="tabular">{past.ticket}</span> · <span className="tabular">{formatShortDate(past.bookedAt.slice(0, 10))}</span>
                      {past.assets.length > 0 && <> · {past.assets.length === 1 ? "1 deliverable" : `${past.assets.length} deliverables`}</>}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {startedFrom && (
            <span className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground" data-testid="booking-history-note">
              Deadline left blank.
              <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onStartBlank}>
                Start blank instead
              </button>
            </span>
          )}
        </div>
      )}

      {/* Signed in and booking as themselves: the person, not a line of small
          print. The department stays a question below, because the one on the
          account is only a default. */}
      {asksRequester && knownRequester && known && account && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-surface/40 px-3.5 py-2.5" data-testid="booking-known-requester">
          {account.avatar && <UserAvatar user={account.avatar} size="lg" tooltip={false} />}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{known.name}</p>
            <p className="truncate text-2xs text-muted-foreground">{[account.title?.trim(), known.email].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" className="-my-2 py-2 text-2xs font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onForget} data-testid="booking-not-you">
            Booking for someone else?
          </button>
        </div>
      )}
      {asksRequester && knownRequester && known && !account && (
        <p className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground" data-testid="booking-known-requester">
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          <span>
            Filled in from what this browser remembers — <strong className="font-semibold text-foreground">{known.name}</strong>.
          </span>
          <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onForget} data-testid="booking-not-you">
            Not you?
          </button>
        </p>
      )}

      {/* Signing in is offered to anybody who has not, whether or not they have
          started typing; using the account is offered to anybody signed in who
          has typed over it. Neither takes the questions off the form. */}
      {asksRequester && !knownRequester && (account || signInHref) && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground" data-testid="booking-identity-offer">
          {account && onUseAccount ? (
            <>
              <UserRound className="size-3.5 shrink-0" aria-hidden />
              Signed in as {account.name}.
              <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onUseAccount} data-testid="booking-book-as-me">
                Fill these in from my account
              </button>
            </>
          ) : signInHref ? (
            <>
              <LogIn className="size-3.5 shrink-0" aria-hidden />
              Have an account here?
              <a href={signInHref} className="font-medium text-foreground/80 underline-offset-4 hover:underline" data-testid="booking-sign-in">
                Sign in
              </a>
              and these are filled in for you — or just type them.
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}

/** The receipt: the ticket to quote, what was booked, and whatever the team wrote back. */
function Receipt({
  receipt,
  request,
  workspaceName,
  template,
  itemHref,
  onAnother,
  past,
  resubmitted = false,
}: {
  receipt: BookingReceipt;
  /** Sent again after the team sent it back: the same task, nothing new booked. */
  resubmitted?: boolean;
  /** What was sent, for the PDF; null hides the button. */
  request: BookingRequest | null;
  /** The email the booking was made with and how to list its other bookings; null lists nothing. `sample` is shown instead (a preview). */
  past: { email: string; load: (email: string) => Promise<BookingPastSummary[]>; sample?: BookingPastSummary[] } | null;
  workspaceName: string;
  template: BookingFormTemplate;
  itemHref?: (receipt: BookingReceipt) => string | null;
  onAnother: () => void;
}) {
  const href = itemHref?.(receipt) ?? null;
  const reply = resubmitted ? "" : template.review.autoReply.trim();
  const [saving, setSaving] = React.useState(false);
  // Loaded on the click: the PDF library is large and most people never press it.
  const downloadPdf = async () => {
    if (!request) return;
    setSaving(true);
    try {
      const { downloadBookingPdf } = await import("../booking-pdf");
      await downloadBookingPdf({ receipt, request, template, workspaceName });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not make the PDF");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5" data-testid="booking-receipt" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{resubmitted ? "Sent. Thank you." : "Booked. Thank you."}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{resubmitted ? "The team has your answers on the same ticket." : "Quote the ticket below if you follow up with the team."}</p>
        </div>
      </div>
      <dl className="grid gap-2.5 rounded-xl border border-border/60 bg-surface/60 p-4 text-[13px] sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Ticket</dt>
        <dd className="font-semibold tabular" data-testid="booking-ticket">
          {receipt.ticket}
        </dd>
        <dt className="text-muted-foreground">Task</dt>
        <dd className="font-medium">
          {receipt.itemName}
          {receipt.assetCount > 0 && <span className="ml-1.5 font-normal text-muted-foreground">· {receipt.assetCount === 1 ? "1 asset" : `${receipt.assetCount} assets`}</span>}
        </dd>
        {!resubmitted && (
          <>
            <dt className="text-muted-foreground">Going to</dt>
            <dd>{receipt.teamName ? `${receipt.teamName} (${receipt.boardName})` : "The allocation queue — a manager will place it with the right team."}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{resubmitted ? "Sent" : "Booked"}</dt>
        <dd>{formatShortDate(receipt.submittedAt.slice(0, 10))}</dd>
      </dl>
      {reply && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card p-4 text-[13px]" data-testid="booking-auto-reply">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0">
            <InlineRichText text={reply} />
          </p>
        </div>
      )}
      {receipt.taskLink && <TaskLinkRow path={receipt.taskLink} />}
      {past && (past.sample ? <PastBookingsList rows={past.sample} /> : <PastBookings email={past.email} load={past.load} exclude={receipt.itemId} />)}
      <div className="flex flex-wrap gap-2">
        {request && (
          <Button type="button" variant="outline" onClick={() => void downloadPdf()} disabled={saving} data-testid="booking-download-pdf">
            {saving ? <LoaderCircle className="animate-spin" /> : <FileDown />} {template.review.pdfLabel?.trim() || "Download PDF"}
          </Button>
        )}
        {!resubmitted && (
          <Button type="button" variant="outline" onClick={onAnother} data-testid="booking-another">
            Book another task
          </Button>
        )}
        {href && (
          <Button type="button" asChild>
            <a href={href}>Open on {receipt.boardName}</a>
          </Button>
        )}
      </div>
    </div>
  );
}

/** The task's own link: keep it to follow the request, whatever happens to it. */
function TaskLinkRow({ path }: { path: string }) {
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it yourself.");
    }
  };
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 text-[13px]" data-testid="booking-task-link">
      <p className="font-medium">Follow your request</p>
      <p className="mt-0.5 text-muted-foreground">This link always opens this task, wherever it gets to.</p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-2xs" aria-label="Link to your request" data-testid="booking-task-link-url" />
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          <Copy /> Copy
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink /> Open
          </a>
        </Button>
      </div>
    </div>
  );
}

/** The other bookings made with the same email: ticket, name, when, and where each has got to. */
function PastBookings({ email, load, exclude }: { email: string; load: (email: string) => Promise<BookingPastSummary[]>; exclude: string }) {
  const [rows, setRows] = React.useState<BookingPastSummary[] | null>(null);
  const loadRef = React.useRef(load);
  React.useEffect(() => {
    let live = true;
    loadRef
      .current(email)
      .catch(() => [] as BookingPastSummary[])
      .then((found) => {
        if (live) setRows(found.filter((row) => row.itemId !== exclude));
      });
    return () => {
      live = false;
    };
  }, [email, exclude]);
  if (!rows || rows.length === 0) return null;
  return <PastBookingsList rows={rows} />;
}

/**
 * Rows for the editor and the preview, where nobody has booked anything: real
 * tickets, dates and statuses in the workspace's own series, with names that
 * are plainly placeholders.
 */
export function samplePastBookings(prefix: string): BookingPastSummary[] {
  const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString();
  return [
    { itemId: "sample-1", ticket: `${prefix}_041`, title: "Example booking one", bookedAt: day(6), status: { name: "Working on it", color: "orange" }, portalPath: null },
    { itemId: "sample-2", ticket: `${prefix}_033`, title: "Example booking two", bookedAt: day(19), status: { name: "Not Started", color: "gray" }, portalPath: null },
    { itemId: "sample-3", ticket: `${prefix}_027`, title: "Example booking three", bookedAt: day(40), status: { name: "Done", color: "green" }, portalPath: null },
  ];
}

/** The list itself, as the ticket shows it. */
export function PastBookingsList({ rows }: { rows: BookingPastSummary[] }) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-4" data-testid="booking-past">
      <h3 className="flex items-center gap-2 text-[13px] font-medium">
        <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        Your other bookings
      </h3>
      <ul className="mt-2.5 divide-y divide-border/60">
        {rows.map((row) => (
          <li key={row.itemId} className="flex items-start gap-3 py-2 text-[13px]" data-testid="booking-past-row">
            {row.ticket ? (
              <button
                type="button"
                title={`Copy ${row.ticket}`}
                onClick={() => void copyTicket(row.ticket!)}
                className="w-16 shrink-0 text-left font-medium text-muted-foreground tabular underline-offset-4 hover:text-foreground hover:underline"
                data-testid="booking-past-ticket"
              >
                {row.ticket}
              </button>
            ) : (
              <span className="w-16 shrink-0 text-muted-foreground">—</span>
            )}
            {row.portalPath ? (
              <a href={row.portalPath} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-words underline-offset-4 hover:underline" data-testid="booking-past-open">
                {row.title}
              </a>
            ) : (
              <span className="min-w-0 flex-1 break-words">{row.title}</span>
            )}
            <span className="shrink-0 text-2xs text-muted-foreground tabular">{formatShortDate(row.bookedAt.slice(0, 10))}</span>
            {row.status && <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium", colorClasses(row.status.color).soft)}>{row.status.name}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Copies a ticket. The clipboard API first; where a page may not use it (an
 * embedded or older browser), the old select-and-copy way.
 */
async function copyTicket(ticket: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(ticket);
  } catch {
    const box = document.createElement("textarea");
    box.value = ticket;
    box.setAttribute("readonly", "");
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.appendChild(box);
    box.select();
    const copied = document.execCommand("copy");
    box.remove();
    if (!copied) {
      toast.error(`Could not copy. The ticket is ${ticket}.`);
      return;
    }
  }
  toast.success(`Copied ${ticket}`);
}

/** `name` as the workspace's list spells it, or null when the list has no such department. */
function listedDepartment(departments: readonly { name: string }[], name: string | null | undefined): string | null {
  const wanted = (name ?? "").trim().toLowerCase();
  return (wanted && departments.find((d) => d.name.trim().toLowerCase() === wanted)?.name) || null;
}

"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, History, LoaderCircle, LogIn, MessageSquareQuote, UserRound } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookingForm as BookingFormData, BookingFormTemplate, BookingReceipt, BookingRequest, BookingStandardKey, BookingStep, ColorToken } from "@/domain";
import { bookingReference, serviceById } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { STAKEHOLDER_ERROR_KEY, bookingRequestSchema, composeBrief, emptyBookingRequest, validateBookingStep } from "@/services/booking";
import { newAssetRow, type AssetRow } from "../booking-fields";
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
  account?: { name: string; email: string } | null;
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
   * Who the request is for, when the caller is a portal serving several of
   * them.
   *
   * Not part of the template, because it is not the workspace's question: the
   * portal decides whether it needs asking at all. It rides in step one as an
   * ordinary question so that whoever is booking answers it where they answer
   * everything else, rather than being sent back to a filter on the page
   * behind the form.
   */
  stakeholders?: readonly { id: string; name: string; color: ColorToken }[];
  stakeholderId?: string | null;
  onStakeholder?: (id: string) => void;
  stakeholderLabel?: string;
  /**
   * A run of the form for somebody shaping it, not filling it in.
   *
   * Every step is reachable at once and nothing is required, because the point
   * is to read the form rather than to answer it; and the last step hands back
   * a made-up ticket instead of booking anything.
   */
  preview?: boolean;
  onSubmit: (request: BookingRequest) => Promise<BookingReceipt>;
  /** Where the booked item can be opened, for people who may see its board. Null hides the link. */
  itemHref?: (receipt: BookingReceipt) => string | null;
  onBooked?: (receipt: BookingReceipt) => void;
}

/** The questions an account answers on the reader's behalf. */
const REQUESTER_KEYS: readonly BookingStandardKey[] = ["requesterName", "requesterEmail", "department"];

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

function Wizard({ form, defaults, account, signInHref, omit, remember, stakeholders, stakeholderId, onStakeholder, stakeholderLabel, preview, onSubmit, itemHref, onBooked }: BookingWizardProps) {
  const template = form.template;
  const memory = useBookingMemory(remember ?? null);

  const steps = React.useMemo<StepDef[]>(
    () =>
      [
        { key: "basics" as const, label: "Details" },
        { key: "brief" as const, label: "Brief" },
        ...(template.assets.enabled ? [{ key: "assets" as const, label: "Deliverables" }] : []),
        { key: "review" as const, label: "Confirm" },
      ] satisfies StepDef[],
    [template.assets.enabled],
  );

  const [request, setRequest] = React.useState<BookingRequest>(() => ({
    ...emptyBookingRequest(),
    ...(memory.draft?.request ?? {}),
    requesterName: memory.draft?.request.requesterName || account?.name || memory.requester?.name || defaults?.requesterName || "",
    requesterEmail: memory.draft?.request.requesterEmail || account?.email || memory.requester?.email || defaults?.requesterEmail || "",
    department: memory.draft?.request.department ?? defaults?.department ?? null,
    itemId: null,
  }));
  const [assets, setAssets] = React.useState<AssetRow[]>(() => (memory.draft?.request.assets ?? []).map((line) => ({ ...newAssetRow(line.name), quantity: line.quantity, notes: line.spec ?? "" })));
  const [restored, setRestored] = React.useState(!!memory.draft);
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

  /** The request as it will be sent: the composer's rows as asset lines, and the brief written out. */
  const buildRequest = React.useCallback(
    (): BookingRequest => ({
      ...request,
      requesterEmail: request.requesterEmail.trim().toLowerCase(),
      department: omit?.includes("department") ? null : (request.department?.trim() || null),
      assets: template.assets.enabled ? assets.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), quantity: a.quantity, spec: a.notes?.trim() || null })) : [],
      assetTypes: template.assets.enabled && template.assets.askAssetTypes ? request.assetTypes : [],
      referenceUrl: template.assets.enabled && template.assets.askLink ? (request.referenceUrl?.trim() || null) : null,
      brief: composeBrief(request, template),
      itemId,
    }),
    [request, assets, template, omit, itemId],
  );

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

  /**
   * The caller's own question, checked beside the template's.
   *
   * Nothing may be booked against nobody: a request raised for no stakeholder
   * would show up in nobody's list, which is worse than being asked.
   */
  const stakeholderProblem = (key: BookingStep): Record<string, string> =>
    key === "basics" && stakeholders && stakeholders.length > 0 && !stakeholderId ? { [STAKEHOLDER_ERROR_KEY]: "Say who this request is for" } : {};

  const advance = () => {
    if (!preview) {
      const found = { ...validateBookingStep(step.key, buildRequest(), template, omit), ...stakeholderProblem(step.key) };
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
        const found = { ...validateBookingStep(steps[at]!.key, value, template, omit), ...stakeholderProblem(steps[at]!.key) };
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
      if (!preview) memory.remember(value, result.reference, result.submittedAt);
      setRestored(false);
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
    for (const [at, candidate] of steps.entries()) {
      const found = { ...validateBookingStep(candidate.key, value, template, omit), ...stakeholderProblem(candidate.key) };
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
      const byKey: Record<string, BookingStep> = { requesterName: "basics", requesterEmail: "basics", title: "basics", dueDate: "basics", referenceUrl: "assets", assets: "assets" };
      const issue = parsed.error.issues[0];
      const key = String(issue?.path[0] ?? "");
      const field = template.basics.fields.find((f) => f.key === key);
      const owner = byKey[key] ?? "basics";
      const at = steps.findIndex((s) => s.key === owner);
      setErrors(field ? { [field.id]: issue?.message ?? "Check this answer" } : {});
      setFailure(field ? null : (issue?.message ?? "Something in the form is not right yet."));
      if (at >= 0) goTo(at);
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
    setAssets(past.assets.map((line) => ({ ...newAssetRow(line.name), quantity: line.quantity, notes: line.spec ?? "" })));
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

  if (receipt) return <Receipt receipt={receipt} template={template} itemHref={itemHref} onAnother={() => {
    setReceipt(null);
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
            stakeholders={stakeholders}
            stakeholderId={stakeholderId ?? null}
            onStakeholder={onStakeholder}
            stakeholderLabel={stakeholderLabel}
            // Signed in and booking as themselves: their details are the
            // account's, and there is nothing to correct. "Booking for someone
            // else?" is what hands the boxes back.
            lockedKeys={account && knownRequester ? REQUESTER_KEYS : undefined}
            identity={
              <Identity
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
        {step.key === "assets" && <StepAssets {...stepProps} assets={assets} onAssets={setAssets} onSkip={advance} />}
        {step.key === "review" && <StepReview {...stepProps} assets={assets} onEditStep={jumpTo} />}
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
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            Reference
            <span className="rounded-md border border-border/60 bg-surface/70 px-1.5 py-0.5 font-medium text-foreground tabular" title="The reference this booking will carry" data-testid="booking-reference-preview">
              {bookingReference(itemId)}
            </span>
          </p>
          {last && template.review.submitNote && <p className="text-2xs text-muted-foreground">{template.review.submitNote}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="lg" onClick={back} disabled={index === 0 || busy} data-testid="booking-back">
            <ArrowLeft /> Back
          </Button>
          {last ? (
            <Button type="button" size="lg" onClick={confirm} disabled={busy} className="sm:min-w-44" data-testid="booking-submit">
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" /> Booking…
                </>
              ) : (
                template.review.submitLabel
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
              className={cn("group block w-full text-left focus-visible:outline-2 focus-visible:outline-ring", !preview && i > furthest ? "cursor-default" : "cursor-pointer")}
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
  account: { name: string; email: string } | null;
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
        <div className="rounded-xl border border-border/60 bg-surface/40 p-3.5" data-testid="booking-history">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium">
            <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            Book something like last time?
            <span className="font-normal text-muted-foreground">Pick one to fill this in — you can change anything.</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {history.map((past) => (
              <button
                key={past.id}
                type="button"
                onClick={() => onStartFrom(past)}
                className={cn("group max-w-[18rem] min-w-0 rounded-xl border px-3 py-2 text-left transition-colors", startedFrom === past.id ? "border-primary/50 bg-primary/[0.06]" : "border-border/60 bg-card hover:border-border hover:bg-accent/50")}
                data-testid="booking-history-item"
              >
                <span className="block truncate text-[13px] font-medium" title={past.title}>
                  {past.title || "Untitled request"}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <span className="tabular">{formatShortDate(past.bookedAt.slice(0, 10))}</span>
                  {past.assets.length > 0 && <span>· {past.assets.length === 1 ? "1 deliverable" : `${past.assets.length} deliverables`}</span>}
                </span>
              </button>
            ))}
          </div>
          {startedFrom && (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground" data-testid="booking-history-note">
              Filled in from that booking. The deadline is left blank on purpose.
              <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onStartBlank}>
                Start blank instead
              </button>
            </p>
          )}
        </div>
      )}

      {asksRequester && knownRequester && known && (
        <p className="flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground" data-testid="booking-known-requester">
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          <span>
            Filled in {account ? "from your account" : "from what this browser remembers"} — <strong className="font-semibold text-foreground">{known.name}</strong>.
          </span>
          <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={onForget} data-testid="booking-not-you">
            {account ? "Booking for someone else?" : "Not you?"}
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

/** The ticket: the reference to quote, what was booked, and whatever the team wrote back. */
function Receipt({ receipt, template, itemHref, onAnother }: { receipt: BookingReceipt; template: BookingFormTemplate; itemHref?: (receipt: BookingReceipt) => string | null; onAnother: () => void }) {
  const href = itemHref?.(receipt) ?? null;
  const reply = template.review.autoReply.trim();
  return (
    <div className="space-y-5" data-testid="booking-receipt" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-500/15 dark:text-green-400">
          <CheckCircle2 className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">Booked. Thank you.</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Quote the reference below if you follow up with the team.</p>
        </div>
      </div>
      <dl className="grid gap-2.5 rounded-xl border border-border/60 bg-surface/60 p-4 text-[13px] sm:grid-cols-[120px_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-semibold tabular" data-testid="booking-reference">
          {receipt.reference}
        </dd>
        <dt className="text-muted-foreground">Task</dt>
        <dd className="font-medium">
          {receipt.itemName}
          {receipt.assetCount > 0 && <span className="ml-1.5 font-normal text-muted-foreground">· {receipt.assetCount === 1 ? "1 asset" : `${receipt.assetCount} assets`}</span>}
        </dd>
        <dt className="text-muted-foreground">Going to</dt>
        <dd>{receipt.teamName ? `${receipt.teamName} (${receipt.boardName})` : "The allocation queue — a manager will place it with the right team."}</dd>
        <dt className="text-muted-foreground">Booked</dt>
        <dd>{formatShortDate(receipt.submittedAt.slice(0, 10))}</dd>
      </dl>
      {reply && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card p-4 text-[13px]" data-testid="booking-auto-reply">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 whitespace-pre-wrap">{reply}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onAnother} data-testid="booking-another">
          Book another task
        </Button>
        {href && (
          <Button type="button" asChild>
            <a href={href}>Open on {receipt.boardName}</a>
          </Button>
        )}
      </div>
    </div>
  );
}

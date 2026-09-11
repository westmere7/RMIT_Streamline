"use client";

import { useMutation } from "@tanstack/react-query";
import { Boxes, CheckCircle2, ClipboardPen, History, LoaderCircle, LogIn, Save, Table2, UserRound } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import type { BookingAssetLine, BookingForm as BookingFormData, BookingReceipt, BookingRequest, BookingStandardKey, BookingTemplateField, BookingTemplateSection } from "@/domain";
import { BOOKING_STANDARD_KEYS, bookingReference, customFields, standardFieldFor } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { bookingRequestSchema, validateBookingAgainstTemplate } from "@/services/booking";
import { AnswerField, AssetList, emptyDraft, newAssetRow, routingNote, Section, sectionIcon, specForExtraField, StandardField, type AssetRow, type BookingDefaults, type BookingDraft } from "./booking-fields";
import { useBookingMemory, useMountedInBrowser, type BookingMemory, type PastBooking } from "./booking-remember";

/** The two questions the remembered-requester banner answers on the reader's behalf. */
const REQUESTER_KEYS: readonly BookingStandardKey[] = ["requesterName", "requesterEmail"];

export interface BookingFormProps {
  form: BookingFormData;
  /**
   * Pre-filled: the signed-in member's own details, the department a portal
   * link already knows, or a whole request copied from a past one.
   */
  defaults?: BookingDefaults;
  /** Deliverables to start from, for a booking copied from a past request. */
  defaultAssets?: BookingAssetLine[];
  /**
   * Remember this browser's requester under this key, and fill them in next
   * time. Null for a signed-in member, whose details the app already knows.
   */
  remember?: string | null;
  /**
   * Who the app knows is signed in.
   *
   * Stronger than anything a browser remembers: the two questions about them
   * are answered by their account, so the form does not ask. They can still
   * book for somebody else — the banner says whose name it is going in under
   * and offers the way out — but the default is the person who signed in.
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
   * then thrown away. An omitted key is not rendered and travels as empty.
   */
  omit?: readonly BookingStandardKey[];
  onSubmit: (request: BookingRequest) => Promise<BookingReceipt>;
  /** Where the booked item can be opened, for people who may see its board. Null hides the link. */
  itemHref?: (receipt: BookingReceipt) => string | null;
  onBooked?: (receipt: BookingReceipt) => void;
}

/**
 * The booking form itself, shared by the public page and the in-app page.
 *
 * What it asks is the workspace's template (`form.template`): sections of
 * standard questions, worded the workspace's way, and any custom questions of
 * its own. Standard answers go into the fixed parts of the request and the
 * service maps them onto the receiving board (see src/services/booking.ts);
 * custom answers travel keyed by question. When a team takes bookings straight
 * onto one of its boards, that board's simple extra columns appear under the
 * team question, so nothing the team needs is missing on arrival.
 */
export function BookingForm(props: BookingFormProps) {
  const memory = useBookingMemory(props.remember ?? null);
  // One commit behind on purpose. The first draft is built from what this
  // browser remembers, and the server has no way to know that — so the form
  // is made once the answer is in rather than being filled in afterwards,
  // which is both a flicker and a fight with whatever has been typed since.
  const mounted = useMountedInBrowser();
  if (props.remember && !mounted) return <FormSkeleton />;
  return <BookingFormFields {...props} memory={memory} />;
}

/** The shape of the form while the browser is still being asked what it knows. */
function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden data-testid="booking-form-skeleton">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-10 w-2/3 rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-11 w-44 rounded-lg" />
    </div>
  );
}

function BookingFormFields({ form, defaults, defaultAssets, account, signInHref, omit, onSubmit, itemHref, onBooked, memory }: BookingFormProps & { memory: BookingMemory & Omit<ReturnType<typeof useBookingMemory>, "requester" | "bookings"> }) {
  const template = form.template;
  // Whoever this browser last booked as, unless the caller named somebody —
  // a signed-in member is always themselves.
  const [draft, setDraft] = React.useState<BookingDraft>(() =>
    emptyDraft({
      requesterName: account?.name ?? memory.requester?.name,
      requesterEmail: account?.email ?? memory.requester?.email,
      ...Object.fromEntries(Object.entries(defaults ?? {}).filter(([, value]) => value !== undefined && value !== "")),
      // Whatever was left half-written last time, put back exactly as it was.
      ...(memory.draft
        ? {
            title: memory.draft.title,
            brief: memory.draft.brief,
            dueDate: memory.draft.dueDate,
            referenceUrl: memory.draft.referenceUrl,
            assetTypes: memory.draft.assetTypes,
            priority: memory.draft.priority,
            teamId: memory.draft.teamId,
          }
        : {}),
    }),
  );
  // The booking's reference, settled before it is sent: the id the item will be
  // created with is made here, so the code on the form is the code on the receipt.
  const [itemId, setItemId] = React.useState(() => newId());
  const [assets, setAssets] = React.useState<AssetRow[]>(() =>
    (memory.draft?.assets ?? defaultAssets ?? []).map((line) => ({ ...newAssetRow(line.name), quantity: line.quantity, notes: line.spec ?? "" })),
  );
  const [savedDraft, setSavedDraft] = React.useState(!!memory.draft);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [receipt, setReceipt] = React.useState<BookingReceipt | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"request" | "assets">("request");
  // Whether the optional half of the form is showing. Opened by a starter that
  // filled some of it in, and by a problem found in something it hides.
  /** Which past booking this one was started from, so the strip can say so. */
  const [startedFrom, setStartedFrom] = React.useState<string | null>(null);
  const assetsOn = template.assets.enabled;
  const assetCount = assetsOn ? assets.filter((a) => a.name.trim()).length : 0;
  const patch = (p: Partial<BookingDraft>) => setDraft((prev) => ({ ...prev, ...p }));

  // Who the form is booking as without having to ask: the account first, and
  // then whatever this browser remembers.
  const known = account ?? memory.requester;
  const knownRequester = !!known && draft.requesterName.trim() === known.name && draft.requesterEmail.trim() === known.email;

  /**
   * Start this booking from one this browser has already made.
   *
   * Everything but the deadline: a date that has passed is the one answer
   * nobody wants copied forward. The optional half opens with it, because a
   * form that quietly held four answers the reader had not seen would be
   * worse than the wall it replaced.
   */
  const startFrom = (past: PastBooking) => {
    setDraft((prev) => ({
      ...prev,
      title: past.title,
      brief: past.brief,
      assetTypes: past.assetTypes,
      priority: past.priority,
      teamId: past.teamId,
      referenceUrl: past.referenceUrl ?? "",
      dueDate: "",
    }));
    setAssets(past.assets.map((line) => ({ ...newAssetRow(line.name), quantity: line.quantity, notes: line.spec ?? "" })));
    setErrors({});
    setStartedFrom(past.id);
  };

  const team = form.teams.find((t) => t.id === draft.teamId) ?? null;
  const omitted = React.useMemo(() => new Set<BookingStandardKey>(omit ?? []), [omit]);
  const asks = (key: BookingStandardKey) => !omitted.has(key) && standardFieldFor(template, key) !== null;

  // Every question the template asks, in its own order, on one page.
  //
  // It was split for a while — the four it insists on in front, the rest
  // behind "Add more detail" — and that traded one wall for two problems: a
  // section heading appearing twice, once in each half, and the reader having
  // to open a box to find out whether anything else was wanted. The required
  // ones are marked with an asterisk and that is enough.
  //
  // The two questions about who is asking are dropped where the form already
  // knows: the banner above answers them, and hands them back the moment it
  // is overruled.
  const answeredByIdentity = (field: BookingTemplateField) => knownRequester && field.kind === "standard" && REQUESTER_KEYS.includes(field.key);
  const asked = template.sections
    .map((section) => ({ section, fields: section.fields.filter((field) => !(field.kind === "standard" && omitted.has(field.key)) && !answeredByIdentity(field)) }))
    .filter(({ fields }) => fields.length > 0);

  /** The draft as a request: only what the form asks travels. */
  const buildRequest = (): BookingRequest => ({
    requesterName: draft.requesterName,
    requesterEmail: draft.requesterEmail.trim().toLowerCase(),
    department: asks("department") ? draft.department || null : null,
    title: draft.title,
    brief: draft.brief,
    assetTypes: asks("assetTypes") ? draft.assetTypes : [],
    assets: assetsOn ? assets.filter((a) => a.name.trim()).map<BookingAssetLine>((a) => ({ name: a.name.trim(), quantity: a.quantity, spec: a.notes?.trim() || null })) : [],
    teamId: asks("team") ? draft.teamId : null,
    dueDate: asks("dueDate") ? draft.dueDate || null : null,
    priority: asks("priority") ? draft.priority : null,
    referenceUrl: asks("referenceUrl") ? draft.referenceUrl || null : null,
    // Only answers to the chosen team's questions travel; a switch of team drops the others.
    extra: asks("team") ? Object.fromEntries(Object.entries(draft.extra).filter(([columnId]) => team?.fields.some((f) => f.columnId === columnId))) : {},
    answers: Object.fromEntries(customFields(template).flatMap((f) => (draft.answers[f.id] ? [[f.id, draft.answers[f.id]!]] : []))),
    itemId,
  });

  const submit = useMutation({
    mutationFn: async (request: BookingRequest) => {
      setError(null);
      return onSubmit(request);
    },
    onSuccess: (result, request) => {
      memory.remember(request, result.reference, result.submittedAt);
      setSavedDraft(false);
      setReceipt(result);
      onBooked?.(result);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong. Try again."),
  });

  /** Formats first (email, links, dates), then the template's own rules; each message lands under its question. */
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const request = buildRequest();
    const parsed = bookingRequestSchema.safeParse(request);
    const found: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        const id = key === "assets" ? "assets" : (BOOKING_STANDARD_KEYS as readonly string[]).includes(key) ? standardFieldFor(template, key as BookingStandardKey)?.id : undefined;
        if (id && !found[id]) found[id] = issue.message;
      }
    }
    for (const [id, message] of Object.entries(validateBookingAgainstTemplate(request, template))) found[id] ??= message;
    setErrors(found);
    const ids = Object.keys(found);
    if (ids.length) {
      // A problem on the request tab wins the view; only an assets-only problem opens that tab.
      setTab(ids.every((id) => id === "assets") ? "assets" : "request");
      return;
    }
    submit.mutate(parsed.success ? (parsed.data as BookingRequest) : request);
  };

  const reset = () => {
    setReceipt(null);
    setItemId(newId());
    setErrors({});
    setAssets([]);
    setTab("request");
    setDraft((prev) => ({ ...emptyDraft(), requesterName: prev.requesterName, requesterEmail: prev.requesterEmail, department: prev.department }));
  };

  if (receipt) {
    const href = itemHref?.(receipt) ?? null;
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={reset} data-testid="booking-another">
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

  const busy = submit.isPending;
  // Nothing typed yet is nothing to keep.
  const worthSaving = !!(draft.title.trim() || draft.brief.trim() || draft.assetTypes.length || draft.dueDate || draft.referenceUrl.trim() || assets.some((a) => a.name.trim()));

  const renderField = (field: BookingTemplateField) => {
    if (field.kind === "custom") {
      return <AnswerField spec={field} value={draft.answers[field.id]} onChange={(value) => setDraft((prev) => ({ ...prev, answers: { ...prev.answers, [field.id]: value } }))} error={errors[field.id]} idPrefix="booking-answer" />;
    }
    const teamExtras =
      field.key === "team" ? (
        <>
          <p className="-mt-2 text-2xs text-muted-foreground" data-testid="booking-routing">
            {routingNote(team)}
          </p>
          {team && team.fields.length > 0 && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-surface/50 p-4" data-testid="booking-extra">
              <div>
                <p className="text-[13px] font-medium">A few more details for {team.name}</p>
                <p className="text-2xs text-muted-foreground">All optional. They land straight in the team&apos;s board.</p>
              </div>
              {team.fields.map((extraField) => (
                <AnswerField
                  key={extraField.columnId}
                  spec={specForExtraField(extraField)}
                  value={draft.extra[extraField.columnId]}
                  onChange={(value) => setDraft((prev) => ({ ...prev, extra: { ...prev.extra, [extraField.columnId]: value } }))}
                  idPrefix="booking-extra"
                />
              ))}
            </div>
          )}
        </>
      ) : undefined;
    return <StandardField field={field} form={form} draft={draft} onChange={patch} error={errors[field.id]} teamExtras={teamExtras} />;
  };

  // A section left with nothing to ask is not rendered: omitting the only
  // question in "About you" must not leave its heading standing alone.
  const renderSection = (section: BookingTemplateSection, fields: BookingTemplateField[]) => (
    <Section key={section.id} title={section.title} hint={section.hint} icon={sectionIcon(section.id)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id} className={cn("min-w-0", field.width === "full" && "sm:col-span-2")}>
            {renderField(field)}
          </div>
        ))}
      </div>
    </Section>
  );

  const requestTab = (
    <>
      {memory.bookings.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface/40 p-3.5" data-testid="booking-history">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium">
            <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            Book something like last time?
            <span className="font-normal text-muted-foreground">Pick one to fill this in — you can change anything.</span>
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {memory.bookings.map((past) => (
              <button
                key={past.id}
                type="button"
                onClick={() => startFrom(past)}
                className={cn(
                  "group max-w-[18rem] min-w-0 rounded-xl border px-3 py-2 text-left transition-colors",
                  startedFrom === past.id ? "border-primary/50 bg-primary/[0.06]" : "border-border/60 bg-card hover:border-border hover:bg-accent/50",
                )}
                data-testid="booking-history-item"
              >
                <span className="block truncate text-[13px] font-medium" title={past.title}>
                  {past.title || "Untitled request"}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <span className="tabular">{formatShortDate(past.bookedAt.slice(0, 10))}</span>
                  {past.assets.length > 0 && <span>· {past.assets.length === 1 ? "1 deliverable" : `${past.assets.length} deliverables`}</span>}
                  {past.assetTypes.length > 0 && <span className="min-w-0 truncate">· {past.assetTypes.slice(0, 2).join(", ")}</span>}
                </span>
              </button>
            ))}
          </div>
          {startedFrom && (
            <p className="mt-2.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground" data-testid="booking-history-note">
              Filled in from that booking. The deadline is left blank on purpose.
              <button
                type="button"
                className="font-medium text-foreground/80 underline-offset-4 hover:underline"
                onClick={() => {
                  setDraft((prev) => ({ ...emptyDraft(), requesterName: prev.requesterName, requesterEmail: prev.requesterEmail, department: prev.department }));
                  setAssets([]);
                  setStartedFrom(null);
                }}
              >
                Start blank instead
              </button>
            </p>
          )}
        </div>
      )}

      {knownRequester && known && (
        <div data-testid="booking-known-requester">
          <Section
            title="Booking as"
            icon={UserRound}
            hint={
              <>
                <strong className="font-semibold text-foreground">{known.name}</strong> · {known.email}
                {account && " · signed in"}
              </>
            }
            action={
              <button
                type="button"
                className="text-[13px] font-medium text-foreground/80 underline-offset-4 hover:underline"
                onClick={() => {
                  // The two questions come straight back where the template
                  // puts them, so there is nothing to open.
                  if (!account) memory.forgetRequester();
                  setDraft((prev) => ({ ...prev, requesterName: "", requesterEmail: "" }));
                }}
                data-testid="booking-not-you"
              >
                {account ? "Booking for someone else?" : "Not you?"}
              </button>
            }
          />
        </div>
      )}

      {/* Typing their own details in: the two ways out of that, depending on
          whether the app knows them. Signing in is offered to everybody else,
          because it answers these two questions for good. */}
      {!knownRequester && (account || signInHref) && (
        <p className="flex flex-wrap items-center gap-x-1.5 pl-[2.375rem] text-2xs text-muted-foreground" data-testid="booking-identity-offer">
          {account ? (
            <>
              <UserRound className="size-3.5 shrink-0" aria-hidden />
              Signed in as {account.name}.
              <button
                type="button"
                className="font-medium text-foreground/80 underline-offset-4 hover:underline"
                onClick={() => setDraft((prev) => ({ ...prev, requesterName: account.name, requesterEmail: account.email }))}
                data-testid="booking-book-as-me"
              >
                Book under this account
              </button>
            </>
          ) : (
            <>
              <LogIn className="size-3.5 shrink-0" aria-hidden />
              Have an account here?
              <a href={signInHref!} className="font-medium text-foreground/80 underline-offset-4 hover:underline" data-testid="booking-sign-in">
                Sign in
              </a>
              and these two are filled in for you.
            </>
          )}
        </p>
      )}

      {asked.map(({ section, fields }) => renderSection(section, fields))}
    </>
  );

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate data-testid="booking-form">
      {assetsOn ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "request" | "assets")}>
          <UnderlineTabsList className="-mx-1 mb-6">
            <UnderlineTabsTrigger value="request" data-testid="booking-tab-request">
              <ClipboardPen className="size-3.5" /> {template.requestTabLabel}
            </UnderlineTabsTrigger>
            <UnderlineTabsTrigger value="assets" data-testid="booking-tab-assets">
              <Boxes className="size-3.5" /> {template.assets.tabLabel}
              {assetCount > 0 && <span className="rounded-full bg-primary/15 px-1.5 text-2xs font-semibold text-primary tabular">{assetCount}</span>}
            </UnderlineTabsTrigger>
          </UnderlineTabsList>
          <TabsContent value="request" className="space-y-5">
            {requestTab}
          </TabsContent>
          <TabsContent value="assets" className="space-y-4">
            <AssetList rows={assets} onChange={setAssets} title={template.assets.title} hint={template.assets.hint} error={errors.assets} />
            {/* The same link the request tab asks for, offered where the work
                of listing deliverables is actually being avoided. Listing them
                is better — the team then tracks each one — but somebody who
                already has the list in a spreadsheet should not have to retype
                it to be allowed to book, and "mention it in the brief" was a
                sentence asking them to do our filing for us. */}
            {asks("referenceUrl") && (
              <div className="rounded-xl border border-border/60 bg-surface/50 p-3.5" data-testid="booking-asset-link-panel">
                <Label htmlFor="booking-asset-link" className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Table2 className="size-3.5 text-muted-foreground" aria-hidden /> Already have the list somewhere?
                </Label>
                <p className="mt-0.5 text-2xs text-muted-foreground">Paste a link to the spreadsheet or brief instead and the team will work from that.</p>
                <Input
                  id="booking-asset-link"
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  className="mt-2"
                  value={draft.referenceUrl}
                  onChange={(event) => patch({ referenceUrl: event.target.value })}
                  data-testid="booking-asset-link"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-5">{requestTab}</div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-3.5 py-2.5 text-[13px] text-destructive" role="alert" data-testid="booking-error">
          {error}
        </p>
      )}

      {/* Pinned to the foot of the form, not to the end of it: on a long
          template the one button anybody came for was two screens down, and
          the page had to be scrolled to the bottom to find out it was there.
          It floats over the last few rows on a bed of the form's own surface,
          so nothing is hidden behind it. */}
      <div className="sticky bottom-0 -mx-1 mt-1 flex flex-col gap-3 border-t border-border/60 bg-gradient-to-t from-card via-card to-card/85 px-1 pt-3 pb-1 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            Reference
            <span className="rounded-md border border-border/60 bg-surface/70 px-1.5 py-0.5 font-medium text-foreground tabular" title="The reference this booking will carry" data-testid="booking-reference-preview">
              {bookingReference(itemId)}
            </span>
          </p>
          {savedDraft ? (
            <p className="flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground" data-testid="booking-draft-note">
              Saved on this device.
              <button
                type="button"
                className="font-medium text-foreground/80 underline-offset-4 hover:underline"
                onClick={() => {
                  memory.saveDraft(null);
                  setSavedDraft(false);
                }}
              >
                Throw the draft away
              </button>
            </p>
          ) : (
            template.submitNote && <p className="text-2xs text-muted-foreground">{template.submitNote}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Nothing is sent: a draft is kept in this browser, so a form
              abandoned mid-sentence is still there tomorrow. */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy || !worthSaving}
            onClick={() => {
              memory.saveDraft({
                savedAt: new Date().toISOString(),
                title: draft.title,
                brief: draft.brief,
                dueDate: draft.dueDate,
                referenceUrl: draft.referenceUrl,
                assetTypes: draft.assetTypes,
                priority: draft.priority,
                teamId: draft.teamId,
                assets: assets.filter((a) => a.name.trim()).map((a) => ({ name: a.name.trim(), quantity: a.quantity, spec: a.notes?.trim() || null })),
              });
              setSavedDraft(true);
            }}
            data-testid="booking-save-draft"
          >
            <Save /> Save as draft
          </Button>
          <Button type="submit" size="lg" disabled={busy} className="sm:min-w-44" data-testid="booking-submit">
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" /> Booking…
              </>
            ) : (
              template.submitLabel
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

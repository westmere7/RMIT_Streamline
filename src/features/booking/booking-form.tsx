"use client";

import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import type { BookingAssetLine, BookingForm as BookingFormData, BookingReceipt, BookingRequest, BookingStandardKey, BookingTemplateField } from "@/domain";
import { BOOKING_STANDARD_KEYS, bookingReference, customFields, standardFieldFor } from "@/domain";
import { formatShortDate } from "@/lib/dates/dates";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { bookingRequestSchema, validateBookingAgainstTemplate } from "@/services/booking";
import { AnswerField, AssetList, emptyDraft, routingNote, Section, specForExtraField, StandardField, type AssetRow, type BookingDraft } from "./booking-fields";

export interface BookingFormProps {
  form: BookingFormData;
  /** Pre-filled for a signed-in member; a stakeholder starts blank. */
  defaults?: Partial<Pick<BookingRequest, "requesterName" | "requesterEmail" | "department">>;
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
export function BookingForm({ form, defaults, onSubmit, itemHref, onBooked }: BookingFormProps) {
  const template = form.template;
  const [draft, setDraft] = React.useState<BookingDraft>(() => emptyDraft(defaults));
  // The booking's reference, settled before it is sent: the id the item will be
  // created with is made here, so the code on the form is the code on the receipt.
  const [itemId, setItemId] = React.useState(() => newId());
  const [assets, setAssets] = React.useState<AssetRow[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [receipt, setReceipt] = React.useState<BookingReceipt | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"request" | "assets">("request");
  const assetsOn = template.assets.enabled;
  const assetCount = assetsOn ? assets.filter((a) => a.name.trim()).length : 0;
  const patch = (p: Partial<BookingDraft>) => setDraft((prev) => ({ ...prev, ...p }));

  const team = form.teams.find((t) => t.id === draft.teamId) ?? null;
  const asks = (key: BookingStandardKey) => standardFieldFor(template, key) !== null;

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
    onSuccess: (result) => {
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
    setDraft((prev) => ({ ...emptyDraft(defaults), requesterName: prev.requesterName, requesterEmail: prev.requesterEmail, department: prev.department }));
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

  const sections = template.sections.map((section) => (
    <Section key={section.id} title={section.title} hint={section.hint}>
      <div className="grid gap-4 sm:grid-cols-2">
        {section.fields.map((field) => (
          <div key={field.id} className={cn("min-w-0", field.width === "full" && "sm:col-span-2")}>
            {renderField(field)}
          </div>
        ))}
      </div>
    </Section>
  ));

  return (
    <form className="space-y-6" onSubmit={handleSubmit} noValidate data-testid="booking-form">
      {assetsOn ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "request" | "assets")}>
          <UnderlineTabsList className="-mx-1 mb-6">
            <UnderlineTabsTrigger value="request" data-testid="booking-tab-request">
              {template.requestTabLabel}
            </UnderlineTabsTrigger>
            <UnderlineTabsTrigger value="assets" data-testid="booking-tab-assets">
              {template.assets.tabLabel}
              {assetCount > 0 ? <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{assetCount}</span> : <span className="text-2xs font-normal text-muted-foreground">optional</span>}
            </UnderlineTabsTrigger>
          </UnderlineTabsList>
          <TabsContent value="request" className="space-y-7">
            {sections}
          </TabsContent>
          <TabsContent value="assets">
            <AssetList rows={assets} onChange={setAssets} title={template.assets.title} hint={template.assets.hint} error={errors.assets} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-7">{sections}</div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-3.5 py-2.5 text-[13px] text-destructive" role="alert" data-testid="booking-error">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            Reference
            <span className="rounded-md border border-border/60 bg-surface/70 px-1.5 py-0.5 font-medium text-foreground tabular" title="The reference this booking will carry" data-testid="booking-reference-preview">
              {bookingReference(itemId)}
            </span>
          </p>
          {template.submitNote && <p className="text-2xs text-muted-foreground">{template.submitNote}</p>}
        </div>
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
    </form>
  );
}

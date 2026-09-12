"use client";

import { ArrowRight, Boxes, Info, Link2, SkipForward } from "lucide-react";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichText } from "@/components/shared/rich-text";
import type { BookingBlock, BookingForm as BookingFormData, BookingFormTemplate, BookingRequest, BookingServiceType, BookingStandardKey } from "@/domain";
import { isAnswerEmpty, isQuestionBlock, openFollowUps, questionNumbers, serviceById, visibleBlocks } from "@/domain";
import { SPAN } from "../booking-fields";
import { formatShortDate } from "@/lib/dates/dates";
import { cn } from "@/lib/utils";
import { SERVICE_ERROR_KEY, SUBSERVICE_ERROR_KEY, composeBrief } from "@/services/booking";
import { AssetList, AssetTypePicker, BlockField, Chip, ChipGroup, Field, SeparatorBlockView, ServiceCardShell, StandardField, TextBlockView, slug, toggle, type AssetRow } from "../booking-fields";

/**
 * The four steps of the booking wizard, each one a plain function of the
 * request being built. The wizard itself (booking-wizard.tsx) owns the state,
 * the validation and the bar at the top; these only render.
 */

export interface StepProps {
  form: BookingFormData;
  template: BookingFormTemplate;
  request: BookingRequest;
  /** A patch, or a function of the request as it stands. See `patch` in booking-wizard.tsx. */
  patch: (patch: Partial<BookingRequest> | ((prev: BookingRequest) => Partial<BookingRequest>)) => void;
  errors: Record<string, string>;
  /** Standard questions this caller does not ask, whatever the template says. */
  omit?: readonly BookingStandardKey[];
}

// ---- 1. who is asking, and what kind of work this is --------------------------

export function StepBasics({
  form,
  template,
  request,
  patch,
  errors,
  omit,
  identity,
  hiddenKeys,
}: StepProps & {
  identity?: React.ReactNode;
  /** Questions the account has answered: the card above carries them, so they are not on the form. */
  hiddenKeys?: readonly BookingStandardKey[];
}) {
  const omitted = new Set<BookingStandardKey>([...(omit ?? []), ...(hiddenKeys ?? [])]);
  const fields = template.basics.fields.filter((field) => !omitted.has(field.key));
  // Signed in, the card answers the name and email, and the department sits
  // beside it on one line: three facts about one person, still in one row.
  // Signed out the three are boxes in the grid, as they always were.
  const accountRow = !!identity && !!hiddenKeys?.includes("requesterName") && hiddenKeys.includes("requesterEmail");
  const besideCard = accountRow ? (fields.find((f) => f.key === "department") ?? null) : null;
  const gridFields = besideCard ? fields.filter((f) => f !== besideCard) : fields;
  const service = serviceById(template, request.serviceTypeId);
  return (
    <div className="space-y-7" data-testid="booking-step-basics">
      {/* The step's own heading, in the workspace's words. Shown only when
          there is one: emptying both boxes in the editor takes it off, the way
          it does on every other step. */}
      {(template.basics.title || template.basics.hint) && (
        <div>
          {template.basics.title && <h2 className="text-[15px] font-semibold tracking-tight">{template.basics.title}</h2>}
          {template.basics.hint && <p className="text-[13px] text-muted-foreground">{template.basics.hint}</p>}
        </div>
      )}
      {besideCard ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] md:items-end" data-testid="booking-account-row">
          {identity}
          <StandardField field={besideCard} form={form} draft={request} onChange={patch} error={errors[besideCard.id]} tall />
        </div>
      ) : (
        identity
      )}

      {gridFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-6">
          {gridFields.map((field) => (
            <div key={field.id} className={cn("col-span-6 min-w-0", SPAN[field.width])}>
              <StandardField field={field} form={form} draft={request} onChange={patch} error={errors[field.id]} />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <Field label={template.basics.serviceLabel} required description={template.basics.serviceHint} error={errors[SERVICE_ERROR_KEY]}>
          {/* Cards rather than a dropdown: this is the one answer that decides
              what the rest of the form asks, so it is worth the room. */}
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label={template.basics.serviceLabel} data-testid="booking-services">
            {template.services.map((option) => (
              <ServiceCard
                key={option.id}
                service={option}
                selected={option.id === request.serviceTypeId}
                onSelect={() =>
                  patch((prev) => ({
                    serviceTypeId: option.id,
                    // Sub-services belong to the service that offered them; a
                    // switch keeps nothing the new one does not recognise.
                    subServices: prev.subServices.filter((name) => option.subServices.some((s) => s.name === name)),
                  }))
                }
              />
            ))}
          </div>
        </Field>

        {service && service.subServices.length > 0 && (
          <Field label={service.subServiceLabel} required description={service.subServiceHint} error={errors[SUBSERVICE_ERROR_KEY]}>
            <ChipGroup ariaLabel={service.subServiceLabel}>
              {service.subServices.map((option) => (
                <Chip key={option.name} color={option.color} active={request.subServices.includes(option.name)} onClick={() => patch((prev) => ({ subServices: toggle(prev.subServices, option.name) }))} testId={`booking-sub-${slug(option.name)}`}>
                  {option.name}
                </Chip>
              ))}
            </ChipGroup>
          </Field>
        )}

        {service && <RoutingNote service={service} form={form} />}
      </div>
    </div>
  );
}

function ServiceCard({ service, selected, onSelect }: { service: BookingServiceType; selected: boolean; onSelect: () => void }) {
  return (
    <ServiceCardShell
      color={service.color}
      icon={service.icon}
      selected={selected}
      onSelect={onSelect}
      name={<span className="block truncate">{service.name}</span>}
      description={service.description ? <span className="text-2xs leading-relaxed text-muted-foreground">{service.description}</span> : undefined}
      testId={`booking-service-${slug(service.name)}`}
    />
  );
}

/** Where this booking will go, said before it is sent rather than after. */
function RoutingNote({ service, form }: { service: BookingServiceType; form: BookingFormData }) {
  const team = service.teamId ? (form.teams.find((t) => t.id === service.teamId) ?? null) : null;
  const text = !team
    ? "This goes to our allocation queue, and a manager places it with the right team."
    : team.boardName
      ? `This goes straight to ${team.name}.`
      : `This goes to our allocation queue, marked for ${team.name}.`;
  return (
    <p className="flex items-start gap-1.5 text-2xs text-muted-foreground" data-testid="booking-routing">
      <Info className="mt-px size-3 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

// ---- 2. the brief the service opens -------------------------------------------

export function StepBrief({ template, request, patch, errors }: StepProps) {
  const service = serviceById(template, request.serviceTypeId);
  if (!service) {
    return (
      <p className="text-[13px] text-muted-foreground" data-testid="booking-step-brief">
        Go back a step and tell us what kind of work this is — the questions here depend on it.
      </p>
    );
  }
  const numbers = questionNumbers(service.blocks);
  return (
    <div className="space-y-5" data-testid="booking-step-brief">
      {(service.briefTitle || service.briefHint) && (
        <div>
          {service.briefTitle && <h2 className="text-[15px] font-semibold tracking-tight">{service.briefTitle}</h2>}
          {service.briefHint && <p className="text-[13px] text-muted-foreground">{service.briefHint}</p>}
        </div>
      )}
      {service.blocks.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing else to ask — carry on.</p>}
      <BriefBlocks blocks={service.blocks} numbers={numbers} request={request} patch={patch} errors={errors} />
    </div>
  );
}

/**
 * The blocks of a brief, and the questions its answers open.
 *
 * A follow-up appears under the question that opened it, bracketed by a rule
 * that runs down the left of the group — the same bracket the form editor draws
 * around the same questions, so what an administrator built and what a
 * stakeholder meets are visibly the same shape. Nothing appears until the
 * choice that opens it is made, and nothing has to be scrolled past when it is
 * not: a question behind "Yes" is not a question anybody answering "No" has to
 * read and skip.
 */
function BriefBlocks({
  blocks,
  numbers,
  request,
  patch,
  errors,
}: {
  blocks: readonly BookingBlock[];
  numbers: Map<string, string>;
  request: BookingRequest;
  patch: StepProps["patch"];
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-5">
      {blocks.map((block) => {
        if (block.kind === "separator") return <SeparatorBlockView key={block.id} />;
        if (block.kind === "text") return <TextBlockView key={block.id} block={block} />;
        const answer = request.answers[block.id];
        const opened = openFollowUps(block, answer);
        return (
          <div key={block.id} className="space-y-4">
            <BlockField
              block={block}
              number={numbers.get(block.id) ?? null}
              value={answer}
              onChange={(next) => patch((prev) => ({ answers: { ...prev.answers, [block.id]: next } }))}
              error={errors[block.id]}
            />
            {opened.length > 0 && (
              <div className="relative pl-5 before:absolute before:inset-y-0 before:left-1.5 before:w-px before:bg-border" data-testid={`booking-followups-${block.id}`}>
                <BriefBlocks blocks={opened} numbers={numbers} request={request} patch={patch} errors={errors} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- 3. the deliverables, all of it optional ----------------------------------

export function StepAssets({ form, template, request, patch, assets, onAssets, derivedTypes, onSkip }: StepProps & { assets: AssetRow[]; onAssets: (rows: AssetRow[]) => void; derivedTypes: readonly string[]; onSkip: () => void }) {
  const step = template.assets;
  // What the rows above already said, first and fixed; anything else is the requester's own addition.
  const shownTypes = [...derivedTypes, ...request.assetTypes.filter((t) => !derivedTypes.includes(t))];
  return (
    <div className="space-y-5" data-testid="booking-step-assets">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Boxes className="size-4 shrink-0 text-muted-foreground" aria-hidden /> {step.title}
          </h2>
          {step.hint && <p className="max-w-prose text-[13px] text-muted-foreground">{step.hint}</p>}
        </div>
        {/* Skipping is a button, not an absence of one. Somebody who has not
            worked the list out yet should be able to say so and move on,
            instead of wondering whether the step is broken. */}
        <button type="button" onClick={onSkip} className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" data-testid="booking-skip-assets">
          <SkipForward className="size-3.5" aria-hidden /> Skip this step
        </button>
      </div>

      <AssetList rows={assets} onChange={onAssets} options={form.assetTypes} />

      {step.askAssetTypes && (
        <Field label={step.assetTypesLabel} description={derivedTypes.length > 0 ? "We picked these from your deliverables. List any other types here." : "Helps us plan; pick as many as apply."}>
          <AssetTypePicker options={form.assetTypes} value={shownTypes} fixed={derivedTypes} onChange={(next) => patch({ assetTypes: next.filter((t) => !derivedTypes.includes(t)) })} />
        </Field>
      )}

      {step.askLink && (
        <div className="rounded-xl border border-border/60 bg-surface/50 p-3.5" data-testid="booking-asset-link-panel">
          <Label htmlFor="booking-reference" className="flex items-center gap-1.5 text-[13px] font-medium">
            <Link2 className="size-3.5 text-muted-foreground" aria-hidden /> {step.linkLabel}
          </Label>
          {step.linkHint && <p className="mt-0.5 text-2xs text-muted-foreground">{step.linkHint}</p>}
          <Input id="booking-reference" type="url" inputMode="url" placeholder="https://" className="mt-2 h-11" value={request.referenceUrl ?? ""} onChange={(event) => patch({ referenceUrl: event.target.value || null })} data-testid="booking-reference" />
        </div>
      )}
    </div>
  );
}

// ---- 4. the recap ------------------------------------------------------------

export function StepReview({ form, template, request, assets, omit, onEditStep }: StepProps & { assets: AssetRow[]; onEditStep: (step: number) => void }) {
  const omitted = new Set<BookingStandardKey>(omit ?? []);
  const service = serviceById(template, request.serviceTypeId);
  const team = service?.teamId ? (form.teams.find((t) => t.id === service.teamId) ?? null) : null;
  const named = assets.filter((a) => a.name.trim());
  const answered = visibleBlocks(service?.blocks ?? [], request.answers)
    .filter(isQuestionBlock)
    .filter((b) => !isAnswerEmpty(request.answers[b.id])).length;
  const brief = composeBrief(request, template);

  const rows: Array<[string, React.ReactNode]> = [];
  const ask = (key: BookingStandardKey) => !omitted.has(key) && template.basics.fields.some((f) => f.key === key);
  rows.push(["Task", <span key="task" className="font-medium">{request.title || <Missing />}</span>]);
  rows.push(["From", request.requesterName ? `${request.requesterName} · ${request.requesterEmail}` : <Missing />]);
  if (ask("department")) rows.push(["Department", request.department?.trim() || <NotGiven />]);
  rows.push(["Service", service ? (request.subServices.length ? `${service.name} — ${request.subServices.join(", ")}` : service.name) : <Missing />]);
  if (ask("priority")) rows.push(["Urgency", request.priority ?? "Normal turnaround"]);
  if (ask("dueDate")) rows.push(["Needed by", request.dueDate ? formatShortDate(request.dueDate) : <NotGiven />]);
  rows.push(["Goes to", team ? (team.boardName ? `${team.name} (${team.boardName})` : `The allocation queue, marked for ${team.name}`) : "The allocation queue"]);

  return (
    <div className="space-y-5" data-testid="booking-step-review">
      {(template.review.title || template.review.hint) && (
        <div>
          {template.review.title && <h2 className="text-[15px] font-semibold tracking-tight">{template.review.title}</h2>}
          {template.review.hint && <p className="text-[13px] text-muted-foreground">{template.review.hint}</p>}
        </div>
      )}

      <RecapCard title="The request" onEdit={() => onEditStep(0)}>
        <dl className="grid gap-x-4 gap-y-1.5 text-[13px] sm:grid-cols-[7.5rem_minmax(0,1fr)]">
          {rows.map(([label, value], i) => (
            <React.Fragment key={`${label}-${i}`}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </React.Fragment>
          ))}
        </dl>
      </RecapCard>

      {/* The brief as the team will read it, and nothing else.
          It used to be shown twice here — once as a list of question-and-answer
          rows, and again underneath as "see it as the team will" — which asked
          the requester to check the same answers twice and still left them
          guessing which of the two was the one that got sent. There is one
          document; this is it. */}
      <RecapCard title="The brief" onEdit={() => onEditStep(1)} count={answered}>
        {brief ? (
          <div className="scrollbar-thin max-h-80 overflow-y-auto rounded-lg border border-border/60 bg-card p-3" data-testid="booking-recap-brief">
            <RichText body={brief} />
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">Nothing answered yet.</p>
        )}
      </RecapCard>

      {template.assets.enabled && (
        <RecapCard title="Deliverables" onEdit={() => onEditStep(2)} count={named.length}>
          {named.length === 0 && !request.referenceUrl && !request.assetTypes.length ? (
            <p className="text-[13px] text-muted-foreground">Skipped — we will work this out with you.</p>
          ) : (
            <div className="space-y-2 text-[13px]">
              {named.length > 0 && (
                <ul className="space-y-1" data-testid="booking-recap-assets">
                  {named.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="font-medium">{row.name.trim()}</span>
                      {row.quantity && row.quantity > 1 && <span className="text-muted-foreground tabular">×{row.quantity}</span>}
                      {row.notes?.trim() && <span className="text-muted-foreground">— {row.notes.trim()}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {request.assetTypes.length > 0 && <p className="text-muted-foreground">Types: {request.assetTypes.join(", ")}</p>}
              {request.referenceUrl && (
                <p className="min-w-0 break-all text-muted-foreground">
                  Link: <span className="text-foreground">{request.referenceUrl}</span>
                </p>
              )}
            </div>
          )}
        </RecapCard>
      )}
    </div>
  );
}

function RecapCard({ title, count, onEdit, children }: { title: string; count?: number; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border/60 bg-surface/40 p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight">
          {title}
          {typeof count === "number" && count > 0 && <span className="ml-1.5 font-normal text-muted-foreground tabular">{count}</span>}
        </h3>
        <button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" data-testid={`booking-recap-edit-${slug(title)}`}>
          Change <ArrowRight className="size-3" aria-hidden />
        </button>
      </div>
      {children}
    </section>
  );
}

function Missing() {
  return <span className="text-destructive">Still needed</span>;
}

function NotGiven() {
  return <span className="text-muted-foreground italic">Not given</span>;
}

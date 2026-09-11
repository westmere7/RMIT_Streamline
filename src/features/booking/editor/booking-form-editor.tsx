"use client";

import { ArrowDown, ArrowUp, Boxes, ClipboardList, Columns2, Copy, FileCheck2, Info, ListPlus, LoaderCircle, Lock, MessageSquareQuote, Plus, RectangleHorizontal, Rocket, Save, Shapes, Trash2, Undo2 } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ColorPicker } from "@/components/shared/color-picker";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BookingForm as BookingFormData, BookingFormTemplate, BookingHintMode, BookingServiceType, BookingStandardField, BookingStandardKey, BookingTemplate, ColorToken } from "@/domain";
import {
  BOOKING_HINT_MODES,
  BOOKING_HINT_MODE_LABELS,
  BOOKING_STANDARD_KEY_LABELS,
  defaultBookingFormTemplate,
  isLockedStandardKey,
  missingStandardKeys,
  newServiceType,
  newStandardField,
  templateQuestionCount,
} from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { bookingFormTemplateSchema } from "@/services/booking";
import { StandardField, slug } from "../booking-fields";
import { emptyBookingRequest } from "@/services/booking";
import { BriefBuilder } from "./brief-builder";
import { Handle, TextBox } from "./editor-controls";
import { optionsToText, parseOptions } from "./options";
import { TemplatesMenu } from "./templates-menu";

/**
 * The form editor: four steps, edited in the order a stakeholder meets them.
 *
 * Nothing typed here reaches a stakeholder. The editor works on a draft stored
 * against the workspace — saved, closed and picked up again as often as it
 * takes — and the live form changes only when somebody publishes it. That
 * separation is the point: building a service's brief is an afternoon's work,
 * and for the whole of that afternoon people are still booking.
 */

const ALLOCATION_TEAM = "__allocation__";

export interface BookingFormEditorProps {
  form: BookingFormData;
  /** The form stakeholders are being served right now; what "Publish" would replace. */
  live: BookingFormTemplate;
  /** What the editor opens on: the saved draft, or the live form when there is no draft. */
  initial: BookingFormTemplate;
  templates: BookingTemplate[];
  savingDraft: boolean;
  publishing: boolean;
  onSaveDraft: (template: BookingFormTemplate) => Promise<void>;
  onPublish: (template: BookingFormTemplate) => Promise<void>;
  onDiscardDraft: () => Promise<void>;
  onClose: () => void;
  onSaveTemplate: (input: { name: string; description: string | null; template: BookingFormTemplate }) => Promise<void>;
  onDeleteTemplate: (template: BookingTemplate) => Promise<void>;
  /** Where the editing controls go. Given one, they sit beside the form rather than above it. */
  panelContainer?: HTMLElement | null;
}

const STEP_TABS = [
  { key: "basics", label: "1 · Details", icon: ClipboardList },
  { key: "brief", label: "2 · Brief", icon: ListPlus },
  { key: "assets", label: "3 · Deliverables", icon: Boxes },
  { key: "review", label: "4 · Confirm", icon: FileCheck2 },
] as const;

type StepTab = (typeof STEP_TABS)[number]["key"];

export function BookingFormEditor({ form, live, initial, templates, savingDraft, publishing, onSaveDraft, onPublish, onDiscardDraft, onClose, onSaveTemplate, onDeleteTemplate, panelContainer }: BookingFormEditorProps) {
  const [draft, setDraft] = React.useState<BookingFormTemplate>(() => clone(initial));
  /**
   * What was last written down, as far as this editor is concerned.
   *
   * Kept here rather than read back from the query, because a save that
   * refetched and remounted the editor would throw away which step was open —
   * saving on step two and landing on step one is the sort of thing that stops
   * people saving.
   */
  const [saved, setSaved] = React.useState<BookingFormTemplate>(() => clone(initial));
  const [tab, setTab] = React.useState<StepTab>("basics");
  const [editingService, setEditingService] = React.useState<string | null>(() => initial.services[0]?.id ?? null);
  const [confirmDrop, setConfirmDrop] = React.useState(false);
  const [confirmPublish, setConfirmPublish] = React.useState(false);

  const check = bookingFormTemplateSchema.safeParse(draft);
  const problem = check.success ? null : (check.error.issues[0]?.message ?? "Something in the form is not right yet");
  // Three things can differ, and each has its own button. What is on screen
  // against what was last saved says whether there is anything to save; what is
  // on screen against what is live says whether there is anything to publish;
  // and what was last saved against what is live says whether a draft is
  // sitting there waiting, which is the one worth offering to throw away.
  const savedHere = JSON.stringify(draft) === JSON.stringify(saved);
  const matchesLive = JSON.stringify(draft) === JSON.stringify(live);
  const draftWaiting = JSON.stringify(saved) !== JSON.stringify(live);

  const update = (fn: (t: BookingFormTemplate) => void) =>
    setDraft((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });

  const service = draft.services.find((s) => s.id === editingService) ?? draft.services[0] ?? null;

  // The controls: beside the form when the page offers a place for them, above it otherwise.
  const panel = (
    <section className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-xs" data-testid="booking-editor-panel">
      <div>
        <p className="text-[13px] font-medium">Editing the form</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {matchesLive ? "This matches the form people are using." : "These changes are yours alone until you publish them."}
        </p>
      </div>
      {problem && (
        <p className="text-2xs text-destructive" role="alert" data-testid="booking-editor-problem">
          {problem}
        </p>
      )}
      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            void onSaveDraft(draft).then(() => {
              setSaved(clone(draft));
              toast.success("Draft saved", { description: "Nothing has changed for stakeholders yet." });
            })
          }
          disabled={savingDraft || publishing || !check.success || savedHere}
          title={problem ?? undefined}
          data-testid="booking-editor-save-draft"
        >
          {savingDraft ? <LoaderCircle className="animate-spin" /> : <Save />} {savedHere ? "Draft saved" : "Save draft"}
        </Button>
        <Button type="button" onClick={() => setConfirmPublish(true)} disabled={publishing || savingDraft || !check.success || matchesLive} title={problem ?? undefined} data-testid="booking-editor-publish">
          {publishing ? <LoaderCircle className="animate-spin" /> : <Rocket />} Publish the form
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(clone(saved))} disabled={savedHere || savingDraft || publishing} data-testid="booking-editor-revert">
            <Undo2 /> Undo changes
          </Button>
          <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={savingDraft || publishing} data-testid="booking-editor-close">
            Done
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <TemplatesMenu
            templates={templates}
            current={draft}
            onLoad={(t) => {
              setDraft(clone(t.template));
              setEditingService(t.template.services[0]?.id ?? null);
              toast.success(`Loaded “${t.name}”`, { description: "Save it as a draft, or publish it, to keep it." });
            }}
            onSaveTemplate={onSaveTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onReset={() => {
              const fresh = defaultBookingFormTemplate();
              setDraft(fresh);
              setEditingService(fresh.services[0]?.id ?? null);
            }}
          />
        </div>
      </div>
      {draftWaiting && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground" data-testid="booking-editor-draft-waiting">
          A saved draft is waiting to be published.
          <button type="button" className="font-medium text-foreground/80 underline-offset-4 hover:underline" onClick={() => setConfirmDrop(true)} data-testid="booking-editor-drop-draft">
            Throw it away and start from the live form
          </button>
        </p>
      )}
      <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        {templateQuestionCount(draft)} questions across {draft.services.length === 1 ? "1 service" : `${draft.services.length} services`}.
      </p>
    </section>
  );

  return (
    <div className="space-y-5" data-testid="booking-editor">
      {panelContainer ? createPortal(panel, panelContainer) : panel}

      <div role="tablist" aria-label="The steps of the form" className="flex flex-wrap items-end gap-0.5 border-b border-border/60">
        {STEP_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "relative -mb-px inline-flex h-9 items-center gap-1.5 rounded-t-lg px-3 text-[13px] font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-[2.5px] after:rounded-full after:bg-transparent",
              tab === key ? "text-foreground after:bg-ring" : "text-muted-foreground hover:text-foreground",
            )}
            data-testid={`editor-tab-${key}`}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "basics" && (
        <BasicsPane
          form={form}
          draft={draft}
          update={update}
          onEditBrief={(id) => {
            setEditingService(id);
            setTab("brief");
          }}
        />
      )}

      {tab === "brief" && (
        <div className="space-y-4">
          {draft.services.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Which service's brief">
              {draft.services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === service?.id}
                  onClick={() => setEditingService(s.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                    s.id === service?.id ? "border-foreground/80 bg-foreground text-background" : "border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent",
                  )}
                  data-testid={`editor-brief-service-${slug(s.name)}`}
                >
                  <DynamicIcon name={s.icon} className="size-3.5" />
                  {s.name || "Untitled"}
                </button>
              ))}
            </div>
          )}
          <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" aria-hidden />
            Only people who picked {service?.name || "this service"} in step one see these questions.
          </p>
          <div className="space-y-1 rounded-xl border border-dashed border-border p-4">
            <TextBox value={draft.brief.title} onChange={(v) => update((t) => (t.brief.title = v))} ariaLabel="Step two title" placeholder="What this step is called" className="text-[15px] font-semibold tracking-tight" testId="editor-step-brief-title" />
            <TextBox value={draft.brief.hint ?? ""} onChange={(v) => update((t) => (t.brief.hint = v || null))} ariaLabel="Step two hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" />
          </div>
          {service ? (
            <BriefBuilder service={service} onPatch={(patch) => update((t) => Object.assign(t.services.find((s) => s.id === service.id)!, patch))} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Add a service in step one first.</p>
          )}
        </div>
      )}

      {tab === "assets" && <AssetsPane draft={draft} update={update} />}
      {tab === "review" && <ReviewPane draft={draft} update={update} />}

      <ConfirmDialog
        open={confirmDrop}
        onOpenChange={setConfirmDrop}
        title="Throw the draft away?"
        description="Everything saved but not published goes, and the editor starts again from the form people are using. That form is not affected either way."
        confirmLabel="Throw it away"
        destructive
        onConfirm={async () => {
          await onDiscardDraft();
          setDraft(clone(live));
          setSaved(clone(live));
          setEditingService(live.services[0]?.id ?? null);
        }}
      />
      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title="Publish this form?"
        description="Every stakeholder gets it straight away, on the portal and the public link. Anyone part-way through a booking finishes on the form they started."
        confirmLabel="Publish"
        onConfirm={() => onPublish(draft)}
      />
    </div>
  );
}

// ---- step one --------------------------------------------------------------

function BasicsPane({ form, draft, update, onEditBrief }: { form: BookingFormData; draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void; onEditBrief: (serviceId: string) => void }) {
  const previewRequest = React.useMemo(() => emptyBookingRequest(), []);
  const missing = missingStandardKeys(draft);

  return (
    <div className="space-y-5">
      <div className="space-y-1 rounded-xl border border-dashed border-border p-4">
        <TextBox value={draft.basics.title} onChange={(v) => update((t) => (t.basics.title = v))} ariaLabel="Step one title" placeholder="What this step is called" className="text-[15px] font-semibold tracking-tight" testId="editor-basics-title" />
        <TextBox value={draft.basics.hint ?? ""} onChange={(v) => update((t) => (t.basics.hint = v || null))} ariaLabel="Step one hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {draft.basics.fields.map((field, i) => (
          <StandardFieldEditor
            key={field.id}
            field={field}
            form={form}
            previewRequest={previewRequest}
            first={i === 0}
            last={i === draft.basics.fields.length - 1}
            onPatch={(patch) => update((t) => Object.assign(t.basics.fields.find((f) => f.id === field.id)!, patch))}
            onMove={(by) => update((t) => move(t.basics.fields, i, by))}
            onRemove={() => update((t) => (t.basics.fields = t.basics.fields.filter((f) => f.id !== field.id)))}
          />
        ))}
      </div>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs text-muted-foreground">Also ask for:</span>
          {missing.map((key) => (
            <Button key={key} type="button" variant="outline" size="sm" onClick={() => update((t) => t.basics.fields.push(newStandardField(key)))} data-testid={`editor-add-standard-${key}`}>
              <Plus /> {BOOKING_STANDARD_KEY_LABELS[key]}
            </Button>
          ))}
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
        <div className="space-y-1">
          <TextBox value={draft.basics.serviceLabel} onChange={(v) => update((t) => (t.basics.serviceLabel = v))} ariaLabel="Service question" placeholder="What kind of work is this?" className="text-[13px] font-medium" testId="editor-service-label" />
          <TextBox value={draft.basics.serviceHint ?? ""} onChange={(v) => update((t) => (t.basics.serviceHint = v || null))} ariaLabel="Service hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" />
        </div>
        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          Each service opens its own second step. Removing one does not touch the bookings already made under it.
        </p>
        <div className="space-y-3">
          {draft.services.map((service, i) => (
            <ServiceEditor
              key={service.id}
              service={service}
              form={form}
              first={i === 0}
              last={i === draft.services.length - 1}
              only={draft.services.length === 1}
              onPatch={(patch) => update((t) => Object.assign(t.services.find((s) => s.id === service.id)!, patch))}
              onMove={(by) => update((t) => move(t.services, i, by))}
              onDuplicate={() =>
                update((t) => {
                  const copy = { ...clone(service), id: newServiceType(service.name).id, name: `${service.name} copy` };
                  t.services.splice(i + 1, 0, copy);
                })
              }
              onRemove={() => update((t) => (t.services = t.services.filter((s) => s.id !== service.id)))}
              onEditBrief={() => onEditBrief(service.id)}
            />
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => update((t) => t.services.push(newServiceType("New service")))} data-testid="editor-add-service">
          <Plus /> Add a service
        </Button>
      </div>
    </div>
  );
}

function StandardFieldEditor({
  field,
  form,
  previewRequest,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  field: BookingStandardField;
  form: BookingFormData;
  previewRequest: ReturnType<typeof emptyBookingRequest>;
  first: boolean;
  last: boolean;
  onPatch: (patch: Partial<BookingStandardField>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const locked = isLockedStandardKey(field.key);
  return (
    <div className={cn("space-y-2.5 rounded-lg border border-border/70 bg-surface/40 p-3", field.width === "full" && "sm:col-span-2")} data-testid={`editor-field-${field.id}`}>
      <div className="flex items-center gap-2">
        <TextBox value={field.label} onChange={(v) => onPatch({ label: v })} ariaLabel="Question label" placeholder="Question" className="min-w-0 flex-1 text-[13px] font-medium" testId={`editor-field-label-${field.id}`} />
        <div className="flex shrink-0 items-center gap-0.5">
          <Handle label={field.width === "full" ? "Make it half width" : "Make it full width"} onClick={() => onPatch({ width: field.width === "full" ? "half" : "full" })} testId={`editor-field-width-${field.id}`}>
            {field.width === "full" ? <Columns2 /> : <RectangleHorizontal />}
          </Handle>
          <Handle label="Move up" onClick={() => onMove(-1)} disabled={first}>
            <ArrowUp />
          </Handle>
          <Handle label="Move down" onClick={() => onMove(1)} disabled={last}>
            <ArrowDown />
          </Handle>
          <Handle label={locked ? "The form cannot do without this question" : "Remove question"} onClick={onRemove} disabled={locked} testId={`editor-remove-field-${field.id}`}>
            <Trash2 />
          </Handle>
        </div>
      </div>

      <div className="pointer-events-none opacity-70" aria-hidden>
        <StandardField field={field} form={form} draft={previewRequest} onChange={() => {}} preview hideLabel />
      </div>

      {(field.key === "requesterName" || field.key === "requesterEmail") && (
        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          Skipped for anyone signed in, or whose browser remembers them — the booking still carries their name.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-2xs text-muted-foreground">
        <Badge variant="muted" className="shrink-0" title={locked ? "The form cannot do without this question" : undefined}>
          {locked && <Lock className="size-2.5" />}
          {BOOKING_STANDARD_KEY_LABELS[field.key]}
        </Badge>
        <label className="flex items-center gap-1.5">
          <Switch size="sm" checked={field.required} disabled={locked} onCheckedChange={(on) => onPatch({ required: on })} data-testid={`editor-field-required-${field.id}`} />
          Required
        </label>
        <label className="flex items-center gap-1.5">
          Shown
          <Select value={field.hintMode} onValueChange={(v) => onPatch({ hintMode: v as BookingHintMode })} disabled={!field.description?.trim()}>
            <SelectTrigger className="h-7 w-auto gap-1 px-2 text-2xs" aria-label="Where the description is shown" data-testid={`editor-field-hintmode-${field.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOKING_HINT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode} disabled={mode === "placeholder" && !FIELD_HAS_PLACEHOLDER.includes(field.key)}>
                  {BOOKING_HINT_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>
      <TextBox
        value={field.description ?? ""}
        onChange={(v) => onPatch({ description: v || null })}
        ariaLabel="Description"
        placeholder="Explain it, give an example (optional)"
        className="text-2xs text-muted-foreground"
        testId={`editor-field-description-${field.id}`}
      />
    </div>
  );
}

/** Standard questions with a box a placeholder could sit in. */
const FIELD_HAS_PLACEHOLDER: BookingStandardKey[] = ["requesterName", "requesterEmail", "department", "title", "priority"];

function ServiceEditor({
  service,
  form,
  first,
  last,
  only,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onEditBrief,
}: {
  service: BookingServiceType;
  form: BookingFormData;
  first: boolean;
  last: boolean;
  only: boolean;
  onPatch: (patch: Partial<BookingServiceType>) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onEditBrief: () => void;
}) {
  const [subText, setSubText] = React.useState(() => optionsToText(service.subServices));
  const colors = colorClasses(service.color);
  const questions = service.blocks.filter((b) => b.kind !== "separator" && b.kind !== "text").length;
  return (
    <div className="space-y-2.5 rounded-lg border border-border/70 bg-card p-3 shadow-xs" data-testid={`editor-service-${slug(service.name)}`}>
      <div className="flex items-start gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label={`Look of ${service.name}`} className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-transform hover:scale-105", colors.soft)} data-testid={`editor-service-look-${slug(service.name)}`}>
              <DynamicIcon name={service.icon} className={cn("size-4", colors.text)} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 space-y-3 p-3">
            <ColorPicker value={service.color} onChange={(color) => onPatch({ color: color as ColorToken })} />
            <div className="scrollbar-thin max-h-52 overflow-y-auto">
              <IconPicker value={service.icon} onChange={(icon) => onPatch({ icon })} />
            </div>
          </PopoverContent>
        </Popover>
        <div className="min-w-0 flex-1 space-y-0.5">
          <TextBox value={service.name} onChange={(v) => onPatch({ name: v })} ariaLabel="Service name" placeholder="Service name" className="text-[13px] font-semibold" testId={`editor-service-name-${slug(service.name)}`} />
          <TextBox value={service.description ?? ""} onChange={(v) => onPatch({ description: v || null })} ariaLabel="Service description" placeholder="A line describing it (optional)" className="text-2xs text-muted-foreground" />
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Handle label="Move up" onClick={() => onMove(-1)} disabled={first}>
            <ArrowUp />
          </Handle>
          <Handle label="Move down" onClick={() => onMove(1)} disabled={last}>
            <ArrowDown />
          </Handle>
          <Handle label="Duplicate this service" onClick={onDuplicate} testId={`editor-service-copy-${slug(service.name)}`}>
            <Copy />
          </Handle>
          <Handle label={only ? "The form needs at least one service" : "Remove this service"} onClick={onRemove} disabled={only} testId={`editor-service-remove-${slug(service.name)}`}>
            <Trash2 />
          </Handle>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-2xs text-muted-foreground">
          Sub-services (chips, multi-select)
          <TextBox
            value={subText}
            onChange={(v) => {
              setSubText(v);
              onPatch({ subServices: parseOptions(v, service.subServices) });
            }}
            ariaLabel={`Sub-services of ${service.name}`}
            placeholder="Approval, Print, Digital / Social"
            className="text-2xs text-foreground"
            testId={`editor-service-subs-${slug(service.name)}`}
          />
        </label>
        <label className="grid gap-1 text-2xs text-muted-foreground">
          Bookings go to
          <Select value={service.teamId ?? ALLOCATION_TEAM} onValueChange={(v) => onPatch({ teamId: v === ALLOCATION_TEAM ? null : v })}>
            <SelectTrigger className="h-8 text-2xs" aria-label={`Which team takes ${service.name}`} data-testid={`editor-service-team-${slug(service.name)}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLOCATION_TEAM}>Task Allocation (a manager places them)</SelectItem>
              {form.teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  <span className="flex items-center gap-2">
                    <DynamicIcon name={team.icon} className={cn("size-3.5", colorClasses(team.color).text)} />
                    {team.name}
                    {team.boardName && <span className="text-muted-foreground">· {team.boardName}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEditBrief} data-testid={`editor-service-brief-${slug(service.name)}`}>
          <Shapes /> {questions === 0 ? "Build its questions" : questions === 1 ? "Edit its 1 question" : `Edit its ${questions} questions`}
        </Button>
      </div>
    </div>
  );
}

// ---- steps three and four ---------------------------------------------------

function AssetsPane({ draft, update }: { draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void }) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-[13px]">
        <Switch size="sm" checked={draft.assets.enabled} onCheckedChange={(on) => update((t) => (t.assets.enabled = on))} data-testid="editor-assets-toggle" />
        <Boxes className={cn("size-3.5 shrink-0 text-muted-foreground", !draft.assets.enabled && "opacity-50")} aria-hidden />
        {draft.assets.enabled ? "This step is shown" : "This step is skipped altogether"}
      </label>

      <div className={cn("space-y-3 rounded-xl border border-dashed border-border p-4", !draft.assets.enabled && "pointer-events-none opacity-50")}>
        <TextBox value={draft.assets.title} onChange={(v) => update((t) => (t.assets.title = v))} ariaLabel="Deliverables title" placeholder="What this step is called" className="text-[15px] font-semibold tracking-tight" testId="editor-assets-title" />
        <TextBox value={draft.assets.hint} onChange={(v) => update((t) => (t.assets.hint = v))} ariaLabel="Deliverables hint" placeholder="Explain what to list here (optional)" className="text-[13px] text-muted-foreground" multiline />
        <p className="flex items-start gap-1.5 text-2xs text-muted-foreground">
          <Info className="mt-px size-3 shrink-0" aria-hidden />
          Nothing on this step is ever required — a stakeholder can always skip it.
        </p>

        <label className="flex items-center gap-2 text-[13px]">
          <Switch size="sm" checked={draft.assets.askAssetTypes} onCheckedChange={(on) => update((t) => (t.assets.askAssetTypes = on))} data-testid="editor-assets-types-toggle" />
          Ask what kinds of asset these are
        </label>
        {draft.assets.askAssetTypes && (
          <TextBox value={draft.assets.assetTypesLabel} onChange={(v) => update((t) => (t.assets.assetTypesLabel = v))} ariaLabel="Asset types label" placeholder="Asset type" className="text-[13px] font-medium" testId="editor-assets-types-label" />
        )}

        <label className="flex items-center gap-2 text-[13px]">
          <Switch size="sm" checked={draft.assets.askLink} onCheckedChange={(on) => update((t) => (t.assets.askLink = on))} data-testid="editor-assets-link-toggle" />
          Offer a link instead of a list
        </label>
        {draft.assets.askLink && (
          <div className="space-y-1">
            <TextBox value={draft.assets.linkLabel} onChange={(v) => update((t) => (t.assets.linkLabel = v))} ariaLabel="Link label" placeholder="Already have the list somewhere?" className="text-[13px] font-medium" testId="editor-assets-link-label" />
            <TextBox value={draft.assets.linkHint ?? ""} onChange={(v) => update((t) => (t.assets.linkHint = v || null))} ariaLabel="Link hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewPane({ draft, update }: { draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-xl border border-dashed border-border p-4">
        <TextBox value={draft.review.title} onChange={(v) => update((t) => (t.review.title = v))} ariaLabel="Recap title" placeholder="What this step is called" className="text-[15px] font-semibold tracking-tight" testId="editor-review-title" />
        <TextBox value={draft.review.hint ?? ""} onChange={(v) => update((t) => (t.review.hint = v || null))} ariaLabel="Recap hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" />
      </div>

      <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
        <p className="flex items-center gap-1.5 text-[13px] font-medium">
          <MessageSquareQuote className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> The reply on the ticket
        </p>
        <p className="text-2xs text-muted-foreground">Shown with the reference once a booking is in. Say what happens next and how long it usually takes.</p>
        <TextBox
          value={draft.review.autoReply}
          onChange={(v) => update((t) => (t.review.autoReply = v))}
          ariaLabel="Automatic reply"
          placeholder="Thanks — we have your request…"
          className="text-[13px]"
          multiline
          rows={4}
          testId="editor-auto-reply"
        />
      </div>

      {/* The bar as a stakeholder meets it. Only the two words are yours to set;
          the rest is here so the row is not a surprise. */}
      <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <TextBox value={draft.review.submitNote} onChange={(v) => update((t) => (t.review.submitNote = v))} ariaLabel="Note beside the submit button" placeholder="Small print beside the button (optional)" className="flex-1 text-2xs text-muted-foreground" />
        <TextBox value={draft.review.submitLabel} onChange={(v) => update((t) => (t.review.submitLabel = v))} ariaLabel="Submit button label" className="h-10 rounded-lg bg-primary px-4.5 text-center text-sm font-medium text-primary-foreground sm:min-w-44" testId="editor-submit-label" />
      </div>
    </div>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function move<T>(list: T[], index: number, by: -1 | 1): void {
  const target = index + by;
  if (index < 0 || target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item!);
}

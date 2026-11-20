"use client";

import { Boxes, Check, ChevronDown, CircleCheck, Copy, Eye, Link2, LoaderCircle, MessageSquareQuote, Palette, Plus, Rocket, Save, SkipForward, Split, Trash2, Undo2, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { ColorPicker } from "@/components/shared/color-picker";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { IconPicker } from "@/components/shared/icon-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BookingBlock, BookingForm as BookingFormData, BookingFormTemplate, BookingSavedBlock, BookingServiceType, BookingStandardField, BookingStandardKey, BookingTemplate, ColorToken } from "@/domain";
import {
  BOOKING_STANDARD_KEY_LABELS,
  defaultBookingFormTemplate,
  isQuestionBlock,
  isRequesterKey,
  newServiceType,
  newStandardField,
  normaliseWorkTypes,
  syncFormWorkTypes,
  type TagOption,
} from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { bookingFormTemplateSchema, normaliseBookingTemplate } from "@/services/booking";
import { AssetList, AssetTypePicker, Chip, ChipGroup, SPAN, ServiceCardShell, StandardField, slug } from "../booking-fields";
import { emptyBookingRequest } from "@/services/booking";
import { BriefBuilder } from "./brief-builder";
import { PreviewDialog } from "./preview-dialog";
import { RoutingDialog } from "./routing-dialog";
import { PastFormsButton, PublishDialog, PublishedFormCard, type PublishedFormInfo } from "./published-form";
import { DragHandle, EDITOR_HOVER_OUTLINE, EditorSection, Handle, TextBox } from "./editor-controls";
import { TemplatesPanel } from "./templates-menu";
import Link from "next/link";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { beginUnsavedWork } from "@/lib/unsaved-work";

/**
 * The form editor: four steps, edited in the order a stakeholder meets them.
 *
 * Nothing typed here reaches a stakeholder. The editor works on a draft stored
 * against the workspace — saved, closed and picked up again as often as it
 * takes — and the live form changes only when somebody publishes it. That
 * separation is the point: building a service's brief is an afternoon's work,
 * and for the whole of that afternoon people are still booking.
 *
 * Every control is in plain sight. The first version drew the finished form and
 * kept the handles for hovering; it looked right and edited badly, most of all
 * on the service cards, where a strip of controls floated over whichever card
 * was picked. Now a card is picked and its settings open in a panel underneath.
 */

const ALLOCATION_TEAM = "__allocation__";
/** "Auto-allocation…" in Bookings go to: opens its rules rather than choosing a team. */
const BY_WORK_TYPE = "__by_work_type__";

export interface BookingFormEditorProps {
  form: BookingFormData;
  /** The form stakeholders are being served right now; what "Publish" would replace. */
  live: BookingFormTemplate;
  /** What the editor opens on: the saved draft, or the live form when there is no draft. */
  initial: BookingFormTemplate;
  templates: BookingTemplate[];
  savedBlocks: BookingSavedBlock[];
  publishing: boolean;
  /** After a past form is published again from the published form card: the page refreshes what is live. */
  onRepublished?: () => Promise<void>;
  /** `keepDraft` leaves the saved draft alone: for a template published straight from the list. */
  onPublish: (template: BookingFormTemplate, name: string, options?: { keepDraft?: boolean }) => Promise<void>;
  /** The form stakeholders are using: its name, when it went live, how much it has been booked through. */
  published: Omit<PublishedFormInfo, "template">;
  /** The team's name, which a newly published form is named after unless someone types another. */
  teamName: string;
  onDiscardDraft: () => Promise<void>;
  /** Leaves the editor, where the page has somewhere to go. */
  onClose?: () => void;
  onSaveTemplate: (input: { name: string; description: string | null; template: BookingFormTemplate }) => Promise<void>;
  onDeleteTemplate: (template: BookingTemplate) => Promise<void>;
  onSaveBlock: (input: { name: string; block: BookingBlock }) => Promise<void>;
  onDeleteSavedBlock: (saved: BookingSavedBlock) => Promise<void>;
  /** Where the editing controls go. Given one, they sit beside the form rather than above it. */
  panelContainer?: HTMLElement | null;
}

const STEP_TABS = [
  { key: "basics", label: "Essentials" },
  { key: "brief", label: "Brief" },
  { key: "assets", label: "Assets" },
  { key: "review", label: "Confirm" },
] as const;

type StepTab = (typeof STEP_TABS)[number]["key"];

export function BookingFormEditor({
  form,
  live,
  initial,
  templates,
  savedBlocks,
  publishing,
  onRepublished,
  onPublish,
  published,
  teamName,
  onDiscardDraft,
  onClose,
  onSaveTemplate,
  onDeleteTemplate,
  onSaveBlock,
  onDeleteSavedBlock,
  panelContainer,
}: BookingFormEditorProps) {
  const ws = useWorkspace();
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
  /** The service picked on step one and open on step two: one choice, both places. */
  const [selectedService, setSelectedService] = React.useState<string | null>(() => initial.services[0]?.id ?? null);
  const [removingService, setRemovingService] = React.useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = React.useState(false);
  // Which form the preview runs: the draft being edited, or the one people are booking through.
  const [previewing, setPreviewing] = React.useState<"draft" | "live" | null>(null);
  const [confirmPublish, setConfirmPublish] = React.useState(false);
  /** A saved template on its way to going live straight from the list. */
  /**
   * The template the editor was last filled from, as it was saved, so its slot
   * can be written over in one click. Forgotten when the editor is filled from
   * anywhere else, or when that template is deleted.
   */
  const [fromTemplate, setFromTemplate] = React.useState<{ id: string; name: string; description: string | null; template: BookingFormTemplate } | null>(null);
  const [updatingTemplate, setUpdatingTemplate] = React.useState(false);
  /** A template just saved from the editor, until the list brings it back with its id. */
  const [justSaved, setJustSaved] = React.useState<{ name: string; description: string | null; template: BookingFormTemplate } | null>(null);
  if (justSaved) {
    const found = templates.find((t) => t.name.trim().toLowerCase() === justSaved.name.trim().toLowerCase());
    if (found) {
      setFromTemplate({ id: found.id, name: found.name, description: found.description ?? null, template: justSaved.template });
      setJustSaved(null);
    }
  }

  const check = bookingFormTemplateSchema.safeParse(draft);
  const problem = check.success ? null : (check.error.issues[0]?.message ?? "Something in the form is not right yet");
  // Three things can differ, and each has its own button. What is on screen
  // against what was last saved says whether there is anything to save; what is
  // on screen against what is live says whether there is anything to publish;
  // and what was last saved against what is live says whether a draft is
  // sitting there waiting, which is the one worth offering to throw away.
  // Each compared as it would be stored: a publish hands back the form in the
  // schema's key order with its defaults filled in, and a form that differs from
  // what is on screen only in that way is the same form.
  const draftKey = React.useMemo(() => formKey(draft), [draft]);
  const savedKey = React.useMemo(() => formKey(saved), [saved]);
  const liveKey = React.useMemo(() => formKey(live), [live]);
  const savedHere = draftKey === savedKey;
  // Still in the list: a template deleted since it was loaded has no slot to write back to.
  const template = fromTemplate && templates.some((t) => t.id === fromTemplate.id) ? fromTemplate : null;
  const templateChanged = !!template && draftKey !== formKey(template.template);
  const matchesLive = draftKey === liveKey;
  const draftWaiting = savedKey !== liveKey;
  // Changes that are neither saved as the draft nor live would be lost by a
  // refresh (the new-version card's included) or by leaving the page, so while
  // there are any the browser asks first. Several people edit this form.
  const unsaved = !savedHere && !matchesLive;
  React.useEffect(() => (unsaved ? beginUnsavedWork() : undefined), [unsaved]);

  // The live form changed under the editor (a past form published again, or
  // someone else publishing): an editor that held the old live form and
  // nothing else moves to the new one; one holding changes keeps them.
  const [lastLive, setLastLive] = React.useState(liveKey);
  if (lastLive !== liveKey) {
    setLastLive(liveKey);
    if (draftKey === lastLive) {
      setDraft(clone(live));
      setSaved(clone(live));
      setFromTemplate(null);
      setSelectedService(live.services[0]?.id ?? null);
    }
  }

  const update = (fn: (t: BookingFormTemplate) => void) =>
    setDraft((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });

  const service = draft.services.find((s) => s.id === selectedService) ?? draft.services[0] ?? null;
  const removing = draft.services.find((s) => s.id === removingService) ?? null;
  const patchService = (id: string, patch: Partial<BookingServiceType>) => update((t) => Object.assign(t.services.find((x) => x.id === id)!, patch));
  const addService = () => {
    const fresh = newServiceType("New service");
    update((t) => t.services.push(fresh));
    setSelectedService(fresh.id);
  };
  const duplicateService = (id: string) =>
    update((t) => {
      const at = t.services.findIndex((x) => x.id === id);
      const source = t.services[at]!;
      const copy = { ...clone(source), id: newServiceType(source.name).id, name: `${source.name} copy` };
      t.services.splice(at + 1, 0, copy);
      setSelectedService(copy.id);
    });
  const removeService = (id: string) => {
    update((t) => (t.services = t.services.filter((x) => x.id !== id)));
    if (selectedService === id) setSelectedService(draft.services.find((x) => x.id !== id)?.id ?? null);
  };

  // The controls: beside the form when the page offers a place for them, above it otherwise.
  const panel = (
    <div className="space-y-3">
      <section className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-xs" data-testid="booking-editor-panel">
        <PublishedFormCard info={{ ...published, template: live }} onOpen={() => setPreviewing("live")} />
        {problem && (
          <p className="text-2xs text-destructive" role="alert" data-testid="booking-editor-problem">
            {problem}
          </p>
        )}
        <div className="grid gap-2">
          <Button type="button" onClick={() => setConfirmPublish(true)} disabled={publishing || !check.success || matchesLive} title={problem ?? undefined} data-testid="booking-editor-publish">
            {/* Says so when there is nothing to publish: what is on screen is what people get. */}
            {publishing ? <LoaderCircle className="animate-spin" /> : matchesLive ? <CircleCheck /> : <Rocket />} {matchesLive ? "Already published" : "Publish current form"}
          </Button>
          {/* The draft, run as the real thing. Nothing it does is sent or kept. */}
          <Button type="button" variant="outline" onClick={() => setPreviewing("draft")} disabled={!check.success} title={problem ?? undefined} data-testid="booking-editor-preview">
            <Eye /> Preview the form
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(clone(saved))} disabled={savedHere || publishing} data-testid="booking-editor-revert">
              <Undo2 /> Undo changes
            </Button>
            {onRepublished && <PastFormsButton onRepublished={onRepublished} className="ml-auto" />}
            {onClose && (
              <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={publishing} data-testid="booking-editor-close">
                Done
              </Button>
            )}
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
      </section>
      {/* Saved forms, in their own panel: what the editor was filled from, and the ways to fill it. */}
      <TemplatesPanel
        templates={templates}
        current={draft}
        onLoad={(t) => {
          // A saved form may name work types since renamed or removed: it comes in as the work types stand now.
          setDraft(clone(syncFormWorkTypes(t.template, normaliseWorkTypes(ws.workspace.workTypes).workTypes)));
          setFromTemplate({ id: t.id, name: t.name, description: t.description ?? null, template: clone(t.template) });
          setSelectedService(t.template.services[0]?.id ?? null);
          toast.success(`Loaded “${t.name}”`, { description: "Nothing is live until you publish it." });
        }}
        onSaveTemplate={async (input) => {
          await onSaveTemplate(input);
          // Saved from here, the editor is now that template's: the picker names it and reload goes back to it.
          setJustSaved({ name: input.name, description: input.description, template: clone(input.template) });
        }}
        onDeleteTemplate={onDeleteTemplate}
        onReset={() => {
          const fresh = defaultBookingFormTemplate();
          setDraft(fresh);
          setFromTemplate(null);
          setSelectedService(fresh.services[0]?.id ?? null);
        }}
        onLoadLive={() => {
          setDraft(clone(live));
          setFromTemplate(null);
          setSelectedService(live.services[0]?.id ?? null);
          toast.success("Loaded the published form");
        }}
        showingLive={matchesLive}
        loadedId={template?.id ?? null}
        loadedChanged={templateChanged}
      >
        {template && (
          // The picker above names the template; this is the way back into it.
          <div data-testid="booking-editor-loaded-template">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full min-w-0"
              disabled={!templateChanged || updatingTemplate || !check.success}
              title={templateChanged ? `Overwrite the template “${template.name}” with the form as it is now` : `Matches the template “${template.name}”`}
              onClick={async () => {
                setUpdatingTemplate(true);
                try {
                  await onSaveTemplate({ name: template.name, description: template.description, template: draft });
                  setFromTemplate({ ...template, template: clone(draft) });
                  toast.success(`Template “${template.name}” updated`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not update the template");
                } finally {
                  setUpdatingTemplate(false);
                }
              }}
              data-testid="booking-editor-update-template"
    >
              {updatingTemplate ? <LoaderCircle className="animate-spin" /> : <Save />}
              <span className="min-w-0 truncate">{templateChanged ? `Update “${template.name}”` : `“${template.name}” saved`}</span>
            </Button>
          </div>
        )}
      </TemplatesPanel>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="booking-editor">
      {panelContainer ? createPortal(panel, panelContainer) : panel}

      {/* Pinned, like the bar it stands for: a form long enough to scroll is
          exactly when knowing which step is open matters. The four steps
          across the whole width, numbered, the open one raised with its
          number in red: the strongest row on the page, so the service tabs
          under it on step two read as part of the step, not a second level
          of the same thing. */}
      <div className="sticky top-0 z-10 flex pt-1 pb-1 before:absolute before:-inset-x-10 before:-top-8 before:bottom-0 before:-z-10 before:bg-card">
        <div role="tablist" aria-label="The steps of the form" className="grid w-full grid-cols-2 gap-1 rounded-xl border border-border/70 bg-surface p-1 sm:grid-cols-4">
          {STEP_TABS.map(({ key, label }, index) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(key)}
                className={cn(
                  "flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring/50",
                  active ? "bg-card text-foreground shadow-sm ring-1 ring-border/80" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )}
                data-testid={`editor-tab-${key}`}
              >
                <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{index + 1}</span>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "basics" && (
        <BasicsPane
          form={form}
          draft={draft}
          update={update}
          selected={service?.id ?? null}
          onSelect={setSelectedService}
          onAddService={addService}
          onDuplicateService={duplicateService}
          onRemoveService={setRemovingService}
        />
      )}

      {tab === "brief" && (
        <div className="space-y-4">
          {/* One tab per service, in the same dress as the steps above: the
              brief branches here, and a row of tabs is what branching looks
              like. Adding and removing a service is offered here as well as on
              step one, because this is where the question "does Web need its
              own brief?" is actually asked. */}
          {/* Which service's brief is open: a picker rather than a row of tabs,
              which outgrew its line once a form had a few services with real
              names. The list adds and removes services too; removing asks first. */}
          {service && (
            <ServicePicker
              services={draft.services}
              selected={service}
              onSelect={setSelectedService}
              onAdd={addService}
              onRemove={(id) => setRemovingService(id)}
            />
          )}

          {service ? (
            <BriefBuilder service={service} onPatch={(patch) => patchService(service.id, patch)} savedBlocks={savedBlocks} onSaveBlock={onSaveBlock} onDeleteSavedBlock={onDeleteSavedBlock} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Add a service first.</p>
          )}
        </div>
      )}

      {tab === "assets" && <AssetsPane form={form} draft={draft} update={update} />}
      {tab === "review" && <ReviewPane draft={draft} update={update} />}

      <PreviewDialog open={previewing !== null} onOpenChange={(open) => !open && setPreviewing(null)} form={form} template={previewing === "live" ? live : draft} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemovingService(null)}
        title={`Remove ${removing?.name || "this service"}?`}
        description={
          removing
            ? `Its ${removing.blocks.filter(isQuestionBlock).length === 1 ? "one question goes" : `${removing.blocks.filter(isQuestionBlock).length} questions go`} with it, and it leaves the form once you publish. Nothing already booked is touched.`
            : ""
        }
        confirmLabel="Remove service"
        destructive
        onConfirm={() => {
          if (removing) removeService(removing.id);
          setRemovingService(null);
        }}
      />
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
          setSelectedService(live.services[0]?.id ?? null);
        }}
      />
      <PublishDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        teamName={teamName}
        // What is live now is what was saved: publishing clears the draft.
        onPublish={(name) => onPublish(draft, name).then(() => setSaved(clone(draft)))}
      />
    </div>
  );
}

// ---- step one --------------------------------------------------------------

function BasicsPane({
  form,
  draft,
  update,
  selected,
  onSelect,
  onAddService,
  onDuplicateService,
  onRemoveService,
}: {
  form: BookingFormData;
  draft: BookingFormTemplate;
  update: (fn: (t: BookingFormTemplate) => void) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  onAddService: () => void;
  onDuplicateService: (id: string) => void;
  onRemoveService: (id: string) => void;
}) {
  const previewRequest = React.useMemo(() => emptyBookingRequest(), []);
  // The three about the requester are one block; everything else on this step
  // is a question in its own right.
  const requester = draft.basics.fields.filter((f) => isRequesterKey(f.key));
  const rest = draft.basics.fields.filter((f) => !isRequesterKey(f.key));
  const patchField = (id: string, patch: Partial<BookingStandardField>) => update((t) => Object.assign(t.basics.fields.find((f) => f.id === id)!, patch));
  const shown = draft.services.find((s) => s.id === selected) ?? draft.services[0] ?? null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onServiceDrag = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    update((t) => {
      const from = t.services.findIndex((x) => x.id === active.id);
      const to = t.services.findIndex((x) => x.id === over.id);
      if (from >= 0 && to >= 0) t.services = arrayMove(t.services, from, to);
    });
  };

  return (
    <div className="space-y-5">
      <EditorSection title="Heading of this step" testId="editor-basics-heading" hoverOutline>
        <TextBox value={draft.basics.title ?? ""} onChange={(v) => update((t) => (t.basics.title = v || null))} ariaLabel="Step one title" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-basics-title" />
        <TextBox value={draft.basics.hint ?? ""} onChange={(v) => update((t) => (t.basics.hint = v || null))} ariaLabel="Step one hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-basics-hint" />
      </EditorSection>

      {/* Who is asking: one block, three boxes, nothing to explain and nothing
          to turn off. Only its wording is anybody's to change. */}
      {requester.length > 0 && (
        <EditorSection hoverOutline title="Who is asking" aside={<span className="text-2xs text-muted-foreground">Always asked, always required</span>} testId="editor-requester-block">
          <div className="grid gap-3 sm:grid-cols-3">
            {requester.map((field) => (
              <div key={field.id} className="min-w-0 grid gap-1.5">
                <TextBox value={field.label} onChange={(v) => patchField(field.id, { label: v })} ariaLabel={`Label for ${BOOKING_STANDARD_KEY_LABELS[field.key]}`} placeholder="Question" className="text-[13px] font-medium" testId={`editor-field-label-${field.id}`} />
                <div className="pointer-events-none" aria-hidden>
                  <StandardField field={field} form={form} draft={previewRequest} onChange={() => {}} preview hideLabel />
                </div>
              </div>
            ))}
          </div>
          <p className="text-2xs text-muted-foreground">Filled in from the account of anyone signed in, and still theirs to change.</p>
        </EditorSection>
      )}

      {/* The rest of the step, as it lays them out: same six columns, same
          widths. Not reorderable: there are a handful of them, they are the
          same handful on every workspace's form, and the order they are asked
          in is the order they make sense in. Their words are another matter. */}
      <EditorSection
        hoverOutline
        title="About the request"
        aside={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
            <span>Also ask</span>
            {OPTIONAL_KEYS.map((key) => {
              const on = draft.basics.fields.some((f) => f.key === key);
              return (
                <label key={key} className="flex items-center gap-1.5">
                  <Switch
                    size="sm"
                    checked={on}
                    // A wrapping <label> does not name this: Radix renders a
                    // button, and `for`/wrapping only label a form control.
                    aria-label={`Also ask for ${BOOKING_STANDARD_KEY_LABELS[key].toLowerCase()}`}
                    onCheckedChange={(next) =>
                      update((t) => {
                        if (next) t.basics.fields.push(newStandardField(key));
                        else t.basics.fields = t.basics.fields.filter((f) => f.key !== key);
                      })
                    }
                    data-testid={`editor-ask-${key}`}
                  />
                  {BOOKING_STANDARD_KEY_LABELS[key]}
                </label>
              );
            })}
          </span>
        }
        testId="editor-request-block"
      >
        <div className="grid gap-2 sm:grid-cols-6">
          {rest.map((field) => (
            <StandardFieldEditor key={field.id} field={field} form={form} previewRequest={previewRequest} onPatch={(patch) => patchField(field.id, patch)} />
          ))}
        </div>
      </EditorSection>

      <EditorSection
        hoverOutline
        title="Kind of work"
        aside={
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={onAddService} data-testid="editor-add-service">
            <Plus /> Add a service
          </Button>
        }
        testId="editor-service-question"
      >
        <TextBox value={draft.basics.serviceLabel} onChange={(v) => update((t) => (t.basics.serviceLabel = v))} ariaLabel="Service question" placeholder="What kind of work is this?" className="text-[13px] font-medium" testId="editor-service-label" />
        <TextBox value={draft.basics.serviceHint ?? ""} onChange={(v) => update((t) => (t.basics.serviceHint = v || null))} ariaLabel="Service hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" testId="editor-service-hint" />

        {/* The chooser as the form shows it. Pick a card and its settings open underneath. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToParentElement]} onDragEnd={onServiceDrag}>
          <SortableContext items={draft.services.map((x) => x.id)} strategy={rectSortingStrategy}>
            {/* The form's own grid: as many to a row as fit at a width that
                holds the name, then another row. Counting columns by the
                window squeezed four into the editor's card and cut the names. */}
            <div className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(min(17rem,100%),1fr))] gap-2" data-testid="editor-services">
              {draft.services.map((s) => (
                <ServiceCard key={s.id} service={s} selected={s.id === shown?.id} onSelect={() => onSelect(s.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {shown && (
          <ServicePanel
            key={shown.id}
            service={shown}
            form={form}
            only={draft.services.length === 1}
            onPatch={(patch) => update((t) => Object.assign(t.services.find((x) => x.id === shown.id)!, patch))}
            onDuplicate={() => onDuplicateService(shown.id)}
            onRemove={() => onRemoveService(shown.id)}
          />
        )}
      </EditorSection>
    </div>
  );
}

/**
 * One of step one's fixed questions.
 *
 * Only its wording is anybody's business: the questions are the same handful
 * on every workspace's form, their order is the order they make sense in, and
 * which of the optional two are asked is a pair of switches in the title bar.
 */
function StandardFieldEditor({ field, form, previewRequest, onPatch }: { field: BookingStandardField; form: BookingFormData; previewRequest: ReturnType<typeof emptyBookingRequest>; onPatch: (patch: Partial<BookingStandardField>) => void }) {
  return (
    <div className={cn("col-span-6 grid min-w-0 gap-1.5", SPAN[field.width])} data-testid={`editor-field-${field.id}`}>
      <span className="flex items-center gap-1">
        <TextBox value={field.label} onChange={(v) => onPatch({ label: v })} ariaLabel={`Label for ${BOOKING_STANDARD_KEY_LABELS[field.key]}`} placeholder="Question" className="min-w-0 flex-1 text-[13px] font-medium" testId={`editor-field-label-${field.id}`} />
        {field.required && (
          <span aria-hidden className="text-primary">
            *
          </span>
        )}
      </span>
      {/* The control itself, inert: it belongs to whoever fills the form in. */}
      <div className="pointer-events-none" aria-hidden>
        <StandardField field={field} form={form} draft={previewRequest} onChange={() => {}} preview hideLabel />
      </div>
    </div>
  );
}

/** The two step one may or may not ask. Everything else on it is fixed. */
const OPTIONAL_KEYS: BookingStandardKey[] = ["priority", "dueDate"];

/** A service on the chooser, exactly as the form draws it, plus a grip to reorder by. */
function ServiceCard({ service, selected, onSelect }: { service: BookingServiceType; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: service.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn("relative min-w-0", isDragging && "z-10 opacity-90")}>
      <ServiceCardShell
        color={service.color}
        icon={service.icon}
        selected={selected}
        onSelect={onSelect}
        testId={`editor-service-${slug(service.name)}`}
        // The sortable wrapper is what the grid stretches; the card fills it, so a row's cards match.
        className="h-full pr-8"
        name={<span className="block break-words">{service.name || "Untitled"}</span>}
        description={service.description ? <span className="text-2xs leading-relaxed text-muted-foreground">{service.description}</span> : undefined}
        chrome={<DragHandle label={`Reorder ${service.name}`} testId={`editor-service-drag-${slug(service.name)}`} setRef={setActivatorNodeRef} listeners={listeners} attributes={attributes} className="absolute top-2 right-1.5" />}
      />
    </div>
  );
}

/** A labelled control in the service panel. */
function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="label-quiet">{label}</span>
      {children}
    </div>
  );
}

/** The settings of the picked service: its words, its look, where it goes, and the work types it offers. */
function ServicePanel({
  service,
  form,
  only,
  onPatch,
  onDuplicate,
  onRemove,
}: {
  service: BookingServiceType;
  form: BookingFormData;
  only: boolean;
  onPatch: (patch: Partial<BookingServiceType>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const ws = useWorkspace();
  const [routingOpen, setRoutingOpen] = React.useState(false);
  const byWorkType = !!service.routing?.enabled;
  const allocationBoard = ws.boards.find((b) => b.system === "TASK_ALLOCATION") ?? null;
  const key = slug(service.name);
  return (
    <EditorSection
      className="mt-1 border-foreground/20"
      testId={`editor-service-panel-${key}`}
      title={
        <>
          <DynamicIcon name={service.icon} className={cn("size-3.5", colorClasses(service.color).text)} />
          <span className="truncate">{service.name || "Untitled"}</span>
        </>
      }
      aside={
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" data-testid={`editor-service-look-${key}`}>
                <Palette /> Look
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3 p-3">
              <ColorPicker value={service.color} onChange={(color) => onPatch({ color: color as ColorToken })} />
              <div className="scrollbar-thin max-h-52 overflow-y-auto">
                <IconPicker value={service.icon} onChange={(icon) => onPatch({ icon })} />
              </div>
            </PopoverContent>
          </Popover>
          <Handle label="Duplicate this service" onClick={onDuplicate} testId={`editor-service-copy-${key}`}>
            <Copy />
          </Handle>
          <Handle label={only ? "The form needs at least one service" : "Remove this service"} onClick={onRemove} disabled={only} destructive testId={`editor-service-remove-${key}`}>
            <Trash2 />
          </Handle>
        </>
      }
    >
      <Labeled label="Name">
        <TextBox value={service.name} onChange={(v) => onPatch({ name: v })} ariaLabel="Service name" placeholder="Service name" className="text-[13px] font-semibold" testId={`editor-service-name-${key}`} />
      </Labeled>
      <Labeled label="Description">
        <TextBox value={service.description ?? ""} onChange={(v) => onPatch({ description: v || null })} ariaLabel="Service description" placeholder="A line on the card (optional)" className="text-[13px] text-muted-foreground" testId={`editor-service-description-${key}`} />
      </Labeled>

      <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
        <span className="label-quiet">Work types, asked once this card is picked</span>
        <TextBox value={service.subServiceLabel} onChange={(v) => onPatch({ subServiceLabel: v })} ariaLabel="Work types question" placeholder="Work types" className="text-[13px] font-medium" testId={`editor-service-sublabel-${key}`} />
        <TextBox value={service.subServiceHint ?? ""} onChange={(v) => onPatch({ subServiceHint: v || null })} ariaLabel="Work types hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" />
        <WorkTypeToggles selected={service.subServices} onChange={(subServices) => onPatch({ subServices })} testIdPrefix={`editor-service-worktypes-${key}`} />
      </div>

      {/* Where its bookings land, in one choice: the queue, a team (its own booking board), or rules on the
          work types picked. A line on the left says what it is for; beside it when the box has room. */}
      <section className="@container rounded-lg border border-border/60 bg-surface/40 p-2.5" aria-label="Bookings go to" data-testid={`editor-service-destination-${key}`}>
        <div className="grid items-center gap-2 @md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] @md:gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Bookings go to</p>
            <p className="text-2xs text-muted-foreground">A team&apos;s board, Task Allocation, or auto-allocation by work type.</p>
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Select
                value={byWorkType ? BY_WORK_TYPE : (service.teamId ?? ALLOCATION_TEAM)}
                onValueChange={(v) => {
                  // Rules are set in their own dialog, opened once this menu has closed (or the closing
                  // menu dismisses it); the choice changes only when the rules are saved there.
                  if (v === BY_WORK_TYPE) return void window.setTimeout(() => setRoutingOpen(true), 0);
                  // Back to the queue or a team: the rules are switched off and kept, for next time.
                  onPatch({ teamId: v === ALLOCATION_TEAM ? null : v, ...(service.routing ? { routing: { ...service.routing, enabled: false } } : {}) });
                }}
              >
                <SelectTrigger className="h-9 min-w-0 flex-1 bg-card text-[13px]" aria-label={`Where ${service.name} bookings go`} data-testid={`editor-service-team-${key}`}>
                  {byWorkType ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <Split className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">Auto-allocation</span>
                    </span>
                  ) : (
                    <SelectValue />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALLOCATION_TEAM}>
                    <span className="flex min-w-0 items-center gap-2">
                      <DynamicIcon name={allocationBoard?.icon ?? "Inbox"} className={cn("size-3.5 shrink-0", colorClasses(allocationBoard?.color ?? "red").text)} />
                      <span className="truncate">{allocationBoard?.name ?? "Task Allocation"}</span>
                      <span className="truncate text-muted-foreground">a manager places them</span>
                    </span>
                  </SelectItem>
                  <SelectSeparator />
                  {form.teams.map((team) => {
                    // The board the team nominated in its settings, read live, so a
                    // change there shows here at once. Without one, the team itself.
                    const nominated = ws.boardById(ws.teamById(team.id)?.bookingBoardId ?? null);
                    return (
                      <SelectItem key={team.id} value={team.id}>
                        {nominated ? (
                          <span className="flex min-w-0 items-center gap-2">
                            <DynamicIcon name={nominated.icon} className={cn("size-3.5 shrink-0", colorClasses(nominated.color).text)} />
                            <span className="truncate">{nominated.name}</span>
                            <span className="truncate text-muted-foreground">{team.name}</span>
                          </span>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2">
                            <DynamicIcon name={team.icon} className={cn("size-3.5 shrink-0", colorClasses(team.color).text)} />
                            <span className="truncate">{team.name}</span>
                          </span>
                        )}
                      </SelectItem>
                    );
                  })}
                  <SelectSeparator />
                  <SelectItem value={BY_WORK_TYPE} data-testid={`editor-service-routing-${key}`}>
                    <span className="flex min-w-0 items-center gap-2">
                      <Split className="size-3.5 shrink-0 text-muted-foreground" />
                      Auto-allocation…
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {byWorkType && (
                <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setRoutingOpen(true)} data-testid={`editor-service-routing-edit-${key}`}>
                  Edit rules
                </Button>
              )}
            </div>
          </div>
        </div>
        <RoutingDialog service={service} open={routingOpen} onOpenChange={setRoutingOpen} onSave={({ routing, teamId }) => onPatch({ routing, teamId })} />
      </section>
    </EditorSection>
  );
}

/**
 * The workspace's work types as chips to switch on and off for one service.
 * Nothing else can be offered: the work types are one list, kept in
 * Settings → Asset types, and a rename or removal there reaches every form.
 */
function WorkTypeToggles({ selected, onChange, testIdPrefix }: { selected: readonly TagOption[]; onChange: (next: TagOption[]) => void; testIdPrefix: string }) {
  const ws = useWorkspace();
  const workTypes = React.useMemo(() => normaliseWorkTypes(ws.workspace.workTypes).workTypes, [ws.workspace.workTypes]);
  if (workTypes.length === 0) {
    return (
      <p className="text-2xs text-muted-foreground">
        No work types yet.{" "}
        <Link href={routes.settings(ws.slug, "work-types")} className="font-medium text-foreground underline-offset-2 hover:underline">
          Add them
        </Link>
      </p>
    );
  }
  const chosen = new Set(selected.map((s) => s.name.toLowerCase()));
  // Always in the work types' own order, and only work types that exist: any toggle also clears a stale one.
  const toggle = (name: string) => {
    const key = name.toLowerCase();
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(workTypes.filter((w) => next.has(w.name.toLowerCase())).map((w) => ({ name: w.name, color: w.color })));
  };
  // The booking form's own chips, so an offered work type looks here the way a
  // picked one looks to whoever books.
  return (
    <ChipGroup ariaLabel="Work types offered">
      {workTypes.map((w) => (
        <Chip key={w.id} color={w.color} active={chosen.has(w.name.toLowerCase())} onClick={() => toggle(w.name)} testId={`${testIdPrefix}-${slug(w.name)}`}>
          {w.name}
        </Chip>
      ))}
    </ChipGroup>
  );
}

// ---- steps three and four ---------------------------------------------------

function AssetsPane({ form, draft, update }: { form: BookingFormData; draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void }) {
  const step = draft.assets;
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-[13px]">
        <Switch size="sm" checked={step.enabled} aria-label="Show the deliverables step" onCheckedChange={(on) => update((t) => (t.assets.enabled = on))} data-testid="editor-assets-toggle" />
        <Boxes className={cn("size-3.5 shrink-0 text-muted-foreground", !step.enabled && "opacity-50")} aria-hidden />
        {step.enabled ? "This step is shown" : "This step is skipped altogether"}
      </label>

      <div className={cn("space-y-4", !step.enabled && "pointer-events-none opacity-50")}>
        <EditorSection
          hoverOutline
          title="Heading of this step"
          aside={
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
              <SkipForward className="size-3.5" aria-hidden /> Always skippable
            </span>
          }
          testId="editor-assets-heading"
        >
          <TextBox value={step.title} onChange={(v) => update((t) => (t.assets.title = v))} ariaLabel="Assets title" placeholder="A heading for this step" className="text-[15px] font-semibold tracking-tight" testId="editor-assets-title" />
          <TextBox value={step.hint} onChange={(v) => update((t) => (t.assets.hint = v))} ariaLabel="Assets hint" placeholder="Explain what to list here (optional)" className="text-[13px] text-muted-foreground" multiline testId="editor-assets-hint" />
        </EditorSection>

        {/* Fixed, but a block like the others: outlined under the pointer,
            while the list itself stays inert. */}
        <div className={cn("p-1", EDITOR_HOVER_OUTLINE)} aria-hidden data-testid="editor-assets-list">
          <div className="pointer-events-none">
            <AssetList rows={[]} onChange={() => {}} options={form.assetTypes} preview />
          </div>
        </div>

        <EditorSection
          hoverOutline
          title="Asset types"
          aside={
            <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Switch size="sm" checked={step.askAssetTypes} aria-label="Ask for asset types" onCheckedChange={(on) => update((t) => (t.assets.askAssetTypes = on))} data-testid="editor-assets-types-toggle" />
              Asked
            </label>
          }
          className={cn(!step.askAssetTypes && "opacity-50")}
          testId="editor-assets-types"
        >
          <TextBox value={step.assetTypesLabel} onChange={(v) => update((t) => (t.assets.assetTypesLabel = v))} ariaLabel="Asset types label" placeholder="Asset type" className="text-[13px] font-medium" testId="editor-assets-types-label" />
          <div className="pointer-events-none" aria-hidden>
            <AssetTypePicker options={form.assetTypes} value={[]} onChange={() => {}} disabled />
          </div>
        </EditorSection>

        <EditorSection
          hoverOutline
          title={
            <>
              <Link2 className="size-3" aria-hidden /> A link instead
            </>
          }
          aside={
            <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Switch size="sm" checked={step.askLink} aria-label="Offer a link instead of a list" onCheckedChange={(on) => update((t) => (t.assets.askLink = on))} data-testid="editor-assets-link-toggle" />
              Offered
            </label>
          }
          className={cn(!step.askLink && "opacity-50")}
          testId="editor-assets-link"
        >
          <TextBox value={step.linkLabel} onChange={(v) => update((t) => (t.assets.linkLabel = v))} ariaLabel="Link label" placeholder="Already have the list somewhere?" className="text-[13px] font-medium" testId="editor-assets-link-label" />
          <TextBox value={step.linkHint ?? ""} onChange={(v) => update((t) => (t.assets.linkHint = v || null))} ariaLabel="Link hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" />
          <Input readOnly placeholder="https://" className="pointer-events-none text-muted-foreground/60" tabIndex={-1} aria-hidden />
        </EditorSection>
      </div>
    </div>
  );
}

function ReviewPane({ draft, update }: { draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void }) {
  return (
    <div className="space-y-4">
      <EditorSection title="Heading of this step" testId="editor-review-heading" hoverOutline>
        <TextBox value={draft.review.title ?? ""} onChange={(v) => update((t) => (t.review.title = v || null))} ariaLabel="Recap title" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-review-title" />
        <TextBox value={draft.review.hint ?? ""} onChange={(v) => update((t) => (t.review.hint = v || null))} ariaLabel="Recap hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-review-hint" />
      </EditorSection>

      {/* What the recap looks like: the step's own cards, so the heading above
          is read in the place it will be read. */}
      <div className="space-y-2 select-none" aria-hidden>
        {["The request", "The brief", "Assets"].map((title) => (
          // Fixed, and outlined under the pointer like any other block; only
          // what is inside is dimmed, so the outline is not.
          <section key={title} className={cn("rounded-xl border border-border/60 bg-surface/40 p-3", EDITOR_HOVER_OUTLINE)} data-testid="editor-review-sample">
            <div className="opacity-70">
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight">{title}</h3>
                <span className="text-2xs text-muted-foreground">Change</span>
              </div>
              <p className="text-[13px] text-muted-foreground">What they answered, laid out to be read over.</p>
            </div>
          </section>
        ))}
      </div>

      {/* The bar at the foot of the wizard, as they meet it. */}
      <EditorSection title="The button" testId="editor-review-bar" hoverOutline>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TextBox value={draft.review.submitNote} onChange={(v) => update((t) => (t.review.submitNote = v))} ariaLabel="Note beside the submit button" placeholder="Small print beside the button (optional)" className="flex-1 text-2xs text-muted-foreground" />
          <TextBox value={draft.review.submitLabel} onChange={(v) => update((t) => (t.review.submitLabel = v))} ariaLabel="Submit button label" className="h-10 rounded-lg border-transparent bg-primary px-4.5 text-center text-sm font-medium text-primary-foreground sm:w-44 focus:bg-primary" testId="editor-submit-label" />
        </div>
      </EditorSection>

      {/* And the ticket, which is the last thing anybody sees. */}
      <EditorSection
        hoverOutline
        title={
          <>
            <MessageSquareQuote className="size-3" aria-hidden /> On the ticket
          </>
        }
        testId="editor-review-reply"
      >
        <TextBox value={draft.review.autoReply} onChange={(v) => update((t) => (t.review.autoReply = v))} ariaLabel="Automatic reply" placeholder="Thanks — we have your request…" className="text-[13px]" multiline rows={3} testId="editor-auto-reply" />
        <p className="text-2xs text-muted-foreground">Shown with the ticket once a booking is in. Say what happens next and how long it usually takes.</p>
      </EditorSection>
    </div>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A form as it would be stored; one the schema refuses is compared as it stands. */
function formKey(template: BookingFormTemplate): string {
  try {
    return JSON.stringify(normaliseBookingTemplate(template));
  } catch {
    return JSON.stringify(template);
  }
}


/** The service whose brief is open, picked from a list that can also add one or remove any (with a confirm, outside). */
function ServicePicker({
  services,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  services: BookingServiceType[];
  selected: BookingServiceType;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const questions = (s: BookingServiceType) => s.blocks.filter(isQuestionBlock).length;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-muted-foreground">Brief for</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-12 w-full max-w-xl min-w-0 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-left text-base font-semibold shadow-xs transition-colors hover:border-foreground/30 focus-visible:outline-2 focus-visible:outline-ring sm:w-auto sm:min-w-96"
            aria-label={`Brief for ${selected.name || "Untitled"}. Change service`}
            data-testid="editor-brief-service-picker"
          >
            <DynamicIcon name={selected.icon} className={cn("size-5 shrink-0", colorClasses(selected.color).text)} />
            <span className="min-w-0 flex-1 truncate">{selected.name || "Untitled"}</span>
            <span className="shrink-0 text-[13px] font-normal text-muted-foreground tabular">{questions(selected) === 1 ? "1 question" : `${questions(selected)} questions`}</span>
            <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-80 p-1.5">
          <ul role="listbox" aria-label="Services" className="scrollbar-thin max-h-80 overflow-y-auto">
            {services.map((s) => {
              const active = s.id === selected.id;
              const name = s.name || "Untitled";
              return (
                <li key={s.id} className={cn("flex items-center gap-1 rounded-md pr-1", active && "state-on")}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onSelect(s.id);
                      setOpen(false);
                    }}
                    className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                    data-testid={`editor-brief-service-${slug(s.name)}`}
                  >
                    <DynamicIcon name={s.icon} className={cn("size-4 shrink-0", colorClasses(s.color).text)} />
                    <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular">{questions(s)}</span>
                    {active && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                  {services.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onRemove(s.id);
                      }}
                      aria-label={`Remove ${name}`}
                      title={`Remove ${name}`}
                      className="flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
                      data-testid={`editor-brief-remove-service-${slug(s.name)}`}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-border/60 pt-1">
            <button
              type="button"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
              className="flex h-11 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              data-testid="editor-brief-add-service"
            >
              <Plus className="size-4" /> Add a service
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}


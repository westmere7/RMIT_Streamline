"use client";

import { Boxes, ClipboardList, Copy, Eye, FileCheck2, Info, Link2, ListPlus, LoaderCircle, MessageSquareQuote, Palette, Plus, Rocket, Save, Shapes, SkipForward, Trash2, Undo2 } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BookingBlock, BookingForm as BookingFormData, BookingFormTemplate, BookingSavedBlock, BookingServiceType, BookingStandardField, BookingStandardKey, BookingTemplate, ColorToken } from "@/domain";
import {
  BOOKING_STANDARD_KEY_LABELS,
  defaultBookingFormTemplate,
  isQuestionBlock,
  isRequesterKey,
  newServiceType,
  newStandardField,
  templateQuestionCount,
} from "@/domain";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { bookingFormTemplateSchema } from "@/services/booking";
import { AssetList, AssetTypePicker, SPAN, ServiceCardShell, StandardField, slug } from "../booking-fields";
import { emptyBookingRequest } from "@/services/booking";
import { BriefBuilder } from "./brief-builder";
import { ChoiceChips } from "./choice-chips";
import { PreviewDialog } from "./preview-dialog";
import { DragHandle, EditorSection, Handle, TextBox } from "./editor-controls";
import { TemplatesMenu } from "./templates-menu";

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

export interface BookingFormEditorProps {
  form: BookingFormData;
  /** The form stakeholders are being served right now; what "Publish" would replace. */
  live: BookingFormTemplate;
  /** What the editor opens on: the saved draft, or the live form when there is no draft. */
  initial: BookingFormTemplate;
  templates: BookingTemplate[];
  savedBlocks: BookingSavedBlock[];
  savingDraft: boolean;
  publishing: boolean;
  onSaveDraft: (template: BookingFormTemplate) => Promise<void>;
  onPublish: (template: BookingFormTemplate) => Promise<void>;
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
  { key: "basics", label: "1 · Details", icon: ClipboardList },
  { key: "brief", label: "2 · Brief", icon: ListPlus },
  { key: "assets", label: "3 · Deliverables", icon: Boxes },
  { key: "review", label: "4 · Confirm", icon: FileCheck2 },
] as const;

type StepTab = (typeof STEP_TABS)[number]["key"];

/** The underline tab every tab row of the editor wears, at two heights. */
const TAB_CLASS = "relative -mb-px inline-flex items-center gap-1.5 rounded-t-lg px-3 font-medium transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-[2.5px] after:rounded-full after:bg-transparent";
const tabTone = (active: boolean) => (active ? "text-foreground after:bg-ring" : "text-muted-foreground hover:text-foreground");

export function BookingFormEditor({
  form,
  live,
  initial,
  templates,
  savedBlocks,
  savingDraft,
  publishing,
  onSaveDraft,
  onPublish,
  onDiscardDraft,
  onClose,
  onSaveTemplate,
  onDeleteTemplate,
  onSaveBlock,
  onDeleteSavedBlock,
  panelContainer,
}: BookingFormEditorProps) {
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
  const [previewing, setPreviewing] = React.useState(false);
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
        {/* The draft, run as the real thing. Nothing it does is sent or kept. */}
        <Button type="button" variant="outline" onClick={() => setPreviewing(true)} disabled={!check.success} title={problem ?? undefined} data-testid="booking-editor-preview">
          <Eye /> Preview the form
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(clone(saved))} disabled={savedHere || savingDraft || publishing} data-testid="booking-editor-revert">
            <Undo2 /> Undo changes
          </Button>
          {onClose && (
            <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onClose} disabled={savingDraft || publishing} data-testid="booking-editor-close">
              Done
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TemplatesMenu
            templates={templates}
            current={draft}
            onLoad={(t) => {
              setDraft(clone(t.template));
              setSelectedService(t.template.services[0]?.id ?? null);
              toast.success(`Loaded “${t.name}”`, { description: "Save it as a draft, or publish it, to keep it." });
            }}
            onSaveTemplate={onSaveTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onReset={() => {
              const fresh = defaultBookingFormTemplate();
              setDraft(fresh);
              setSelectedService(fresh.services[0]?.id ?? null);
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

      {/* Pinned, like the bar it stands for: a form long enough to scroll is
          exactly when knowing which step is open matters. A segmented bar,
          unlike the underline tabs the services wear on step two, so the two
          rows never read as one. */}
      <div className="sticky top-0 z-10 flex pt-1 pb-1 before:absolute before:-inset-x-10 before:-top-8 before:bottom-0 before:-z-10 before:bg-card">
        <div role="tablist" aria-label="The steps of the form" className="inline-flex flex-wrap items-center gap-1 rounded-full bg-surface p-1 text-muted-foreground">
          {STEP_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring/50", tab === key ? "bg-card text-foreground shadow-sm" : "")}
              data-testid={`editor-tab-${key}`}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
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
          onEditBrief={(id) => {
            setSelectedService(id);
            setTab("brief");
          }}
        />
      )}

      {tab === "brief" && (
        <div className="space-y-4">
          {/* One tab per service, in the same dress as the steps above: the
              brief branches here, and a row of tabs is what branching looks
              like. Adding and removing a service is offered here as well as on
              step one, because this is where the question "does Web need its
              own brief?" is actually asked. */}
          <div role="tablist" aria-label="Which service's brief" className="flex flex-wrap items-end gap-0.5 border-b border-border/60">
            {draft.services.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={s.id === service?.id} onClick={() => setSelectedService(s.id)} className={cn(TAB_CLASS, "h-8 text-[13px]", tabTone(s.id === service?.id))} data-testid={`editor-brief-service-${slug(s.name)}`}>
                <DynamicIcon name={s.icon} className={cn("size-3.5", s.id === service?.id && colorClasses(s.color).text)} />
                {s.name || "Untitled"}
                <span className="text-2xs text-muted-foreground tabular">{s.blocks.filter(isQuestionBlock).length}</span>
              </button>
            ))}
            <button type="button" onClick={addService} className={cn(TAB_CLASS, "h-8 text-2xs text-muted-foreground hover:text-foreground")} data-testid="editor-brief-add-service">
              <Plus className="size-3.5" /> Add a service
            </button>
            {service && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mb-0.5 ml-auto h-7 text-2xs text-muted-foreground hover:text-destructive"
                onClick={() => setRemovingService(service.id)}
                disabled={draft.services.length === 1}
                title={draft.services.length === 1 ? "The form needs at least one service" : `Remove ${service.name}`}
                data-testid={`editor-brief-remove-service-${slug(service.name)}`}
              >
                <Trash2 /> Remove {service.name || "this service"}
              </Button>
            )}
          </div>

          {service ? (
            <BriefBuilder service={service} onPatch={(patch) => patchService(service.id, patch)} savedBlocks={savedBlocks} onSaveBlock={onSaveBlock} onDeleteSavedBlock={onDeleteSavedBlock} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Add a service first.</p>
          )}
        </div>
      )}

      {tab === "assets" && <AssetsPane form={form} draft={draft} update={update} />}
      {tab === "review" && <ReviewPane draft={draft} update={update} />}

      <PreviewDialog open={previewing} onOpenChange={setPreviewing} form={form} template={draft} />
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

function BasicsPane({
  form,
  draft,
  update,
  selected,
  onSelect,
  onAddService,
  onDuplicateService,
  onRemoveService,
  onEditBrief,
}: {
  form: BookingFormData;
  draft: BookingFormTemplate;
  update: (fn: (t: BookingFormTemplate) => void) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  onAddService: () => void;
  onDuplicateService: (id: string) => void;
  onRemoveService: (id: string) => void;
  onEditBrief: (serviceId: string) => void;
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
      <EditorSection title="Heading of this step" testId="editor-basics-heading">
        <TextBox value={draft.basics.title ?? ""} onChange={(v) => update((t) => (t.basics.title = v || null))} ariaLabel="Step one title" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-basics-title" />
        <TextBox value={draft.basics.hint ?? ""} onChange={(v) => update((t) => (t.basics.hint = v || null))} ariaLabel="Step one hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-basics-hint" />
      </EditorSection>

      {/* Who is asking: one block, three boxes, nothing to explain and nothing
          to turn off. Only its wording is anybody's to change. */}
      {requester.length > 0 && (
        <EditorSection title="Who is asking" aside={<span className="text-2xs text-muted-foreground">Always asked, always required</span>} testId="editor-requester-block">
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
            {/* Four to a row on a wide screen: most workspaces run three or
                four kinds of work, and at three columns the fourth one and the
                "Add a service" card fall onto a second row that is mostly gap. */}
            <div className="mt-1 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-testid="editor-services">
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
            onEditBrief={() => onEditBrief(shown.id)}
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
        className="pr-8"
        name={<span className="block truncate">{service.name || "Untitled"}</span>}
        description={service.description ? <span className="line-clamp-2 text-2xs leading-relaxed text-muted-foreground">{service.description}</span> : undefined}
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

/** The settings of the picked service: its words, its look, where it goes, and its sub-services. */
function ServicePanel({
  service,
  form,
  only,
  onPatch,
  onDuplicate,
  onRemove,
  onEditBrief,
}: {
  service: BookingServiceType;
  form: BookingFormData;
  only: boolean;
  onPatch: (patch: Partial<BookingServiceType>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onEditBrief: () => void;
}) {
  const questions = service.blocks.filter(isQuestionBlock).length;
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
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <Labeled label="Name">
          <TextBox value={service.name} onChange={(v) => onPatch({ name: v })} ariaLabel="Service name" placeholder="Service name" className="text-[13px] font-semibold" testId={`editor-service-name-${key}`} />
        </Labeled>
        <Labeled label="Bookings go to">
          <Select value={service.teamId ?? ALLOCATION_TEAM} onValueChange={(v) => onPatch({ teamId: v === ALLOCATION_TEAM ? null : v })}>
            <SelectTrigger className="h-[30px] text-[13px]" aria-label={`Which team takes ${service.name}`} data-testid={`editor-service-team-${key}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALLOCATION_TEAM}>Task Allocation</SelectItem>
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
        </Labeled>
      </div>
      <Labeled label="Description">
        <TextBox value={service.description ?? ""} onChange={(v) => onPatch({ description: v || null })} ariaLabel="Service description" placeholder="A line on the card (optional)" className="text-[13px] text-muted-foreground" testId={`editor-service-description-${key}`} />
      </Labeled>

      <div className="grid gap-1.5 border-t border-border/60 pt-2.5">
        <span className="label-quiet">Sub-services, asked once this card is picked</span>
        <TextBox value={service.subServiceLabel} onChange={(v) => onPatch({ subServiceLabel: v })} ariaLabel="Sub-service question" placeholder="What does it involve?" className="text-[13px] font-medium" testId={`editor-service-sublabel-${key}`} />
        <TextBox value={service.subServiceHint ?? ""} onChange={(v) => onPatch({ subServiceHint: v || null })} ariaLabel="Sub-service hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" />
        <ChoiceChips options={service.subServices} onChange={(subServices) => onPatch({ subServices })} addLabel="Add a sub-service" testIdPrefix={`editor-service-subs-${key}`} />
      </div>

      <div className="flex justify-end border-t border-border/60 pt-2.5">
        <Button type="button" variant="outline" size="sm" onClick={onEditBrief} data-testid={`editor-service-brief-${key}`}>
          <Shapes /> {questions === 0 ? "Build its questions" : questions === 1 ? "1 question in step two" : `${questions} questions in step two`}
        </Button>
      </div>
    </EditorSection>
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
          title="Heading of this step"
          aside={
            <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
              <SkipForward className="size-3.5" aria-hidden /> Always skippable
            </span>
          }
          testId="editor-assets-heading"
        >
          <TextBox value={step.title} onChange={(v) => update((t) => (t.assets.title = v))} ariaLabel="Deliverables title" placeholder="A heading for this step" className="text-[15px] font-semibold tracking-tight" testId="editor-assets-title" />
          <TextBox value={step.hint} onChange={(v) => update((t) => (t.assets.hint = v))} ariaLabel="Deliverables hint" placeholder="Explain what to list here (optional)" className="text-[13px] text-muted-foreground" multiline testId="editor-assets-hint" />
        </EditorSection>

        <div className="pointer-events-none px-1" aria-hidden>
          <AssetList rows={[]} onChange={() => {}} options={form.assetTypes} preview />
        </div>

        <EditorSection
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
      <EditorSection title="Heading of this step" testId="editor-review-heading">
        <TextBox value={draft.review.title ?? ""} onChange={(v) => update((t) => (t.review.title = v || null))} ariaLabel="Recap title" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-review-title" />
        <TextBox value={draft.review.hint ?? ""} onChange={(v) => update((t) => (t.review.hint = v || null))} ariaLabel="Recap hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-review-hint" />
      </EditorSection>

      {/* What the recap looks like: the step's own cards, so the heading above
          is read in the place it will be read. */}
      <div className="pointer-events-none space-y-2 px-1 opacity-70" aria-hidden>
        {["The request", "The brief", "Deliverables"].map((title) => (
          <section key={title} className="rounded-xl border border-border/60 bg-surface/40 p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight">{title}</h3>
              <span className="text-2xs text-muted-foreground">Change</span>
            </div>
            <p className="text-[13px] text-muted-foreground">What they answered, laid out to be read over.</p>
          </section>
        ))}
      </div>

      {/* The bar at the foot of the wizard, as they meet it. */}
      <EditorSection title="The button" testId="editor-review-bar">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <TextBox value={draft.review.submitNote} onChange={(v) => update((t) => (t.review.submitNote = v))} ariaLabel="Note beside the submit button" placeholder="Small print beside the button (optional)" className="flex-1 text-2xs text-muted-foreground" />
          <TextBox value={draft.review.submitLabel} onChange={(v) => update((t) => (t.review.submitLabel = v))} ariaLabel="Submit button label" className="h-10 rounded-lg border-transparent bg-primary px-4.5 text-center text-sm font-medium text-primary-foreground sm:w-44 focus:bg-primary" testId="editor-submit-label" />
        </div>
      </EditorSection>

      {/* And the ticket, which is the last thing anybody sees. */}
      <EditorSection
        title={
          <>
            <MessageSquareQuote className="size-3" aria-hidden /> On the ticket
          </>
        }
        testId="editor-review-reply"
      >
        <TextBox value={draft.review.autoReply} onChange={(v) => update((t) => (t.review.autoReply = v))} ariaLabel="Automatic reply" placeholder="Thanks — we have your request…" className="text-[13px]" multiline rows={3} testId="editor-auto-reply" />
        <p className="text-2xs text-muted-foreground">Shown with the reference once a booking is in. Say what happens next and how long it usually takes.</p>
      </EditorSection>
    </div>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

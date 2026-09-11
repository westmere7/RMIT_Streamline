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
import type { BookingForm as BookingFormData, BookingFormTemplate, BookingServiceType, BookingStandardField, BookingStandardKey, BookingTemplate, ColorToken } from "@/domain";
import {
  BOOKING_STANDARD_KEY_LABELS,
  defaultBookingFormTemplate,
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
import { DragHandle, EditorFrame, TextBox } from "./editor-controls";
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
        {/* The draft, run as the real thing. Nothing it does is sent or kept. */}
        <Button type="button" variant="outline" onClick={() => setPreviewing(true)} disabled={!check.success} title={problem ?? undefined} data-testid="booking-editor-preview">
          <Eye /> Preview the form
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

      {/* Pinned, like the bar it stands for: a form long enough to scroll is
          exactly when knowing which step is open matters. */}
      <div role="tablist" aria-label="The steps of the form" className="sticky top-0 z-10 flex flex-wrap items-end gap-0.5 border-b border-border/60 pt-1 before:absolute before:inset-y-0 before:-inset-x-10 before:-z-10 before:bg-card">
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
          {service ? (
            <BriefBuilder service={service} onPatch={(patch) => update((t) => Object.assign(t.services.find((s) => s.id === service.id)!, patch))} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Add a service in step one first.</p>
          )}
        </div>
      )}

      {tab === "assets" && <AssetsPane form={form} draft={draft} update={update} />}
      {tab === "review" && <ReviewPane draft={draft} update={update} />}

      <PreviewDialog open={previewing} onOpenChange={setPreviewing} form={form} template={draft} />
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
  // The three about the requester are one block; everything else on this step
  // is a question in its own right, orderable and removable like any other.
  const requester = draft.basics.fields.filter((f) => isRequesterKey(f.key));
  const rest = draft.basics.fields.filter((f) => !isRequesterKey(f.key));
  const patchField = (id: string, patch: Partial<BookingStandardField>) => update((t) => Object.assign(t.basics.fields.find((f) => f.id === id)!, patch));
  /** Which service's chips are on show, exactly as picking one in the form shows them. */
  const [showing, setShowing] = React.useState<string | null>(() => draft.services[0]?.id ?? null);
  const shown = draft.services.find((s) => s.id === showing) ?? draft.services[0] ?? null;

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
    <div className="space-y-6">
      <EditorFrame testId="editor-basics-heading">
        <TextBox value={draft.basics.title ?? ""} onChange={(v) => update((t) => (t.basics.title = v || null))} ariaLabel="Step one title" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-basics-title" />
        <TextBox value={draft.basics.hint ?? ""} onChange={(v) => update((t) => (t.basics.hint = v || null))} ariaLabel="Step one hint" placeholder="A line under it (optional)" quiet={!draft.basics.hint} className="text-[13px] text-muted-foreground" testId="editor-basics-hint" />
      </EditorFrame>

      {/* Who is asking: one block, three boxes, nothing to explain and nothing
          to turn off. Only its wording is anybody's to change. */}
      {requester.length > 0 && (
        <EditorFrame testId="editor-requester-block">
          <div className="grid gap-3 sm:grid-cols-3">
            {requester.map((field) => (
              <div key={field.id} className="min-w-0 grid gap-1.5">
                <span className="flex items-center gap-1">
                  <TextBox value={field.label} onChange={(v) => patchField(field.id, { label: v })} ariaLabel={`Label for ${BOOKING_STANDARD_KEY_LABELS[field.key]}`} placeholder="Question" className="min-w-0 flex-1 text-[13px] font-medium" testId={`editor-field-label-${field.id}`} />
                  <span aria-hidden className="text-primary">
                    *
                  </span>
                </span>
                <div className="pointer-events-none" aria-hidden>
                  <StandardField field={field} form={form} draft={previewRequest} onChange={() => {}} preview hideLabel />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-2xs text-muted-foreground opacity-0 transition-opacity group-hover/frame:opacity-100">
            <Info className="mt-px size-3 shrink-0" aria-hidden />
            Always asked and always required. Filled in from the account of anyone signed in, and still theirs to change.
          </p>
        </EditorFrame>
      )}

      {/* The rest of the step, as it lays them out: same six columns, same
          widths. Not reorderable: there are a handful of them, they are the
          same handful on every workspace's form, and the order they are asked
          in is the order they make sense in. Their words are another matter. */}
      <div className="grid gap-2 sm:grid-cols-6">
        {rest.map((field) => (
          <StandardFieldEditor
            key={field.id}
            field={field}
            form={form}
            previewRequest={previewRequest}
            onPatch={(patch) => patchField(field.id, patch)}
          />
        ))}
      </div>
      {/* Which of the optional questions this step asks. Switches rather than a
          handle on each card: it is one decision about the step, and it should
          be visible without hovering anything. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs text-muted-foreground">
        <span>Also ask</span>
        {OPTIONAL_KEYS.map((key) => {
          const on = draft.basics.fields.some((f) => f.key === key);
          return (
            <label key={key} className="flex items-center gap-1.5">
              <Switch
                size="sm"
                checked={on}
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
      </div>

      <div className="space-y-3">
        <EditorFrame testId="editor-service-question">
          <TextBox value={draft.basics.serviceLabel} onChange={(v) => update((t) => (t.basics.serviceLabel = v))} ariaLabel="Service question" placeholder="What kind of work is this?" className="text-[13px] font-medium" testId="editor-service-label" />
          <TextBox value={draft.basics.serviceHint ?? ""} onChange={(v) => update((t) => (t.basics.serviceHint = v || null))} ariaLabel="Service hint" placeholder="A line under it (optional)" quiet={!draft.basics.serviceHint} className="text-2xs text-muted-foreground" testId="editor-service-hint" />
        </EditorFrame>

        {/* The chooser itself. Clicking a card shows its sub-services underneath,
            which is what clicking one does in the form. */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToParentElement]} onDragEnd={onServiceDrag}>
          <SortableContext items={draft.services.map((x) => x.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="editor-services">
              {draft.services.map((service) => (
                <ServiceEditor
                  key={service.id}
                  service={service}
                  form={form}
                  selected={service.id === shown?.id}
                  only={draft.services.length === 1}
                  onSelect={() => setShowing(service.id)}
                  onPatch={(patch) => update((t) => Object.assign(t.services.find((x) => x.id === service.id)!, patch))}
                  onDuplicate={() =>
                    update((t) => {
                      const at = t.services.findIndex((x) => x.id === service.id);
                      t.services.splice(at + 1, 0, { ...clone(service), id: newServiceType(service.name).id, name: `${service.name} copy` });
                    })
                  }
                  onRemove={() => update((t) => (t.services = t.services.filter((x) => x.id !== service.id)))}
                  onEditBrief={() => onEditBrief(service.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <Button type="button" variant="outline" size="sm" onClick={() => update((t) => t.services.push(newServiceType("New service")))} data-testid="editor-add-service">
          <Plus /> Add a service
        </Button>

        {/* Exactly where the form shows them: under the chooser, once one is picked. */}
        {shown && (
          <EditorFrame className="mt-1" testId={`editor-service-subs-frame-${slug(shown.name)}`}>
            <div className="grid gap-1.5">
              <TextBox value={shown.subServiceLabel} onChange={(v) => update((t) => (t.services.find((x) => x.id === shown.id)!.subServiceLabel = v))} ariaLabel="Sub-service question" placeholder="What does it involve?" className="text-[13px] font-medium" testId={`editor-service-sublabel-${slug(shown.name)}`} />
              <TextBox
                value={shown.subServiceHint ?? ""}
                onChange={(v) => update((t) => (t.services.find((x) => x.id === shown.id)!.subServiceHint = v || null))}
                ariaLabel="Sub-service hint"
                placeholder="A line under it (optional)"
                className="-mt-0.5 text-2xs text-muted-foreground"
              />
              <ChoiceChips
                options={shown.subServices}
                onChange={(subServices) => update((t) => (t.services.find((x) => x.id === shown.id)!.subServices = subServices))}
                addLabel="Add a sub-service"
                testIdPrefix={`editor-service-subs-${slug(shown.name)}`}
              />
            </div>
          </EditorFrame>
        )}
      </div>
    </div>
  );
}

/**
 * One of step one's fixed questions.
 *
 * Only its wording is anybody's business. There is no strip of handles over it
 * and no description to place: the questions are the same handful on every
 * workspace's form, their order is the order they make sense in, and which of
 * the optional two are asked is a pair of switches under the grid rather than
 * something hidden behind a hover.
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

function ServiceEditor({
  service,
  form,
  selected,
  only,
  onSelect,
  onPatch,
  onDuplicate,
  onRemove,
  onEditBrief,
}: {
  service: BookingServiceType;
  form: BookingFormData;
  selected: boolean;
  only: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<BookingServiceType>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onEditBrief: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: service.id });
  const questions = service.blocks.filter((b) => b.kind !== "separator" && b.kind !== "text").length;

  return (
    // The top band is empty on purpose: it is where the handles of the card
    // being edited sit, so they never cover the name they belong to.
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("group/frame relative min-w-0 pt-6", isDragging && "z-10 opacity-90")}>
      <DragHandle label={`Reorder ${service.name}`} testId={`editor-service-drag-${slug(service.name)}`} setRef={setActivatorNodeRef} listeners={listeners} attributes={attributes} />
      {selected && (
        <div className="absolute top-0 right-1 z-[2] flex items-center gap-1 rounded-lg border border-border bg-card px-1.5 py-0.5 shadow-xs">
          <ServiceChrome service={service} form={form} only={only} onPatch={onPatch} onDuplicate={onDuplicate} onRemove={onRemove} />
        </div>
      )}
      <ServiceCardShell
        color={service.color}
        icon={service.icon}
        selected={selected}
        onSelect={onSelect}
        testId={`editor-service-${slug(service.name)}`}
        name={<TextBox value={service.name} onChange={(v) => onPatch({ name: v })} ariaLabel="Service name" placeholder="Service name" className="text-[13px] font-semibold" testId={`editor-service-name-${slug(service.name)}`} />}
        description={
          <TextBox
            value={service.description ?? ""}
            onChange={(v) => onPatch({ description: v || null })}
            ariaLabel="Service description"
            placeholder="A line describing it (optional)"
            className="text-2xs leading-relaxed text-muted-foreground"
          />
        }
      />
      <button
        type="button"
        onClick={onEditBrief}
        className="mt-1 inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        data-testid={`editor-service-brief-${slug(service.name)}`}
      >
        <Shapes className="size-3" /> {questions === 0 ? "Build its questions" : questions === 1 ? "1 question in step two" : `${questions} questions in step two`}
      </button>
    </div>
  );
}

/** The handles for the service being edited: its look, its routing, and its fate. */
function ServiceChrome({
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
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Look of ${service.name}`} className="text-muted-foreground" data-testid={`editor-service-look-${slug(service.name)}`}>
            <Palette />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3 p-3">
          <ColorPicker value={service.color} onChange={(color) => onPatch({ color: color as ColorToken })} />
          <div className="scrollbar-thin max-h-52 overflow-y-auto">
            <IconPicker value={service.icon} onChange={(icon) => onPatch({ icon })} />
          </div>
        </PopoverContent>
      </Popover>
      <Select value={service.teamId ?? ALLOCATION_TEAM} onValueChange={(v) => onPatch({ teamId: v === ALLOCATION_TEAM ? null : v })}>
        <SelectTrigger className="h-6 w-auto gap-1 px-1.5 text-2xs" aria-label={`Which team takes ${service.name}`} data-testid={`editor-service-team-${slug(service.name)}`}>
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
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Duplicate this service" title="Duplicate this service" onClick={onDuplicate} className="text-muted-foreground" data-testid={`editor-service-copy-${slug(service.name)}`}>
        <Copy />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={only ? "The form needs at least one service" : "Remove this service"}
        title={only ? "The form needs at least one service" : "Remove this service"}
        onClick={onRemove}
        disabled={only}
        className="text-muted-foreground hover:text-destructive"
        data-testid={`editor-service-remove-${slug(service.name)}`}
      >
        <Trash2 />
      </Button>
    </>
  );
}

// ---- steps three and four ---------------------------------------------------

function AssetsPane({ form, draft, update }: { form: BookingFormData; draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void }) {
  const step = draft.assets;
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-[13px]">
        <Switch size="sm" checked={step.enabled} onCheckedChange={(on) => update((t) => (t.assets.enabled = on))} data-testid="editor-assets-toggle" />
        <Boxes className={cn("size-3.5 shrink-0 text-muted-foreground", !step.enabled && "opacity-50")} aria-hidden />
        {step.enabled ? "This step is shown" : "This step is skipped altogether"}
      </label>

      <div className={cn("space-y-5", !step.enabled && "pointer-events-none opacity-50")}>
        {/* The step as it is met: heading, the way out of it, the rows, the two
            questions beside them. */}
        <EditorFrame testId="editor-assets-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <Boxes className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <TextBox value={step.title} onChange={(v) => update((t) => (t.assets.title = v))} ariaLabel="Deliverables title" placeholder="A heading for this step" className="text-[15px] font-semibold tracking-tight" testId="editor-assets-title" />
              </span>
              <TextBox value={step.hint} onChange={(v) => update((t) => (t.assets.hint = v))} ariaLabel="Deliverables hint" placeholder="Explain what to list here (optional)" className="max-w-prose text-[13px] text-muted-foreground" multiline testId="editor-assets-hint" />
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
              <SkipForward className="size-3.5" aria-hidden /> Skip this step
            </span>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-2xs text-muted-foreground">
            <Info className="mt-px size-3 shrink-0" aria-hidden />
            Nothing here is ever required — the way out is always offered.
          </p>
        </EditorFrame>

        <div className="pointer-events-none px-3" aria-hidden>
          <AssetList rows={[]} onChange={() => {}} preview />
        </div>

        <EditorFrame
          testId="editor-assets-types"
          chrome={
            <label className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Switch size="sm" checked={step.askAssetTypes} onCheckedChange={(on) => update((t) => (t.assets.askAssetTypes = on))} data-testid="editor-assets-types-toggle" />
              Asked
            </label>
          }
          className={cn(!step.askAssetTypes && "opacity-40")}
        >
          <TextBox value={step.assetTypesLabel} onChange={(v) => update((t) => (t.assets.assetTypesLabel = v))} ariaLabel="Asset types label" placeholder="Asset type" className="text-[13px] font-medium" testId="editor-assets-types-label" />
          <div className="pointer-events-none mt-1.5" aria-hidden>
            <AssetTypePicker options={form.assetTypes} value={[]} onChange={() => {}} disabled />
          </div>
        </EditorFrame>

        <EditorFrame
          testId="editor-assets-link"
          chrome={
            <label className="flex items-center gap-1 text-2xs text-muted-foreground">
              <Switch size="sm" checked={step.askLink} onCheckedChange={(on) => update((t) => (t.assets.askLink = on))} data-testid="editor-assets-link-toggle" />
              Offered
            </label>
          }
          className={cn(!step.askLink && "opacity-40")}
        >
          <div className="rounded-xl border border-border/60 bg-surface/50 p-3.5">
            <span className="flex items-center gap-1.5">
              <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
              <TextBox value={step.linkLabel} onChange={(v) => update((t) => (t.assets.linkLabel = v))} ariaLabel="Link label" placeholder="Already have the list somewhere?" className="text-[13px] font-medium" testId="editor-assets-link-label" />
            </span>
            <TextBox value={step.linkHint ?? ""} onChange={(v) => update((t) => (t.assets.linkHint = v || null))} ariaLabel="Link hint" placeholder="A line under it (optional)" className="text-2xs text-muted-foreground" />
            <Input readOnly placeholder="https://" className="pointer-events-none mt-2 text-muted-foreground/60" tabIndex={-1} aria-hidden />
          </div>
        </EditorFrame>
      </div>
    </div>
  );
}

function ReviewPane({ draft, update }: { draft: BookingFormTemplate; update: (fn: (t: BookingFormTemplate) => void) => void }) {
  return (
    <div className="space-y-4">
      <EditorFrame testId="editor-review-heading">
        <TextBox value={draft.review.title ?? ""} onChange={(v) => update((t) => (t.review.title = v || null))} ariaLabel="Recap title" placeholder="A heading for this step (optional)" className="text-[15px] font-semibold tracking-tight" testId="editor-review-title" />
        <TextBox value={draft.review.hint ?? ""} onChange={(v) => update((t) => (t.review.hint = v || null))} ariaLabel="Recap hint" placeholder="A line under it (optional)" className="text-[13px] text-muted-foreground" testId="editor-review-hint" />
      </EditorFrame>

      {/* What the recap looks like. The cards are the step's own, filled with a
          booking that could have been made, so the heading above is read in
          the place it will be read. */}
      <div className="pointer-events-none space-y-3 px-3 opacity-70" aria-hidden>
        {["The request", "The brief", "Deliverables"].map((title) => (
          <section key={title} className="rounded-xl border border-border/60 bg-surface/40 p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <h3 className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight">{title}</h3>
              <span className="text-2xs text-muted-foreground">Change</span>
            </div>
            <p className="text-[13px] text-muted-foreground">What they answered, laid out to be read over.</p>
          </section>
        ))}
      </div>

      {/* The bar at the foot of the wizard, as they meet it. */}
      <EditorFrame testId="editor-review-bar">
        <div className="flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <TextBox value={draft.review.submitNote} onChange={(v) => update((t) => (t.review.submitNote = v))} ariaLabel="Note beside the submit button" placeholder="Small print beside the button (optional)" className="flex-1 text-2xs text-muted-foreground" />
          <TextBox value={draft.review.submitLabel} onChange={(v) => update((t) => (t.review.submitLabel = v))} ariaLabel="Submit button label" className="h-10 rounded-lg bg-primary px-4.5 text-center text-sm font-medium text-primary-foreground sm:min-w-44" testId="editor-submit-label" />
        </div>
      </EditorFrame>

      {/* And the ticket, which is the last thing anybody sees. */}
      <EditorFrame testId="editor-review-reply">
        <p className="mb-1.5 text-2xs tracking-wide text-muted-foreground uppercase">On the ticket</p>
        <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card p-4 text-[13px]">
          <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <TextBox value={draft.review.autoReply} onChange={(v) => update((t) => (t.review.autoReply = v))} ariaLabel="Automatic reply" placeholder="Thanks — we have your request…" className="min-w-0 flex-1 text-[13px]" multiline rows={3} testId="editor-auto-reply" />
        </div>
        <p className="mt-1.5 text-2xs text-muted-foreground">Shown with the reference once a booking is in. Say what happens next and how long it usually takes.</p>
      </EditorFrame>
    </div>
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

"use client";

import { ArrowDown, ArrowUp, Columns2, LoaderCircle, Lock, Plus, RectangleHorizontal, X } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BookingAnswerDestination, BookingForm as BookingFormData, BookingFormTemplate, BookingTemplate, BookingTemplateField, BookingTemplateSection } from "@/domain";
import { BOOKING_FIELD_TYPE_LABELS, BOOKING_STANDARD_KEY_LABELS, defaultBookingFormTemplate, isLockedStandardKey } from "@/domain";
import { newId } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { bookingFormTemplateSchema } from "@/services/booking";
import { AnswerField, AssetList, blankAsset, emptyDraft, StandardField } from "../booking-fields";
import { AddFieldDialog } from "./add-field-dialog";
import { optionsToText, parseOptions } from "./options";
import { TemplatesMenu } from "./templates-menu";

export interface BookingFormEditorProps {
  form: BookingFormData;
  /** The form as it is live now; the editor starts from it and "Discard" returns to it. */
  initial: BookingFormTemplate;
  templates: BookingTemplate[];
  saving: boolean;
  onSave: (template: BookingFormTemplate) => void;
  onCancel: () => void;
  onSaveTemplate: (name: string, template: BookingFormTemplate) => Promise<void>;
  onDeleteTemplate: (template: BookingTemplate) => Promise<void>;
  /** Where the editing controls go. Given one, they sit beside the form rather than above it. */
  panelContainer?: HTMLElement | null;
}

/**
 * The form, editable in place. It keeps the form's own layout so an admin words
 * a question while looking at the control it labels: every text is a box, every
 * question has its handles (required, width, order, remove), every section can
 * take another question or go. Nothing leaves the browser until "Save form".
 */
export function BookingFormEditor({ form, initial, templates, saving, onSave, onCancel, onSaveTemplate, onDeleteTemplate, panelContainer }: BookingFormEditorProps) {
  const [draft, setDraft] = React.useState<BookingFormTemplate>(() => clone(initial));
  const [addingTo, setAddingTo] = React.useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const previewDraft = React.useMemo(() => emptyDraft(), []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const check = bookingFormTemplateSchema.safeParse(draft);
  const problem = check.success ? null : (check.error.issues[0]?.message ?? "Something in the form is not right yet");

  const update = (fn: (t: BookingFormTemplate) => void) =>
    setDraft((prev) => {
      const next = clone(prev);
      fn(next);
      return next;
    });
  const patchSection = (id: string, patch: Partial<BookingTemplateSection>) => update((t) => Object.assign(t.sections.find((s) => s.id === id)!, patch));
  const moveSection = (id: string, by: -1 | 1) => update((t) => move(t.sections, t.sections.findIndex((s) => s.id === id), by));
  const removeSection = (id: string) => update((t) => (t.sections = t.sections.filter((s) => s.id !== id)));
  const addSection = () => update((t) => t.sections.push({ id: newId(), title: "New section", hint: null, fields: [] }));
  const patchField = (sectionId: string, fieldId: string, patch: Partial<BookingTemplateField>) => update((t) => Object.assign(t.sections.find((s) => s.id === sectionId)!.fields.find((f) => f.id === fieldId)!, patch));
  const moveField = (sectionId: string, fieldId: string, by: -1 | 1) =>
    update((t) => {
      const section = t.sections.find((s) => s.id === sectionId)!;
      move(section.fields, section.fields.findIndex((f) => f.id === fieldId), by);
    });
  const removeField = (sectionId: string, fieldId: string) => update((t) => void (t.sections.find((s) => s.id === sectionId)!.fields = t.sections.find((s) => s.id === sectionId)!.fields.filter((f) => f.id !== fieldId)));
  const addField = (sectionId: string, field: BookingTemplateField) => update((t) => t.sections.find((s) => s.id === sectionId)!.fields.push(field));

  // The controls: beside the form when the page offers a place for them, above it otherwise.
  const panel = (
    <section className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4 shadow-xs" data-testid="booking-editor-panel">
      <div>
        <p className="text-[13px] font-medium">Editing the form</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Changes go live for everyone, the public link included, when you save.</p>
      </div>
      {problem && (
        <p className="text-2xs text-destructive" role="alert" data-testid="booking-editor-problem">
          {problem}
        </p>
      )}
      <div className="grid gap-2">
        <Button type="button" onClick={() => check.success && onSave(draft)} disabled={saving || !check.success || !dirty} title={problem ?? undefined} data-testid="booking-editor-save">
          {saving ? <LoaderCircle className="animate-spin" /> : null} Save form
        </Button>
        <div className="flex items-center gap-2">
          <TemplatesMenu
            templates={templates}
            current={draft}
            onLoad={(t) => {
              setDraft(clone(t.template));
              toast.success(`Loaded “${t.name}”`, { description: "Save the form to put it live." });
            }}
            onSaveTemplate={onSaveTemplate}
            onDeleteTemplate={onDeleteTemplate}
            onReset={() => setDraft(defaultBookingFormTemplate())}
          />
          <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={() => (dirty ? setConfirmDiscard(true) : onCancel())} disabled={saving} data-testid="booking-editor-discard">
            {dirty ? "Discard" : "Done"}
          </Button>
        </div>
      </div>
    </section>
  );

  return (
    <div className="space-y-6" data-testid="booking-editor">
      {panelContainer ? createPortal(panel, panelContainer) : panel}

      {/* The tab row: the request tab's name, and whether there is an assets tab at all. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/60 pb-2">
        <TextBox value={draft.requestTabLabel} onChange={(v) => update((t) => (t.requestTabLabel = v))} ariaLabel="Request tab name" className="w-40 text-[13px] font-medium" testId="editor-request-tab" />
        <label className="flex items-center gap-2 text-[13px]">
          <Switch size="sm" checked={draft.assets.enabled} onCheckedChange={(on) => update((t) => (t.assets.enabled = on))} data-testid="editor-assets-toggle" />
          <TextBox value={draft.assets.tabLabel} onChange={(v) => update((t) => (t.assets.tabLabel = v))} ariaLabel="Assets tab name" className={cn("w-40 text-[13px] font-medium", !draft.assets.enabled && "opacity-50")} />
          <span className="text-2xs text-muted-foreground">{draft.assets.enabled ? "tab shown" : "tab hidden"}</span>
        </label>
      </div>

      <div className="space-y-5">
        {draft.sections.map((section, index) => {
          const locked = section.fields.some((f) => f.kind === "standard" && isLockedStandardKey(f.key));
          return (
            <section key={section.id} className="space-y-4 rounded-xl border border-dashed border-border p-4" data-testid={`editor-section-${section.id}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <TextBox value={section.title} onChange={(v) => patchSection(section.id, { title: v })} ariaLabel="Section title" placeholder="Section title" className="text-[15px] font-semibold tracking-tight" testId={`editor-section-title-${section.id}`} />
                  <TextBox value={section.hint ?? ""} onChange={(v) => patchSection(section.id, { hint: v || null })} ariaLabel="Section hint" placeholder="Add a line under the title (optional)" className="text-[13px] text-muted-foreground" />
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Handle label="Move section up" onClick={() => moveSection(section.id, -1)} disabled={index === 0}>
                    <ArrowUp />
                  </Handle>
                  <Handle label="Move section down" onClick={() => moveSection(section.id, 1)} disabled={index === draft.sections.length - 1}>
                    <ArrowDown />
                  </Handle>
                  <Handle label={locked ? "This section holds questions the form cannot lose; move them first" : "Remove section"} onClick={() => removeSection(section.id)} disabled={locked} testId={`editor-remove-section-${section.id}`}>
                    <X />
                  </Handle>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.fields.map((field, fieldIndex) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    form={form}
                    previewDraft={previewDraft}
                    first={fieldIndex === 0}
                    last={fieldIndex === section.fields.length - 1}
                    onPatch={(patch) => patchField(section.id, field.id, patch)}
                    onMove={(by) => moveField(section.id, field.id, by)}
                    onRemove={() => removeField(section.id, field.id)}
                  />
                ))}
                {section.fields.length === 0 && <p className="text-[13px] text-muted-foreground sm:col-span-2">No questions yet.</p>}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingTo(section.id)} data-testid={`editor-add-field-${section.id}`}>
                <Plus /> Add a question
              </Button>
            </section>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={addSection} data-testid="editor-add-section">
          <Plus /> Add a section
        </Button>
      </div>

      {draft.assets.enabled && (
        <section className="space-y-3 rounded-xl border border-dashed border-border p-4" data-testid="editor-assets">
          <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{draft.assets.tabLabel} tab</p>
          <TextBox value={draft.assets.title} onChange={(v) => update((t) => (t.assets.title = v))} ariaLabel="Assets tab title" className="text-[15px] font-semibold tracking-tight" testId="editor-assets-title" />
          <TextBox value={draft.assets.hint} onChange={(v) => update((t) => (t.assets.hint = v))} ariaLabel="Assets tab hint" placeholder="Explain what to list here (optional)" className="text-[13px] text-muted-foreground" multiline />
          <div className="pointer-events-none opacity-70">
            <AssetList rows={[blankAsset()]} onChange={() => {}} title="" hint="" preview />
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <TextBox value={draft.submitNote} onChange={(v) => update((t) => (t.submitNote = v))} ariaLabel="Note beside the submit button" placeholder="Small print beside the button (optional)" className="flex-1 text-2xs text-muted-foreground" />
        <TextBox value={draft.submitLabel} onChange={(v) => update((t) => (t.submitLabel = v))} ariaLabel="Submit button label" className="h-10 rounded-lg bg-primary px-4.5 text-center text-sm font-medium text-primary-foreground sm:min-w-44" testId="editor-submit-label" />
      </div>

      <AddFieldDialog open={addingTo !== null} onOpenChange={(open) => !open && setAddingTo(null)} template={draft} onAdd={(field) => addingTo && addField(addingTo, field)} />
      <ConfirmDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} title="Discard your changes?" description="The form stays as it was before you started editing." confirmLabel="Discard" destructive onConfirm={onCancel} />
    </div>
  );
}

// ---- one question ---------------------------------------------------------------

function FieldEditor({
  field,
  form,
  previewDraft,
  first,
  last,
  onPatch,
  onMove,
  onRemove,
}: {
  field: BookingTemplateField;
  form: BookingFormData;
  previewDraft: ReturnType<typeof emptyDraft>;
  first: boolean;
  last: boolean;
  onPatch: (patch: Partial<BookingTemplateField>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const locked = field.kind === "standard" && isLockedStandardKey(field.key);
  const [optionsText, setOptionsText] = React.useState(() => (field.kind === "custom" ? optionsToText(field.options) : ""));
  const kindLabel = field.kind === "standard" ? BOOKING_STANDARD_KEY_LABELS[field.key] : BOOKING_FIELD_TYPE_LABELS[field.type];
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
            <X />
          </Handle>
        </div>
      </div>

      <div className="pointer-events-none opacity-70" aria-hidden>
        {field.kind === "standard" ? (
          <StandardField field={field} form={form} draft={previewDraft} onChange={() => {}} preview hideLabel />
        ) : (
          <AnswerField spec={field} value={undefined} onChange={() => {}} idPrefix="booking-answer" preview hideLabel />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs text-muted-foreground">
        <Badge variant="muted" className="shrink-0" title={locked ? "The form cannot do without this question" : undefined}>
          {locked && <Lock className="size-2.5" />}
          {kindLabel}
        </Badge>
        <label className="flex items-center gap-1.5">
          <Switch size="sm" checked={field.required} disabled={locked} onCheckedChange={(on) => onPatch({ required: on })} data-testid={`editor-field-required-${field.id}`} />
          Required
        </label>
        {field.kind === "custom" && (
          <label className="flex items-center gap-1.5">
            Answer goes
            <Select value={field.destination} onValueChange={(v) => onPatch({ destination: v as BookingAnswerDestination })}>
              <SelectTrigger className="h-7 w-auto gap-1 px-2 text-2xs" aria-label="Where the answer goes" data-testid={`editor-field-destination-${field.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brief">into the brief</SelectItem>
                <SelectItem value="column">into its own column on Task Allocation</SelectItem>
              </SelectContent>
            </Select>
          </label>
        )}
      </div>
      <TextBox value={field.hint ?? ""} onChange={(v) => onPatch({ hint: v || null })} ariaLabel="Hint under the question" placeholder="Add a hint under this question (optional)" className="text-2xs text-muted-foreground" />
      {hasPlaceholder(field) && (
        <TextBox value={field.placeholder ?? ""} onChange={(v) => onPatch({ placeholder: v || null })} ariaLabel="Placeholder text" placeholder={field.kind === "standard" && field.key === "team" ? "Wording of the “not sure” choice (optional)" : "Placeholder text inside the box (optional)"} className="text-2xs text-muted-foreground italic" />
      )}
      {field.kind === "custom" && field.type === "TAGS" && (
        <TextBox
          value={optionsText}
          onChange={(v) => {
            setOptionsText(v);
            onPatch({ options: parseOptions(v, field.options) });
          }}
          ariaLabel="Choices"
          placeholder="Choices, separated with commas"
          className="text-2xs"
          testId={`editor-field-options-${field.id}`}
        />
      )}
    </div>
  );
}

/** Whether the control has a box a placeholder could sit in. */
function hasPlaceholder(field: BookingTemplateField): boolean {
  if (field.kind === "standard") return ["requesterName", "requesterEmail", "department", "title", "brief", "referenceUrl", "team"].includes(field.key);
  return field.type === "TEXT" || field.type === "LONG_TEXT" || field.type === "NUMBER" || field.type === "LINK" || (field.type === "TAGS" && field.options.length === 0);
}

// ---- building blocks -------------------------------------------------------------

/** Text that stays text until it is clicked: a borderless box that shows its edge on hover and focus. */
function TextBox({ value, onChange, ariaLabel, placeholder, className, testId, multiline }: { value: string; onChange: (value: string) => void; ariaLabel: string; placeholder?: string; className?: string; testId?: string; multiline?: boolean }) {
  const classes = cn(
    "-mx-1.5 block w-[calc(100%+0.75rem)] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-inherit outline-none placeholder:text-muted-foreground/60 hover:border-border focus:border-ring focus:bg-background",
    className,
  );
  if (multiline) return <textarea value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} rows={2} className={cn(classes, "resize-y")} data-testid={testId} />;
  return <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} placeholder={placeholder} className={classes} data-testid={testId} />;
}

function Handle({ label, onClick, disabled, testId, children }: { label: string; onClick: () => void; disabled?: boolean; testId?: string; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="text-muted-foreground" data-testid={testId}>
      {children}
    </Button>
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

"use client";

import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { ColorDot } from "@/components/shared/label-pill";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AssetComposer, type AssetComposerPatch, type AssetComposerRow } from "@/features/assets/asset-composer";
import type { BookingExtraField, BookingFieldType, BookingForm as BookingFormData, BookingRequest, BookingStandardField, BookingTeamOption, ColumnValue, TagOption } from "@/domain";
import { T_SHIRT_SIZES, emptyValueFor } from "@/domain";
import { todayISO } from "@/lib/dates/dates";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * The controls of the booking form, one per kind of question, shared by the
 * form itself (booking-form.tsx) and the editor that shapes it
 * (editor/booking-form-editor.tsx), which shows each question as a disabled
 * preview so an admin sees what they are wording.
 */

export const NO_TEAM = "__none__";

/** What a person has typed so far, before it becomes a BookingRequest. */
export interface BookingDraft {
  requesterName: string;
  requesterEmail: string;
  department: string;
  title: string;
  brief: string;
  dueDate: string;
  referenceUrl: string;
  assetTypes: string[];
  priority: string | null;
  teamId: string | null;
  /** Answers to the form's custom questions, keyed by field id. */
  answers: Record<string, ColumnValue>;
  /** Answers to the chosen team's board columns, keyed by column id. */
  extra: Record<string, ColumnValue>;
}

export function emptyDraft(defaults?: Partial<Pick<BookingRequest, "requesterName" | "requesterEmail" | "department">>): BookingDraft {
  return {
    requesterName: defaults?.requesterName ?? "",
    requesterEmail: defaults?.requesterEmail ?? "",
    department: defaults?.department ?? "",
    title: "",
    brief: "",
    dueDate: "",
    referenceUrl: "",
    assetTypes: [],
    priority: null,
    teamId: null,
    answers: {},
    extra: {},
  };
}

export interface StandardFieldProps {
  field: BookingStandardField;
  form: BookingFormData;
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  error?: string;
  /** The editor's preview: disabled, with ids kept apart from the live form's and no test ids. */
  preview?: boolean;
  /** Rendered under the team select in the live form: the routing note and the team's extra questions. */
  teamExtras?: React.ReactNode;
  /** The editor shows the label as an editable box of its own, so the control goes without one. */
  hideLabel?: boolean;
}

/** One of the fixed questions, worded by the template, with the control it calls for. */
export function StandardField({ field, form, draft, onChange, error, preview, teamExtras, hideLabel }: StandardFieldProps) {
  const id = (base: string) => (preview ? `preview-${base}` : base);
  const tid = (base: string) => (preview ? undefined : base);
  const shell = { label: field.label, required: field.required, hint: field.hint ?? undefined, error, hideLabel };
  const placeholder = field.placeholder ?? undefined;
  switch (field.key) {
    case "requesterName":
      return (
        <Field id={id("booking-name")} {...shell}>
          <Input id={id("booking-name")} autoComplete="name" placeholder={placeholder} value={draft.requesterName} onChange={(e) => onChange({ requesterName: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-name")} />
        </Field>
      );
    case "requesterEmail":
      return (
        <Field id={id("booking-email")} {...shell}>
          <Input id={id("booking-email")} type="email" autoComplete="email" placeholder={placeholder} value={draft.requesterEmail} onChange={(e) => onChange({ requesterEmail: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-email")} />
        </Field>
      );
    case "department":
      return (
        <Field id={id("booking-department")} {...shell}>
          <Input id={id("booking-department")} autoComplete="organization" placeholder={placeholder} value={draft.department} onChange={(e) => onChange({ department: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-department")} />
        </Field>
      );
    case "title":
      return (
        <Field id={id("booking-title")} {...shell}>
          <Input id={id("booking-title")} placeholder={placeholder} value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-title")} />
        </Field>
      );
    case "brief":
      return (
        <Field id={id("booking-brief")} {...shell}>
          <Textarea id={id("booking-brief")} rows={5} placeholder={placeholder} value={draft.brief} onChange={(e) => onChange({ brief: e.target.value })} aria-invalid={!!error} className="resize-y" disabled={preview} data-testid={tid("booking-brief")} />
        </Field>
      );
    case "assetTypes":
      return (
        <Field {...shell}>
          <ChipGroup ariaLabel={field.label}>
            {form.assetTypes.map((option) => (
              <Chip key={option.name} color={option.color} active={draft.assetTypes.includes(option.name)} disabled={preview} onClick={() => onChange({ assetTypes: toggle(draft.assetTypes, option.name) })} testId={tid(`booking-asset-${slug(option.name)}`)}>
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
      );
    case "dueDate":
      return (
        <Field id={id("booking-due")} {...shell}>
          <Input id={id("booking-due")} type="date" min={todayISO()} value={draft.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-due")} />
        </Field>
      );
    case "priority":
      return (
        <Field {...shell}>
          <ChipGroup ariaLabel={field.label}>
            {form.priorities.map((option) => (
              <Chip key={option.name} color={option.color} active={draft.priority === option.name} disabled={preview} onClick={() => onChange({ priority: draft.priority === option.name ? null : option.name })} testId={tid(`booking-priority-${slug(option.name)}`)}>
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
      );
    case "referenceUrl":
      return (
        <Field id={id("booking-reference")} {...shell}>
          <Input id={id("booking-reference")} type="url" inputMode="url" placeholder={placeholder ?? "https://"} value={draft.referenceUrl} onChange={(e) => onChange({ referenceUrl: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-reference")} />
        </Field>
      );
    case "team":
      return (
        <div className="space-y-4">
          <Field id={id("booking-team")} {...shell}>
            <Select value={draft.teamId ?? NO_TEAM} onValueChange={(v) => onChange({ teamId: v === NO_TEAM ? null : v })} disabled={preview}>
              <SelectTrigger id={id("booking-team")} aria-label={field.label} className="h-10" data-testid={tid("booking-team")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEAM}>{field.placeholder || "Not sure — let us route it"}</SelectItem>
                {form.teams.map((t) => (
                  <SelectItem key={t.id} value={t.id} data-testid={tid(`booking-team-${t.id}`)}>
                    <span className="flex items-center gap-2">
                      <DynamicIcon name={t.icon} className={cn("size-3.5", colorClasses(t.color).text)} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {teamExtras}
        </div>
      );
  }
}

export function routingNote(team: BookingTeamOption | null): string {
  if (!team) return "Goes to the allocation queue. A manager places it with the right team.";
  if (team.boardName) return `Goes straight onto ${team.name}'s “${team.boardName}” board.`;
  return `Goes to the allocation queue, marked for ${team.name}.`;
}

// ---- typed answers: custom questions and a board's extra columns ------------------

/** What an answer control needs to know, whichever kind of question it serves. */
export interface AnswerSpec {
  id: string;
  label: string;
  type: BookingFieldType;
  hint?: string | null;
  placeholder?: string | null;
  required?: boolean;
  /** TAGS: the palette to choose from. Without one, tags are typed comma-separated. */
  options?: TagOption[];
  /** NUMBER: the unit shown after the label. */
  unit?: string | null;
}

export function specForExtraField(field: BookingExtraField): AnswerSpec {
  return { id: field.columnId, label: field.name, type: field.type, options: field.options, unit: field.unit ?? null };
}

export interface AnswerFieldProps {
  spec: AnswerSpec;
  value: ColumnValue | undefined;
  onChange: (value: ColumnValue) => void;
  error?: string;
  disabled?: boolean;
  /** Prefix for element ids and test ids, e.g. "booking-answer" → "booking-answer-<id>". */
  idPrefix: string;
  preview?: boolean;
  hideLabel?: boolean;
}

/** A question with a typed answer, rendered by type. */
export function AnswerField({ spec, value: given, onChange, error, disabled, idPrefix, preview, hideLabel }: AnswerFieldProps) {
  const value = given ?? emptyValueFor(spec.type);
  const id = `${preview ? "preview-" : ""}${idPrefix}-${spec.id}`;
  const testId = preview ? undefined : `${idPrefix}-${spec.id}`;
  const off = disabled || preview;
  const shell = { label: spec.unit ? `${spec.label} (${spec.unit})` : spec.label, required: spec.required, hint: spec.hint ?? undefined, error, hideLabel };
  const placeholder = spec.placeholder ?? undefined;
  switch (spec.type) {
    case "TEXT":
      return (
        <Field id={id} {...shell}>
          <Input id={id} placeholder={placeholder} value={value.type === "TEXT" ? value.text : ""} onChange={(e) => onChange({ type: "TEXT", text: e.target.value })} aria-invalid={!!error} disabled={off} data-testid={testId} />
        </Field>
      );
    case "LONG_TEXT":
      return (
        <Field id={id} {...shell}>
          <Textarea id={id} rows={3} placeholder={placeholder} value={value.type === "LONG_TEXT" ? value.text : ""} onChange={(e) => onChange({ type: "LONG_TEXT", text: e.target.value })} aria-invalid={!!error} disabled={off} data-testid={testId} />
        </Field>
      );
    case "NUMBER":
      return (
        <Field id={id} {...shell}>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            placeholder={placeholder}
            value={value.type === "NUMBER" && value.number !== null ? String(value.number) : ""}
            onChange={(e) => onChange({ type: "NUMBER", number: e.target.value === "" ? null : Number(e.target.value) })}
            aria-invalid={!!error}
            disabled={off}
            data-testid={testId}
          />
        </Field>
      );
    case "DATE":
      return (
        <Field id={id} {...shell}>
          <Input id={id} type="date" value={value.type === "DATE" ? (value.date ?? "") : ""} onChange={(e) => onChange({ type: "DATE", date: e.target.value || null })} aria-invalid={!!error} disabled={off} data-testid={testId} />
        </Field>
      );
    case "LINK":
      return (
        <Field id={id} {...shell}>
          <Input id={id} type="url" inputMode="url" placeholder={placeholder ?? "https://"} value={value.type === "LINK" ? value.url : ""} onChange={(e) => onChange({ type: "LINK", url: e.target.value, text: null })} aria-invalid={!!error} disabled={off} data-testid={testId} />
        </Field>
      );
    case "CHECKBOX":
      return (
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2.5 text-[13px]" htmlFor={id}>
            <Checkbox id={id} checked={value.type === "CHECKBOX" && value.checked} onCheckedChange={(checked) => onChange({ type: "CHECKBOX", checked: checked === true })} disabled={off} data-testid={testId} />
            <span>
              {spec.label}
              {spec.required && <RequiredMark />}
            </span>
          </label>
          <FieldNote error={error} hint={spec.hint ?? undefined} />
        </div>
      );
    case "TAGS": {
      const tags = value.type === "TAGS" ? value.tags : [];
      if (!spec.options || spec.options.length === 0) {
        return (
          <Field id={id} {...shell} hint={shell.hint ?? "Separate with commas"}>
            <Input id={id} placeholder={placeholder} value={tags.join(", ")} onChange={(e) => onChange({ type: "TAGS", tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} aria-invalid={!!error} disabled={off} data-testid={testId} />
          </Field>
        );
      }
      return (
        <Field {...shell}>
          <ChipGroup ariaLabel={spec.label}>
            {spec.options.map((option) => (
              <Chip key={option.name} color={option.color} active={tags.includes(option.name)} disabled={off} onClick={() => onChange({ type: "TAGS", tags: toggle(tags, option.name) })} testId={testId ? `${testId}-${slug(option.name)}` : undefined}>
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
      );
    }
    case "SIZE": {
      const size = value.type === "SIZE" ? value.size : null;
      return (
        <Field {...shell}>
          <ChipGroup ariaLabel={spec.label}>
            {T_SHIRT_SIZES.map((s) => (
              <Chip key={s} active={size === s} disabled={off} onClick={() => onChange({ type: "SIZE", size: size === s ? null : s })} testId={testId ? `${testId}-${s.toLowerCase()}` : undefined}>
                {s}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
      );
    }
  }
}

// ---- the asset list ------------------------------------------------------------------

/** A deliverable on a booking, held in the same shape the asset composer edits. */
export type AssetRow = AssetComposerRow;

let assetKey = 0;

/** A new row for the composer to open: quantity one, everything else to be filled in. */
export function newAssetRow(name: string): AssetRow {
  return { id: `asset-${++assetKey}`, name, assetType: null, quantity: 1, assigneeIds: [], dueDate: null, notes: null, completedAt: null };
}

/** One filled-in row, so the form editor's preview shows what the tab will look like. */
const PREVIEW_ROWS: AssetRow[] = [{ ...newAssetRow("A1 poster"), quantity: 6, notes: "594×841 mm, CMYK, print ready" }];

/**
 * What exactly is being asked for: one row per deliverable with a quantity and
 * the spec it has to meet. Each becomes a subitem of the request, so the team
 * can track them one by one. Its own tab, because a list can be long and nobody
 * has to fill it in: a spreadsheet or the asset tracker does as well.
 *
 * The rows are the same asset composer the item panel uses, minus the fields a
 * stakeholder cannot answer — there is nobody to put in charge and nothing to
 * tick off until the work exists.
 */
export function AssetList({ rows, onChange, title, hint, error, preview }: { rows: AssetRow[]; onChange: (rows: AssetRow[]) => void; title: string; hint: string; error?: string; preview?: boolean }) {
  const shown = preview ? PREVIEW_ROWS : rows;
  const patch = (id: string, p: AssetComposerPatch) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const tid = (base: string) => (preview ? undefined : base);
  return (
    <div className="grid gap-3" data-testid={tid("booking-assets")}>
      <div>
        <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
        {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <AssetComposer
        rows={shown}
        fields={{ done: false, people: false, type: false, due: false }}
        disabled={preview}
        emptyText="Nothing listed yet. Add what you need above — a name is enough, and you can open it for the quantity and the spec."
        onAdd={(name) => onChange([...rows, newAssetRow(name)])}
        onPatch={patch}
        onDuplicate={(row) => onChange([...rows, { ...row, id: newAssetRow(row.name).id }])}
        onRemove={(id) => onChange(rows.filter((r) => r.id !== id))}
      />
      {error && (
        <p className="text-2xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---- small building blocks -----------------------------------------------------

export function Section({ title, hint, children, className }: { title: string; hint?: string | null; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("space-y-4", className)}>
      <legend className="mb-3 w-full">
        <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

/** Label, control, and the error or hint under it. Without `id` the label is plain text, for chip groups. */
export function Field({ id, label, required, error, hint, hideLabel, children }: { id?: string; label: string; required?: boolean; error?: string; hint?: string; hideLabel?: boolean; children: React.ReactNode }) {
  const text = (
    <>
      {label}
      {required && <RequiredMark />}
    </>
  );
  return (
    <div className="grid gap-1.5">
      {hideLabel ? null : id ? <Label htmlFor={id}>{text}</Label> : <span className="text-[13px] font-medium">{text}</span>}
      {children}
      <FieldNote error={error} hint={hint} />
    </div>
  );
}

function FieldNote({ error, hint }: { error?: string; hint?: string }) {
  if (error)
    return (
      <p className="text-2xs text-destructive" role="alert">
        {error}
      </p>
    );
  if (hint) return <p className="text-2xs text-muted-foreground">{hint}</p>;
  return null;
}

function RequiredMark() {
  return (
    <span aria-hidden className="ml-0.5 text-primary">
      *
    </span>
  );
}

export function ChipGroup({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {children}
    </div>
  );
}

export function Chip({ active, onClick, color, testId, disabled, children }: { active: boolean; onClick: () => void; color?: Parameters<typeof ColorDot>[0]["color"]; testId?: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-70",
        active ? "border-foreground/80 bg-foreground text-background" : "border-border bg-card text-foreground enabled:hover:border-foreground/40 enabled:hover:bg-accent",
      )}
    >
      {color && <ColorDot color={color} className={cn(active && "ring-1 ring-background/60")} />}
      {children}
    </button>
  );
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

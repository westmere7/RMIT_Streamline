"use client";

import { Check, ChevronDown, CircleCheck, Plus, X } from "lucide-react";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { ColorDot } from "@/components/shared/label-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PrioritySignal } from "@/components/shared/priority-signal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssetComposerRow } from "@/features/assets/asset-composer";
import type { BookingAnswer, BookingFieldWidth, BookingForm as BookingFormData, BookingQuestionBlock, BookingRequest, BookingStandardField, BookingTextBlock, ColorToken, TagOption } from "@/domain";
import { emptyAnswerFor, priorityStrength } from "@/domain";
import { todayISO } from "@/lib/dates/dates";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

/**
 * The controls of the booking wizard, one per kind of question, shared by the
 * wizard itself and by the editor that shapes it — which shows each block as a
 * disabled preview, so an administrator words a question while looking at the
 * control it labels.
 */

export const NO_PRIORITY = "__normal__";

/** The dropdown item that means "nothing chosen" on a single choice nobody has to answer. */
const NO_CHOICE = "__none__";

/** The department item that opens a box for one not on the list. */
const OTHER_DEPARTMENT = "__other__";

/**
 * What each width spans on step one's six-column row.
 *
 * Written out rather than computed, because Tailwind reads the class names out
 * of the source: a span built from a variable would never reach the stylesheet.
 */
export const SPAN: Record<BookingFieldWidth, string> = { full: "sm:col-span-6", half: "sm:col-span-3", third: "sm:col-span-2" };

/** What the wizard is holding: the request being built, and the deliverable rows. */
export type BookingDraft = BookingRequest;

/** A deliverable on a booking, in the shape the asset composer edits. */
export type AssetRow = AssetComposerRow;

let assetKey = 0;

/** A new row for the composer to open: quantity one, everything else to be filled in. */
export function newAssetRow(name: string): AssetRow {
  return { id: `asset-${++assetKey}`, name, assetType: null, quantity: 1, assigneeIds: [], dueDate: null, notes: null, previewUrl: null, artworkUrl: null, completedAt: null };
}

// ---- the shell every question wears -------------------------------------------

export interface FieldShellProps {
  id?: string;
  label: string;
  required?: boolean;
  /** The explaining line, under the label. */
  description?: string | null;
  error?: string;
  /** A subtle rounded badge before the label: which question of the brief this is. */
  number?: number | null;
  /** The editor words the label in a box of its own, so the control goes without one. */
  hideLabel?: boolean;
  children: React.ReactNode;
}

/**
 * Label, control, and whatever has to be said about them.
 *
 * The description goes under the label, always: one place to look for the
 * explanation, on every question. An error always wins the line under the
 * control — a hint nobody can act on is not what somebody stuck needs to read.
 */
export function Field({ id, label, required, description, error, number, hideLabel, children }: FieldShellProps) {
  const hint = description?.trim() ? description.trim() : null;
  const text = (
    <>
      {typeof number === "number" && <NumberBadge n={number} />}
      <span className="min-w-0">
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-primary">
            *
          </span>
        )}
      </span>
    </>
  );
  return (
    <div className="grid gap-1.5">
      {!hideLabel &&
        (id ? (
          <Label htmlFor={id} className="flex items-center gap-1.5">
            {text}
          </Label>
        ) : (
          <span className="flex items-center gap-1.5 text-[13px] font-medium">{text}</span>
        ))}
      {hint && <p className="-mt-0.5 text-2xs text-muted-foreground">{hint}</p>}
      {children}
      {error && (
        <p className="text-2xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Which question of the brief this is: quiet, round, and never in the way of the words. */
export function NumberBadge({ n }: { n: number }) {
  return (
    <span aria-hidden className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface px-1.5 text-2xs font-semibold text-muted-foreground ring-1 ring-border/60 tabular">
      {n}
    </span>
  );
}

// ---- step one: the fixed questions --------------------------------------------

export interface StandardFieldProps {
  field: BookingStandardField;
  form: BookingFormData;
  draft: BookingDraft;
  onChange: (patch: Partial<BookingDraft>) => void;
  error?: string;
  /** The editor's preview: disabled, with ids kept apart from the live form's and no test ids. */
  preview?: boolean;
  /**
   * Filled in by the app and not to be typed over.
   *
   * Read-only rather than disabled: the words are still worth selecting and
   * copying, and the field stays in the tab order so nobody lands on a gap.
   */
  readOnly?: boolean;
  hideLabel?: boolean;
}

/** One of the fixed questions, worded by the template, with the control it calls for. */
export function StandardField({ field, form, draft, onChange, error, preview, readOnly, hideLabel }: StandardFieldProps) {
  const id = (base: string) => (preview ? `preview-${base}` : base);
  const tid = (base: string) => (preview ? undefined : base);
  const shell = { label: field.label, required: field.required, description: field.description, error, hideLabel };
  const locked = readOnly ? { readOnly: true as const, className: "text-muted-foreground" } : {};
  switch (field.key) {
    case "requesterName":
      return (
        <Field id={id("booking-name")} {...shell}>
          <Input id={id("booking-name")} autoComplete="name" value={draft.requesterName} onChange={(e) => onChange({ requesterName: e.target.value })} aria-invalid={!!error} disabled={preview} {...locked} data-testid={tid("booking-name")} />
        </Field>
      );
    case "requesterEmail":
      return (
        <Field id={id("booking-email")} {...shell}>
          <Input id={id("booking-email")} type="email" autoComplete="email" value={draft.requesterEmail} onChange={(e) => onChange({ requesterEmail: e.target.value })} aria-invalid={!!error} disabled={preview} {...locked} data-testid={tid("booking-email")} />
        </Field>
      );
    case "department": {
      // Picked from the workspace's stakeholder groups when it has any, so the
      // same school is not spelt six ways; "Other" opens a box for the rest.
      // Never locked: the one on an account is a default, not a fact.
      if (form.departments.length === 0) {
        return (
          <Field id={id("booking-department")} {...shell}>
            <Input id={id("booking-department")} autoComplete="organization" value={draft.department ?? ""} onChange={(e) => onChange({ department: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-department")} />
          </Field>
        );
      }
      // Kept untrimmed while it is being typed: trimming as you go eats the
      // space between two words. The sentinel single space shows as empty.
      const raw = draft.department ?? "";
      const listed = form.departments.find((d) => d.name === raw.trim()) ?? null;
      const other = raw !== "" && !listed;
      return (
        <Field id={id("booking-department")} {...shell}>
          <div className="grid gap-1.5">
            <Select value={listed ? listed.name : other ? OTHER_DEPARTMENT : ""} onValueChange={(v) => onChange({ department: v === OTHER_DEPARTMENT ? (other ? draft.department : " ") : v })} disabled={preview}>
              <SelectTrigger id={id("booking-department")} aria-label={field.label} aria-invalid={!!error} className="h-10" data-testid={tid("booking-department")}>
                <SelectValue placeholder="Pick yours">
                  {listed && (
                    <span className="flex items-center gap-2">
                      <ColorDot color={listed.color} />
                      {listed.name}
                    </span>
                  )}
                  {other && "Other"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {form.departments.map((option) => (
                  <SelectItem key={option.name} value={option.name} data-testid={tid(`booking-department-${slug(option.name)}`)}>
                    <span className="flex items-center gap-2">
                      <ColorDot color={option.color} />
                      {option.name}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_DEPARTMENT} data-testid={tid("booking-department-other")}>
                  Other…
                </SelectItem>
              </SelectContent>
            </Select>
            {/* "Other" holds a single space until something is typed, so the
                select stays on Other while the box is empty; it is trimmed away
                before anything is sent. */}
            {other && <Input value={raw === " " ? "" : raw} onChange={(e) => onChange({ department: e.target.value || " " })} autoComplete="organization" placeholder="Which school or department?" aria-label={`${field.label}, other`} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-department-other-input")} />}
          </div>
        </Field>
      );
    }
    case "title":
      return (
        <Field id={id("booking-title")} {...shell}>
          <Input id={id("booking-title")} value={draft.title} onChange={(e) => onChange({ title: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-title")} />
        </Field>
      );
    case "dueDate":
      return (
        <Field id={id("booking-due")} {...shell}>
          <Input id={id("booking-due")} type="date" min={todayISO()} value={draft.dueDate ?? ""} onChange={(e) => onChange({ dueDate: e.target.value || null })} aria-invalid={!!error} disabled={preview} data-testid={tid("booking-due")} />
        </Field>
      );
    case "priority":
      return (
        <Field id={id("booking-priority")} {...shell}>
          {/* The same signal bars a priority wears everywhere else in the app:
              rising bars say "critical" before the eye reaches the word, so a
              stakeholder choosing one here sees what the team will see. */}
          <Select value={draft.priority ?? NO_PRIORITY} onValueChange={(v) => onChange({ priority: v === NO_PRIORITY ? null : v })} disabled={preview}>
            <SelectTrigger id={id("booking-priority")} aria-label={field.label} className="h-10" data-testid={tid("booking-priority")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PRIORITY}>Not sure — normal turnaround</SelectItem>
              {form.priorities.map((option) => (
                <SelectItem key={option.name} value={option.name} data-testid={tid(`booking-priority-${slug(option.name)}`)}>
                  <span className="flex items-center gap-2">
                    <PrioritySignal level={priorityStrength(option.name.toLowerCase())} className={cn("size-4", colorClasses(option.color).text)} />
                    {option.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      );
  }
}

// ---- step two: the blocks of a brief -------------------------------------------

export interface BlockFieldProps {
  block: BookingQuestionBlock;
  /** Which question of this brief it is, for the badge. */
  number: number | null;
  value: BookingAnswer | undefined;
  onChange: (answer: BookingAnswer) => void;
  error?: string;
  preview?: boolean;
  hideLabel?: boolean;
  /** Prefix for element ids and test ids, e.g. "booking-answer" → "booking-answer-<id>". */
  idPrefix?: string;
}

/** One question of a service's brief, rendered by kind. */
export function BlockField({ block, number, value, onChange, error, preview, hideLabel, idPrefix = "booking-answer" }: BlockFieldProps) {
  const answer = value ?? emptyAnswerFor(block.kind);
  const id = `${preview ? "preview-" : ""}${idPrefix}-${block.id}`;
  const testId = preview ? undefined : `${idPrefix}-${block.id}`;
  const shell = { label: block.label, required: block.required, description: block.description, error, number, hideLabel };
  const text = answer.kind === "text" ? answer.text : "";
  const values = answer.kind === "choice" ? answer.values : [];
  switch (block.kind) {
    case "short":
      return (
        <Field id={id} {...shell}>
          <Input id={id} value={text} onChange={(e) => onChange({ kind: "text", text: e.target.value })} aria-invalid={!!error} disabled={preview} data-testid={testId} />
        </Field>
      );
    case "long":
      return (
        <Field id={id} {...shell}>
          <Textarea id={id} rows={4} value={text} onChange={(e) => onChange({ kind: "text", text: e.target.value })} aria-invalid={!!error} className="resize-y" disabled={preview} data-testid={testId} />
        </Field>
      );
    case "multi":
      return (
        <Field {...shell}>
          <ChipGroup ariaLabel={block.label}>
            {block.options.map((option) => (
              <Chip
                key={option.name}
                color={option.color}
                active={values.includes(option.name)}
                disabled={preview}
                onClick={() => onChange({ kind: "choice", values: toggle(values, option.name) })}
                testId={testId ? `${testId}-${slug(option.name)}` : undefined}
              >
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
      );
    case "single":
      if (block.display === "dropdown") {
        // A dropdown for choices that are sentences: chips that long wrap into
        // a paragraph. Optional questions get a way back to "no answer".
        // Nothing chosen shows the placeholder, whether or not the question must be answered.
        const chosen = values[0] && block.options.some((o) => o.name === values[0]) ? values[0] : "";
        return (
          <Field id={id} {...shell}>
            <Select value={chosen} onValueChange={(v) => onChange({ kind: "choice", values: v === NO_CHOICE ? [] : [v] })} disabled={preview}>
              <SelectTrigger id={id} aria-label={block.label} aria-invalid={!!error} className="h-10" data-testid={testId}>
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {!block.required && <SelectItem value={NO_CHOICE}>No answer</SelectItem>}
                {block.options.map((option) => (
                  <SelectItem key={option.name} value={option.name} data-testid={testId ? `${testId}-${slug(option.name)}` : undefined}>
                    <span className="flex items-center gap-2">
                      <ColorDot color={option.color} />
                      {option.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        );
      }
      return (
        <Field {...shell}>
          <ChipGroup ariaLabel={block.label}>
            {block.options.map((option) => (
              <Chip
                key={option.name}
                color={option.color}
                active={values[0] === option.name}
                disabled={preview}
                // Choosing the one already chosen clears it, which is the only
                // way back to "no answer" on a question that never had to be answered.
                onClick={() => onChange({ kind: "choice", values: values[0] === option.name ? [] : [option.name] })}
                testId={testId ? `${testId}-${slug(option.name)}` : undefined}
              >
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </Field>
      );
    case "link": {
      const link = answer.kind === "link" ? answer : { url: "", label: "" };
      return (
        <Field id={id} {...shell}>
          {/* Two boxes, because a bare URL in a brief tells nobody what they are
              about to open. The words are optional; the address is the answer. */}
          <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
            <Input
              id={id}
              type="url"
              inputMode="url"
              placeholder="https://"
              value={link.url}
              onChange={(e) => onChange({ kind: "link", url: e.target.value, label: link.label })}
              aria-invalid={!!error}
              disabled={preview}
              data-testid={testId}
            />
            <Input
              aria-label={`What to call the link for “${block.label}”`}
              placeholder="What to call it (optional)"
              value={link.label}
              onChange={(e) => onChange({ kind: "link", url: link.url, label: e.target.value })}
              disabled={preview}
              data-testid={testId ? `${testId}-label` : undefined}
            />
          </div>
        </Field>
      );
    }
  }
}

/** A heading or a note the team wrote into the middle of a brief. */
export function TextBlockView({ block }: { block: BookingTextBlock }) {
  const text = block.text.trim();
  if (!text) return null;
  if (block.level === "heading") return <h3 className="text-[15px] font-semibold tracking-tight">{text}</h3>;
  if (block.level === "subheading") return <h4 className="text-[13px] font-semibold tracking-tight">{text}</h4>;
  return <p className="text-[13px] text-muted-foreground">{text}</p>;
}

/** The rule between two groups of questions. */
export function SeparatorBlockView() {
  return <hr className="my-1 border-border/70" />;
}

/**
 * One service on the chooser of step one.
 *
 * The shell is shared with the form editor, which renders the same card with
 * its name and its line turned into boxes. Keeping one component is what makes
 * the editor a picture of the form rather than an approximation of it: a change
 * to the card shows up in both, and neither can drift.
 */
export function ServiceCardShell({
  color,
  icon,
  selected,
  onSelect,
  name,
  description,
  chrome,
  testId,
  className,
}: {
  color: ColorToken;
  icon: string;
  selected?: boolean;
  onSelect?: () => void;
  /** The service's name: text in the form, an editable box in the editor. */
  name: React.ReactNode;
  description?: React.ReactNode;
  /** Handles the form has no room for; the editor passes its strip here. */
  chrome?: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  const colors = colorClasses(color);
  const interactive = !!onSelect;
  return (
    <div
      role={interactive ? "radio" : undefined}
      aria-checked={interactive ? !!selected : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (!interactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect?.();
        }
      }}
      data-testid={testId}
      className={cn(
        "group/service relative flex min-w-0 flex-col gap-1 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        interactive && "cursor-pointer",
        selected ? "border-foreground/70 bg-accent/60 shadow-xs" : "border-border bg-card",
        interactive && !selected && "hover:border-foreground/30 hover:bg-accent/40",
        className,
      )}
    >
      {chrome}
      <span className="flex items-center gap-2">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", colors.soft)}>
          <DynamicIcon name={icon} className={cn("size-4", colors.text)} />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold tracking-tight">{name}</span>
        {selected && <CircleCheck className="size-4 shrink-0" aria-hidden />}
      </span>
      {description}
    </div>
  );
}

// ---- the asset list ------------------------------------------------------------------

/** One filled-in row, so the editor's preview shows what the step will look like. */
const PREVIEW_ROWS: AssetRow[] = [{ ...newAssetRow("A1 poster"), assetType: "Print", quantity: 6, notes: "594×841 mm, CMYK, print ready" }];

/** The select item that means "no type picked"; a Radix item cannot carry an empty value. */
const NO_ASSET_TYPE = "__none__";

/**
 * What exactly is being asked for: one row per deliverable, on one line — the
 * name, what kind of thing it is, how many, and the spec it has to meet. Each
 * becomes a line on the item's Assets tab, so the team can track them one by one.
 *
 * Its own step, because a list can be long and nobody has to fill it in: a
 * spreadsheet or the asset tracker does as well. The rows are plain inputs
 * rather than the item panel's composer: a stakeholder has four things to say
 * about a deliverable and nothing to open, tick off or hand to anybody, so a
 * row that folds out to be edited was a row that took two clicks to fill in.
 */
export function AssetList({ rows, onChange, options, preview }: { rows: AssetRow[]; onChange: (rows: AssetRow[]) => void; options: TagOption[]; preview?: boolean }) {
  const shown = preview ? PREVIEW_ROWS : rows;
  const [newName, setNewName] = React.useState("");
  const tid = (base: string) => (preview ? undefined : base);
  const patch = (id: string, p: Partial<AssetRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onChange([...rows, newAssetRow(name)]);
    setNewName("");
  };

  return (
    <div className="grid gap-2" data-testid={tid("booking-assets")}>
      {shown.length > 0 && (
        <ul className="grid gap-1.5" data-testid={tid("asset-lines")}>
          {shown.map((row, index) => (
            <li key={row.id} className="grid gap-1.5 rounded-xl border border-border/60 bg-card p-2 sm:grid-cols-[1.25rem_minmax(0,1.5fr)_minmax(0,9rem)_4.5rem_minmax(0,1.5fr)_auto] sm:items-center" data-testid={tid("asset-line")} data-asset-name={row.name}>
              <span aria-hidden className="hidden text-center text-2xs font-medium tabular text-muted-foreground/60 sm:block">
                {index + 1}
              </span>
              <Input value={row.name} onChange={(e) => patch(row.id, { name: e.target.value })} aria-label="Deliverable" placeholder="What is it?" className="h-8 text-[13px]" disabled={preview} data-testid={tid("asset-name")} />
              <Select value={row.assetType ?? NO_ASSET_TYPE} onValueChange={(v) => patch(row.id, { assetType: v === NO_ASSET_TYPE ? null : v })} disabled={preview}>
                <SelectTrigger className="h-8 text-[13px]" aria-label={`Type of ${row.name || "this deliverable"}`} data-testid={tid("asset-type")}>
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ASSET_TYPE}>No type</SelectItem>
                  {options.map((option) => (
                    <SelectItem key={option.name} value={option.name}>
                      <span className="flex items-center gap-2">
                        <ColorDot color={option.color} />
                        {option.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={row.quantity ?? ""}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  patch(row.id, { quantity: Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : null });
                }}
                aria-label={`How many of ${row.name || "this deliverable"}`}
                placeholder="Qty"
                className="h-8 text-[13px] tabular"
                disabled={preview}
                data-testid={tid("asset-quantity")}
              />
              <Input value={row.notes ?? ""} onChange={(e) => patch(row.id, { notes: e.target.value || null })} aria-label={`Spec for ${row.name || "this deliverable"}`} placeholder="Size, format, finish…" className="h-8 text-[13px]" disabled={preview} data-testid={tid("asset-notes")} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${row.name || "this deliverable"}`} onClick={() => onChange(rows.filter((r) => r.id !== row.id))} disabled={preview} className="justify-self-end text-muted-foreground hover:text-destructive" data-testid={tid("asset-remove")}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {/* The way in: name it and it is a row; the rest is filled in on the row. */}
      <div className="flex gap-1.5">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={shown.length === 0 ? "Add a deliverable, e.g. A1 poster" : "Add another"}
          aria-label="Add a deliverable"
          className="h-9 flex-1 text-[13px]"
          disabled={preview}
          data-testid={tid("asset-add-input")}
        />
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={add} disabled={preview || !newName.trim()} data-testid={tid("asset-add-submit")}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}

// ---- small building blocks -----------------------------------------------------

export function Section({ title, hint, children, className }: { title: string; hint?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("space-y-4", className)}>
      <legend className={cn("w-full", children ? "mb-3" : "mb-0")}>
        <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
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
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-70 max-md:h-11 max-md:text-[15px]",
        active ? "border-foreground/80 bg-foreground text-background" : "border-border bg-card text-foreground enabled:hover:border-foreground/40 enabled:hover:bg-accent",
      )}
    >
      {color && <ColorDot color={color} className={cn(active && "ring-1 ring-background/60")} />}
      {children}
    </button>
  );
}

/**
 * Asset types: a search box over twenty-odd options, answered in chips.
 *
 * Twenty chips in a wall is a wall — the eye has to read every one to find
 * "Flyer", and on a phone it was five rows deep before anything else on the
 * form could be seen. A picker asks for one line of the form, searches by
 * typing, and what has been chosen stays visible inside it as chips that can
 * be taken off one at a time.
 */
export function AssetTypePicker({
  options,
  value,
  fixed = [],
  onChange,
  disabled,
}: {
  options: TagOption[];
  value: string[];
  /** Types that came from the deliverables themselves: shown, but not for taking off here. */
  fixed?: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const tid = (base: string) => (disabled ? undefined : base);
  const chosen = value.map((name) => options.find((o) => o.name === name) ?? { name, color: "gray" as const });
  const isFixed = (name: string) => fixed.includes(name);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {/* The chips sit in the control, not under it: what has been chosen is
            the value of this field, and a box that said "3 types chosen" with
            the answer somewhere below it is a box you have to read twice. */}
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-2 py-1.5 text-left text-[13px] transition-colors",
            disabled ? "cursor-default opacity-70" : "cursor-pointer hover:border-foreground/30",
            "focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11 max-md:text-[15px]",
          )}
          data-testid={tid("booking-asset-picker")}
        >
          {chosen.map((option) => (
            <span
              key={option.name}
              className={cn("inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border/60 pl-2.5 text-xs", isFixed(option.name) ? "pr-2.5" : "pr-1", colorClasses(option.color).soft)}
              onClick={(event) => event.stopPropagation()}
              data-testid={tid(isFixed(option.name) ? "booking-asset-type-fixed" : "booking-asset-type-chosen")}
            >
              <span className="truncate">{option.name}</span>
              {!disabled && !isFixed(option.name) && (
                <button
                  type="button"
                  aria-label={`Remove ${option.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(value.filter((name) => name !== option.name));
                  }}
                  className="rounded-full p-0.5 transition-colors hover:bg-background/60"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          <span className="flex min-w-0 flex-1 items-center gap-1.5 px-1 text-muted-foreground">
            <Plus className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{value.length === 0 ? "Choose what you need" : "Add another"}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search asset types…" />
          <CommandList className="max-h-64">
            <CommandEmpty>Nothing matches. Describe it in the brief instead.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const picked = value.includes(option.name);
                return (
                  <CommandItem key={option.name} value={option.name} disabled={isFixed(option.name)} onSelect={() => onChange(toggle(value, option.name))} data-testid={tid(`booking-asset-${slug(option.name)}`)}>
                    <ColorDot color={option.color} />
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <Check className={cn("size-4 shrink-0", picked ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

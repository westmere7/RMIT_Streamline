"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { ColorDot } from "@/components/shared/label-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { BookingAssetLine, BookingExtraField, BookingForm as BookingFormData, BookingReceipt, BookingRequest, BookingTeamOption, ColumnValue } from "@/domain";
import { T_SHIRT_SIZES, emptyValueFor } from "@/domain";
import { formatShortDate, todayISO } from "@/lib/dates/dates";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  requesterName: z.string().trim().min(2, "Tell us who is asking").max(120, "Keep it under 120 characters"),
  requesterEmail: z.email("Enter a valid email address").max(200),
  department: z.string().trim().max(160, "Keep it under 160 characters"),
  title: z.string().trim().min(3, "Give the task a short name").max(200, "Keep it under 200 characters"),
  brief: z.string().trim().min(10, "Describe what you need — a sentence or two is fine").max(10000),
  dueDate: z.string().refine((v) => v === "" || ISO_DATE.test(v), "Pick a date"),
  referenceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Links need to start with http:// or https://"),
});

type FormValues = z.infer<typeof schema>;

const NO_TEAM = "__none__";

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
 * Every board has its own columns, so the form asks the same standard questions
 * whatever team is chosen and the service maps the answers onto the receiving
 * board (see src/services/booking.ts). When a team takes bookings straight onto
 * one of its boards, that board's simple extra columns appear as a short second
 * section, so nothing the team needs is missing on arrival.
 */
export function BookingForm({ form, defaults, onSubmit, itemHref, onBooked }: BookingFormProps) {
  const rhf = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      requesterName: defaults?.requesterName ?? "",
      requesterEmail: defaults?.requesterEmail ?? "",
      department: defaults?.department ?? "",
      title: "",
      brief: "",
      dueDate: "",
      referenceUrl: "",
    },
  });
  const [assetTypes, setAssetTypes] = React.useState<string[]>([]);
  const [assets, setAssets] = React.useState<AssetRow[]>([blankAsset()]);
  const [teamId, setTeamId] = React.useState<string | null>(null);
  const [priority, setPriority] = React.useState<string | null>(null);
  const [extra, setExtra] = React.useState<Record<string, ColumnValue>>({});
  const [receipt, setReceipt] = React.useState<BookingReceipt | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"request" | "assets">("request");
  const assetCount = assets.filter((a) => a.name.trim()).length;

  const team = form.teams.find((t) => t.id === teamId) ?? null;

  const submit = useMutation({
    mutationFn: async (values: FormValues) => {
      setError(null);
      const request: BookingRequest = {
        requesterName: values.requesterName,
        requesterEmail: values.requesterEmail.trim().toLowerCase(),
        department: values.department || null,
        title: values.title,
        brief: values.brief,
        assetTypes,
        assets: assets.filter((a) => a.name.trim()).map<BookingAssetLine>((a) => ({ name: a.name.trim(), quantity: a.quantity.trim() ? Number(a.quantity) : null, spec: a.spec.trim() || null })),
        teamId,
        dueDate: values.dueDate || null,
        priority,
        referenceUrl: values.referenceUrl || null,
        // Only answers to the chosen team's questions travel; a switch of team drops the others.
        extra: Object.fromEntries(Object.entries(extra).filter(([columnId]) => team?.fields.some((f) => f.columnId === columnId))),
      };
      return onSubmit(request);
    },
    onSuccess: (result) => {
      setReceipt(result);
      onBooked?.(result);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong. Try again."),
  });

  const reset = () => {
    setReceipt(null);
    setAssetTypes([]);
    setAssets([blankAsset()]);
    setTab("request");
    setTeamId(null);
    setPriority(null);
    setExtra({});
    rhf.reset({ ...rhf.getValues(), title: "", brief: "", dueDate: "", referenceUrl: "" });
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

  const err = rhf.formState.errors;
  const busy = submit.isPending;

  return (
    <form
      className="space-y-6"
      // A validation error always belongs to the request tab: bring it into view.
      onSubmit={rhf.handleSubmit(
        (v) => submit.mutate(v),
        () => setTab("request"),
      )}
      noValidate
      data-testid="booking-form"
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "request" | "assets")}>
        <UnderlineTabsList className="-mx-1 mb-6">
          <UnderlineTabsTrigger value="request" data-testid="booking-tab-request">
            Request
          </UnderlineTabsTrigger>
          <UnderlineTabsTrigger value="assets" data-testid="booking-tab-assets">
            Assets &amp; specs
            {assetCount > 0 ? <span className="rounded-full bg-surface-strong px-1.5 text-2xs tabular">{assetCount}</span> : <span className="text-2xs font-normal text-muted-foreground">optional</span>}
          </UnderlineTabsTrigger>
        </UnderlineTabsList>
        <TabsContent value="request" className="space-y-7">
      <Section title="About you" hint="So the team knows who to come back to.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="booking-name" label="Your name" required error={err.requesterName?.message}>
            <Input id="booking-name" autoComplete="name" placeholder="e.g. Priya Nair" {...rhf.register("requesterName")} aria-invalid={!!err.requesterName} data-testid="booking-name" />
          </Field>
          <Field id="booking-email" label="Email" required error={err.requesterEmail?.message}>
            <Input id="booking-email" type="email" autoComplete="email" placeholder="you@rmit.edu.au" {...rhf.register("requesterEmail")} aria-invalid={!!err.requesterEmail} data-testid="booking-email" />
          </Field>
        </div>
        <Field id="booking-department" label="School, department or portfolio" error={err.department?.message}>
          <Input id="booking-department" autoComplete="organization" placeholder="e.g. School of Design" {...rhf.register("department")} aria-invalid={!!err.department} data-testid="booking-department" />
        </Field>
      </Section>

      <Section title="The task" hint="Plain language is perfect. Attach links to briefs or examples where you have them.">
        <Field id="booking-title" label="What is it?" required error={err.title?.message}>
          <Input id="booking-title" placeholder="e.g. Open Day 2026 wayfinding posters" {...rhf.register("title")} aria-invalid={!!err.title} data-testid="booking-title" />
        </Field>
        <Field id="booking-brief" label="Tell us more" required error={err.brief?.message}>
          <Textarea
            id="booking-brief"
            rows={5}
            placeholder="What do you need, who is it for, what should it achieve, and is there anything it must include?"
            {...rhf.register("brief")}
            aria-invalid={!!err.brief}
            className="resize-y"
            data-testid="booking-brief"
          />
        </Field>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">Asset type</span>
          <ChipGroup ariaLabel="Asset type">
            {form.assetTypes.map((option) => (
              <Chip key={option.name} color={option.color} active={assetTypes.includes(option.name)} onClick={() => setAssetTypes((prev) => toggle(prev, option.name))} testId={`booking-asset-${slug(option.name)}`}>
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="booking-due" label="Needed by" error={err.dueDate?.message}>
            <Input id="booking-due" type="date" min={todayISO()} {...rhf.register("dueDate")} aria-invalid={!!err.dueDate} data-testid="booking-due" />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-[13px] font-medium">How urgent?</span>
            <ChipGroup ariaLabel="Priority">
              {form.priorities.map((option) => (
                <Chip key={option.name} color={option.color} active={priority === option.name} onClick={() => setPriority(priority === option.name ? null : option.name)} testId={`booking-priority-${slug(option.name)}`}>
                  {option.name}
                </Chip>
              ))}
            </ChipGroup>
          </div>
        </div>
        <Field id="booking-reference" label="Link to a brief or examples" error={err.referenceUrl?.message}>
          <Input id="booking-reference" type="url" inputMode="url" placeholder="https://" {...rhf.register("referenceUrl")} aria-invalid={!!err.referenceUrl} data-testid="booking-reference" />
        </Field>
      </Section>

      <Section title="Who should do it?" hint="Not sure? Leave it blank and we will route it.">
        <div className="grid gap-1.5">
          <Label htmlFor="booking-team">Team</Label>
          <Select value={teamId ?? NO_TEAM} onValueChange={(v) => setTeamId(v === NO_TEAM ? null : v)}>
            <SelectTrigger id="booking-team" aria-label="Team" className="h-10" data-testid="booking-team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEAM}>Not sure — let us route it</SelectItem>
              {form.teams.map((t) => (
                <SelectItem key={t.id} value={t.id} data-testid={`booking-team-${t.id}`}>
                  <span className="flex items-center gap-2">
                    <DynamicIcon name={t.icon} className={cn("size-3.5", colorClasses(t.color).text)} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-2xs text-muted-foreground" data-testid="booking-routing">
            {routingNote(team)}
          </p>
        </div>
        {team && team.fields.length > 0 && (
          <div className="space-y-4 rounded-xl border border-border/60 bg-surface/50 p-4" data-testid="booking-extra">
            <div>
              <p className="text-[13px] font-medium">A few more details for {team.name}</p>
              <p className="text-2xs text-muted-foreground">All optional. They land straight in the team&apos;s board.</p>
            </div>
            {team.fields.map((field) => (
              <ExtraField key={field.columnId} field={field} value={extra[field.columnId] ?? emptyValueFor(field.type)} onChange={(value) => setExtra((prev) => ({ ...prev, [field.columnId]: value }))} />
            ))}
          </div>
        )}
      </Section>
        </TabsContent>
        <TabsContent value="assets">
          <AssetList rows={assets} onChange={setAssets} />
        </TabsContent>
      </Tabs>

      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-3.5 py-2.5 text-[13px] text-destructive" role="alert" data-testid="booking-error">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-2xs text-muted-foreground">You&apos;ll get a reference to quote when following up.</p>
        <Button type="submit" size="lg" disabled={busy} className="sm:min-w-44" data-testid="booking-submit">
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" /> Booking…
            </>
          ) : (
            "Book this task"
          )}
        </Button>
      </div>
    </form>
  );
}

function routingNote(team: BookingTeamOption | null): string {
  if (!team) return "Goes to the allocation queue. A manager places it with the right team.";
  if (team.boardName) return `Goes straight onto ${team.name}'s “${team.boardName}” board.`;
  return `Goes to the allocation queue, marked for ${team.name}.`;
}

// ---- the asset list ------------------------------------------------------------------

interface AssetRow {
  key: number;
  name: string;
  quantity: string;
  spec: string;
}

let assetKey = 0;
const blankAsset = (): AssetRow => ({ key: ++assetKey, name: "", quantity: "", spec: "" });

/**
 * What exactly is being asked for: one line per deliverable with a quantity and
 * the spec it has to meet. Each line becomes a subitem of the request, so the
 * team can track them one by one. Its own tab, because a list can be long and
 * nobody has to fill it in: a spreadsheet or the asset tracker does as well.
 */
function AssetList({ rows, onChange }: { rows: AssetRow[]; onChange: (rows: AssetRow[]) => void }) {
  const update = (key: number, patch: Partial<AssetRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => onChange(rows.length === 1 ? [blankAsset()] : rows.filter((r) => r.key !== key));
  return (
    <div className="grid gap-3" data-testid="booking-assets">
      <div>
        <span className="block text-[15px] font-semibold tracking-tight">Assets and specs</span>
        <p className="text-[13px] text-muted-foreground">
          Optional. List each deliverable with its size, format or other requirements and the team tracks them one by one. If you already have an asset list in a spreadsheet, skip this and mention it in the
          brief.
        </p>
      </div>
      <ul className="grid gap-2">
        {rows.map((row, index) => (
          <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_72px_auto] gap-1.5 sm:grid-cols-[minmax(0,5fr)_72px_minmax(0,6fr)_auto]" data-testid="booking-asset-row">
            <Input aria-label={`Asset ${index + 1}`} placeholder="e.g. A1 poster" value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} data-testid={`booking-asset-name-${index}`} />
            <Input aria-label={`Quantity of asset ${index + 1}`} type="number" inputMode="numeric" min={1} max={9999} placeholder="Qty" value={row.quantity} onChange={(e) => update(row.key, { quantity: e.target.value })} data-testid={`booking-asset-qty-${index}`} />
            <Input
              aria-label={`Spec for asset ${index + 1}`}
              placeholder="Spec: 594×841 mm, CMYK, print ready"
              value={row.spec}
              onChange={(e) => update(row.key, { spec: e.target.value })}
              className="col-span-2 sm:col-span-1"
              data-testid={`booking-asset-spec-${index}`}
            />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove asset ${index + 1}`} onClick={() => remove(row.key)} className="col-start-3 row-start-1 text-muted-foreground sm:col-start-4">
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...rows, blankAsset()])} data-testid="booking-asset-add">
        <Plus /> Add another asset
      </Button>
    </div>
  );
}

// ---- generic editors for a board's extra columns ----------------------------------

function ExtraField({ field, value, onChange }: { field: BookingExtraField; value: ColumnValue; onChange: (value: ColumnValue) => void }) {
  const id = `booking-extra-${field.columnId}`;
  const testId = `booking-extra-${field.columnId}`;
  switch (field.type) {
    case "TEXT":
      return (
        <Field id={id} label={field.name}>
          <Input id={id} value={value.type === "TEXT" ? value.text : ""} onChange={(e) => onChange({ type: "TEXT", text: e.target.value })} data-testid={testId} />
        </Field>
      );
    case "LONG_TEXT":
      return (
        <Field id={id} label={field.name}>
          <Textarea id={id} rows={3} value={value.type === "LONG_TEXT" ? value.text : ""} onChange={(e) => onChange({ type: "LONG_TEXT", text: e.target.value })} data-testid={testId} />
        </Field>
      );
    case "NUMBER":
      return (
        <Field id={id} label={field.unit ? `${field.name} (${field.unit})` : field.name}>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            value={value.type === "NUMBER" && value.number !== null ? String(value.number) : ""}
            onChange={(e) => onChange({ type: "NUMBER", number: e.target.value === "" ? null : Number(e.target.value) })}
            data-testid={testId}
          />
        </Field>
      );
    case "DATE":
      return (
        <Field id={id} label={field.name}>
          <Input id={id} type="date" value={value.type === "DATE" ? (value.date ?? "") : ""} onChange={(e) => onChange({ type: "DATE", date: e.target.value || null })} data-testid={testId} />
        </Field>
      );
    case "LINK":
      return (
        <Field id={id} label={field.name}>
          <Input id={id} type="url" inputMode="url" placeholder="https://" value={value.type === "LINK" ? value.url : ""} onChange={(e) => onChange({ type: "LINK", url: e.target.value, text: null })} data-testid={testId} />
        </Field>
      );
    case "CHECKBOX":
      return (
        <label className="flex items-center gap-2.5 text-[13px]" htmlFor={id}>
          <Checkbox id={id} checked={value.type === "CHECKBOX" && value.checked} onCheckedChange={(checked) => onChange({ type: "CHECKBOX", checked: checked === true })} data-testid={testId} />
          {field.name}
        </label>
      );
    case "TAGS": {
      const tags = value.type === "TAGS" ? value.tags : [];
      if (!field.options || field.options.length === 0) {
        return (
          <Field id={id} label={field.name} hint="Separate with commas">
            <Input id={id} value={tags.join(", ")} onChange={(e) => onChange({ type: "TAGS", tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} data-testid={testId} />
          </Field>
        );
      }
      return (
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">{field.name}</span>
          <ChipGroup ariaLabel={field.name}>
            {field.options.map((option) => (
              <Chip key={option.name} color={option.color} active={tags.includes(option.name)} onClick={() => onChange({ type: "TAGS", tags: toggle(tags, option.name) })} testId={`${testId}-${slug(option.name)}`}>
                {option.name}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      );
    }
    case "SIZE": {
      const size = value.type === "SIZE" ? value.size : null;
      return (
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium">{field.name}</span>
          <ChipGroup ariaLabel={field.name}>
            {T_SHIRT_SIZES.map((s) => (
              <Chip key={s} active={size === s} onClick={() => onChange({ type: "SIZE", size: size === s ? null : s })} testId={`${testId}-${s.toLowerCase()}`}>
                {s}
              </Chip>
            ))}
          </ChipGroup>
        </div>
      );
    }
  }
}

// ---- small building blocks -----------------------------------------------------

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 w-full">
        <span className="block text-[15px] font-semibold tracking-tight">{title}</span>
        {hint && <span className="block text-[13px] text-muted-foreground">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-primary">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p className="text-2xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-2xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ChipGroup({ ariaLabel, children }: { ariaLabel: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {children}
    </div>
  );
}

function Chip({ active, onClick, color, testId, children }: { active: boolean; onClick: () => void; color?: Parameters<typeof ColorDot>[0]["color"]; testId?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        active ? "border-foreground/80 bg-foreground text-background" : "border-border bg-card text-foreground hover:border-foreground/40 hover:bg-accent",
      )}
    >
      {color && <ColorDot color={color} className={cn(active && "ring-1 ring-background/60")} />}
      {children}
    </button>
  );
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

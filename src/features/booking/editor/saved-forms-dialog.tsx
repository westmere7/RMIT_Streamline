"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, CalendarRange, FolderOpen, LoaderCircle, MoreHorizontal, RefreshCcw, Rocket, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { BookingFormSchedule, BookingFormTemplate, BookingTemplate } from "@/domain";
import { activeSchedule, scheduleDatesProblem, scheduleToday, templateQuestionCount, upcomingSchedules } from "@/domain";
import { normaliseBookingTemplate } from "@/services/booking";
import { cn } from "@/lib/utils";

/** What the dialog asks of the page. Each resolves once the change is saved, or throws with the reason. */
export interface SavedFormsActions {
  onLoad: (saved: BookingTemplate) => void;
  onPublish: (saved: BookingTemplate) => Promise<void>;
  onSchedule: (saved: BookingTemplate, startsOn: string, endsOn: string) => Promise<void>;
  onChangeDays: (schedule: BookingFormSchedule, startsOn: string, endsOn: string) => Promise<void>;
  onRefreshCopy: (schedule: BookingFormSchedule) => Promise<void>;
  onUnschedule: (schedule: BookingFormSchedule) => Promise<void>;
}

/** "1 Dec", or "1 Dec 2027" outside this year. */
function day(iso: string): string {
  const date = parseISO(iso);
  return format(date, date.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy");
}

function days(startsOn: string, endsOn: string): string {
  return startsOn === endsOn ? day(startsOn) : `${day(startsOn)} – ${day(endsOn)}`;
}

/** Whether two forms ask the same things, the way the editor compares them. */
function same(a: BookingFormTemplate, b: BookingFormTemplate): boolean {
  try {
    return JSON.stringify(normaliseBookingTemplate(a)) === JSON.stringify(normaliseBookingTemplate(b));
  } catch {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}

/**
 * Saved forms, like save slots: pick one and publish it now as the default
 * form, or schedule it for a run of days, after which the default form comes
 * back by itself. Loading one into the editor is still here for changing it.
 */
export function SavedFormsDialog({
  open,
  onOpenChange,
  templates,
  schedules,
  defaultForm,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: BookingTemplate[];
  schedules: BookingFormSchedule[];
  /** The form served whenever no window runs. */
  defaultForm: { template: BookingFormTemplate; name: string | null };
  actions: SavedFormsActions;
}) {
  const today = scheduleToday();
  const running = activeSchedule(schedules, today);
  const coming = upcomingSchedules(schedules, today);
  const next = coming.find((s) => s.id !== running?.id) ?? null;
  const [publishing, setPublishing] = React.useState<BookingTemplate | null>(null);
  const [unscheduling, setUnscheduling] = React.useState<BookingFormSchedule | null>(null);
  const [scheduling, setScheduling] = React.useState<string | null>(null);
  const [changing, setChanging] = React.useState<string | null>(null);
  const defaultName = defaultForm.name ?? "Default form";

  const run = async (work: () => Promise<void>, done: string) => {
    try {
      await work();
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That didn't save");
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-[680px]" data-testid="saved-forms-dialog">
        <DialogHeader>
          <DialogTitle>Saved forms</DialogTitle>
          <DialogDescription>Publish one now, or schedule it for a few days. The default form comes back after.</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin -mx-1 min-h-0 space-y-5 overflow-y-auto px-1">
          {/* What stakeholders get today, and what comes next. */}
          <div className="rounded-xl border border-border/70 bg-surface/60 px-3 py-2.5 text-[13px]" data-testid="saved-forms-now">
            <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">On the form now</p>
            <p className="mt-0.5 font-medium">
              {running ? running.name : defaultName}
              {(running || defaultForm.name) && <span className="ml-1.5 font-normal text-muted-foreground">{running ? `until ${day(running.endsOn)}, then ${defaultName}` : "default form"}</span>}
            </p>
            {next && (
              <p className="mt-0.5 text-2xs text-muted-foreground" data-testid="saved-forms-next">
                Next: {next.name}, {days(next.startsOn, next.endsOn)}
              </p>
            )}
          </div>

          {coming.length > 0 && (
            <section className="space-y-1.5" data-testid="saved-forms-schedule">
              <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <CalendarRange className="size-3.5" aria-hidden /> Scheduled
              </h3>
              <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                {coming.map((s) => {
                  const source = templates.find((t) => t.id === s.templateId);
                  const stale = !!source && !same(source.template, s.template);
                  return (
                    <li key={s.id} className="px-3 py-2" data-testid="saved-forms-window">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{s.name}</span>
                          <span className="block text-2xs text-muted-foreground">
                            {days(s.startsOn, s.endsOn)}
                            {stale && " · the saved form has changed since"}
                          </span>
                        </span>
                        {s.id === running?.id && <StatusChip tone="live">Live</StatusChip>}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Options for ${s.name}`} data-testid="saved-forms-window-menu">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onSelect={() => setChanging(s.id)}>
                              <CalendarClock /> Change days
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!stale} onSelect={() => void run(() => actions.onRefreshCopy(s), `“${s.name}” takes the saved form as it is now`)} data-testid="saved-forms-refresh">
                              <RefreshCcw /> Use the latest saved copy
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onSelect={() => setUnscheduling(s)} data-testid="saved-forms-unschedule">
                              <Trash2 /> {s.id === running?.id ? "End now" : "Remove"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {changing === s.id && (
                        <DaysForm
                          initial={{ startsOn: s.startsOn, endsOn: s.endsOn }}
                          today={today}
                          // A window already running keeps the day it started.
                          lockStart={s.id === running?.id}
                          submitLabel="Save days"
                          onCancel={() => setChanging(null)}
                          onSubmit={async (startsOn, endsOn) => {
                            if (await run(() => actions.onChangeDays(s, startsOn, endsOn), `“${s.name}” moved to ${days(startsOn, endsOn)}`)) setChanging(null);
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="space-y-1.5" data-testid="saved-forms-list">
            <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Saved forms</h3>
            {templates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-[13px] text-muted-foreground">No saved forms yet. Save the form in the editor to keep it here.</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                {templates.map((t) => {
                  const services = t.template.services.length;
                  const planned = coming.filter((s) => s.templateId === t.id);
                  const isDefault = !running && same(t.template, defaultForm.template);
                  const live = planned.some((s) => s.id === running?.id) || isDefault;
                  return (
                    <li key={t.id} className="px-3 py-2.5" data-testid="saved-form-row">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium">{t.name}</span>
                            {live && <StatusChip tone="live">Live</StatusChip>}
                            {planned
                              .filter((s) => s.id !== running?.id)
                              .map((s) => (
                                <StatusChip key={s.id} tone="scheduled">
                                  {days(s.startsOn, s.endsOn)}
                                </StatusChip>
                              ))}
                          </span>
                          {t.description && <span className="mt-0.5 block text-2xs text-muted-foreground">{t.description}</span>}
                          <span className="mt-0.5 block text-2xs text-muted-foreground">
                            {templateQuestionCount(t.template)} questions · {services === 1 ? "1 service" : `${services} services`}
                          </span>
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" variant="outline" size="sm" onClick={() => setScheduling(scheduling === t.id ? null : t.id)} data-testid="saved-form-schedule">
                            <CalendarClock /> Schedule
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setPublishing(t)} disabled={isDefault} data-testid="saved-form-publish">
                            <Rocket /> Publish
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${t.name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={() => {
                                  actions.onLoad(t);
                                  onOpenChange(false);
                                }}
                                data-testid="saved-form-load"
                              >
                                <FolderOpen /> Open in the editor
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      {scheduling === t.id && (
                        <DaysForm
                          today={today}
                          submitLabel="Schedule"
                          onCancel={() => setScheduling(null)}
                          onSubmit={async (startsOn, endsOn) => {
                            if (await run(() => actions.onSchedule(t, startsOn, endsOn), `“${t.name}” scheduled for ${days(startsOn, endsOn)}`)) setScheduling(null);
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
      <ConfirmDialog
        open={!!publishing}
        onOpenChange={(o) => !o && setPublishing(null)}
        title={`Publish “${publishing?.name ?? ""}”?`}
        description={running ? `It becomes the default form. “${running.name}” stays live until ${day(running.endsOn)}, then this one takes over.` : "It becomes the form everyone books through, from now on."}
        confirmLabel="Publish"
        onConfirm={async () => {
          if (publishing) await run(() => actions.onPublish(publishing), `“${publishing.name}” published`);
          setPublishing(null);
        }}
      />
      <ConfirmDialog
        open={!!unscheduling}
        onOpenChange={(o) => !o && setUnscheduling(null)}
        title={unscheduling?.id === running?.id ? `End “${unscheduling?.name ?? ""}” now?` : `Remove “${unscheduling?.name ?? ""}” from the schedule?`}
        description={unscheduling?.id === running?.id ? `${defaultName} is served again straight away.` : "The saved form stays; only these days go."}
        confirmLabel={unscheduling?.id === running?.id ? "End now" : "Remove"}
        destructive
        onConfirm={async () => {
          if (unscheduling) await run(() => actions.onUnschedule(unscheduling), unscheduling.id === running?.id ? `${defaultName} is back` : "Removed from the schedule");
          setUnscheduling(null);
        }}
      />
    </Dialog>
  );
}

function StatusChip({ tone, children }: { tone: "live" | "scheduled"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-2xs font-medium",
        tone === "live" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-accent-soft text-accent-soft-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** First and last day, both included, in Vietnam days. */
function DaysForm({
  initial,
  today,
  lockStart = false,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { startsOn: string; endsOn: string };
  today: string;
  lockStart?: boolean;
  submitLabel: string;
  onSubmit: (startsOn: string, endsOn: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [startsOn, setStartsOn] = React.useState(initial?.startsOn ?? today);
  const [endsOn, setEndsOn] = React.useState(initial?.endsOn ?? "");
  const [busy, setBusy] = React.useState(false);
  const problem = endsOn ? scheduleDatesProblem(startsOn, endsOn, today) : null;
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-surface/60 p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (problem || !endsOn) return;
        setBusy(true);
        try {
          await onSubmit(startsOn, endsOn);
        } finally {
          setBusy(false);
        }
      }}
      data-testid="saved-form-days"
    >
      <label className="grid gap-1 text-2xs text-muted-foreground">
        First day
        <Input type="date" value={startsOn} min={lockStart ? undefined : today} disabled={lockStart} onChange={(e) => setStartsOn(e.target.value)} className="h-8 w-[9.5rem] text-[13px]" data-testid="saved-form-starts" />
      </label>
      <label className="grid gap-1 text-2xs text-muted-foreground">
        Last day
        <Input type="date" value={endsOn} min={startsOn || today} onChange={(e) => setEndsOn(e.target.value)} className="h-8 w-[9.5rem] text-[13px]" data-testid="saved-form-ends" />
      </label>
      <Button type="submit" size="sm" disabled={busy || !endsOn || !!problem} data-testid="saved-form-days-submit">
        {busy && <LoaderCircle className="animate-spin" />} {submitLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      {problem && <p className="w-full text-2xs text-destructive">{problem}</p>}
    </form>
  );
}

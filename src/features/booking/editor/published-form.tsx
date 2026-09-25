"use client";

import { format } from "date-fns";
import { CalendarClock, ClipboardCheck, ListChecks, LoaderCircle, Rocket } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookingFormTemplate } from "@/domain";
import { templateQuestionCount } from "@/domain";

/** What is known about the form stakeholders are being served. */
export interface PublishedFormInfo {
  template: BookingFormTemplate;
  /** What it was called when it was published. Null for one published before forms had names. */
  name: string | null;
  /** Null when it was published before that was recorded. */
  publishedAt: string | null;
  /** Tasks booked through it since it was published. */
  bookings: number;
  /** No form has been published: the built-in one is in use. */
  builtIn: boolean;
}

/** "RMIT Marketing · 25 Sep 2026, 10:42": the name a form is published under unless someone types another. */
export function defaultPublishName(teamName: string, at: Date = new Date()): string {
  return `${teamName} · ${format(at, "d MMM yyyy, HH:mm")}`;
}

/** The published form in three lines: what it is called, what it asks, and how much it has been used. */
export function PublishedFormCard({ info }: { info: PublishedFormInfo }) {
  const services = info.template.services.length;
  const when = info.publishedAt ? new Date(info.publishedAt) : null;
  const title = info.name ?? (info.builtIn ? "Built-in form" : "Published form");
  return (
    <div className="rounded-xl border border-border/70 bg-surface/50 px-3 py-2.5" data-testid="booking-published-form">
      <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">Published form</p>
      <p className="mt-0.5 truncate text-[13px] font-medium" title={title} data-testid="booking-published-name">
        {title}
      </p>
      <ul className="mt-1.5 space-y-1 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <ListChecks className="size-3 shrink-0" aria-hidden />
          <span data-testid="booking-published-fields">
            {templateQuestionCount(info.template)} questions · {services === 1 ? "1 service" : `${services} services`}
          </span>
        </li>
        <li className="flex items-center gap-1.5">
          <CalendarClock className="size-3 shrink-0" aria-hidden />
          <span data-testid="booking-published-at">{when && !Number.isNaN(when.getTime()) ? `Published ${format(when, "d MMM yyyy, HH:mm")}` : "Publish time not recorded"}</span>
        </li>
        <li className="flex items-center gap-1.5">
          <ClipboardCheck className="size-3 shrink-0" aria-hidden />
          <span data-testid="booking-published-bookings">
            <span className="font-medium text-foreground tabular">{info.bookings}</span> {info.bookings === 1 ? "task" : "tasks"} booked{when ? " since" : ""}
          </span>
        </li>
      </ul>
    </div>
  );
}

/** Publishing, with a name for what goes live. */
export function PublishDialog({
  open,
  onOpenChange,
  teamName,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  onPublish: (name: string) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent size="sm" data-testid="booking-publish-dialog">
        <DialogHeader>
          <DialogTitle>Publish this form?</DialogTitle>
          <DialogDescription>Everyone booking gets it straight away. Anyone mid-booking finishes on the form they started.</DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so the default name carries the time of opening. */}
        <PublishForm
          teamName={teamName}
          busy={busy}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (name) => {
            setBusy(true);
            try {
              await onPublish(name);
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PublishForm({ teamName, busy, onCancel, onSubmit }: { teamName: string; busy: boolean; onCancel: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = React.useState(() => defaultPublishName(teamName));
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(name.trim() || defaultPublishName(teamName));
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="publish-name">Name</Label>
        <Input id="publish-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus onFocus={(e) => e.currentTarget.select()} data-testid="booking-publish-name" />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy} data-testid="booking-publish-confirm">
          {busy ? <LoaderCircle className="animate-spin" /> : <Rocket />} Publish
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ClipboardCheck, History, ListChecks, LoaderCircle, Rocket, Split } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BookingFormPublication, BookingFormTemplate } from "@/domain";
import { defaultBookingFormTemplate, templateQuestionCount } from "@/domain";
import { PersonChip } from "@/features/members/person-chip";

/** What is known about the form stakeholders are being served. */
export interface PublishedFormInfo {
  template: BookingFormTemplate;
  /** What it was called when it was published. Null for one published before forms had names. */
  name: string | null;
  /** Null when it was published before that was recorded. */
  publishedAt: string | null;
  /** Who published it (their user id); null before that was recorded (migration 0119). */
  publishedBy?: string | null;
  /** Tasks booked through it since it was published. */
  bookings: number;
  /** No form has been published: the built-in one is in use. */
  builtIn: boolean;
}

/** "RMIT Marketing · 25 Sep 2026, 10:42": the name a form is published under unless someone types another. */
export function defaultPublishName(teamName: string, at: Date = new Date()): string {
  return `${teamName} · ${format(at, "d MMM yyyy, HH:mm")}`;
}

/**
 * The published form in three lines: what it is called, what it asks, and how
 * much it has been used. Clicking it opens that form. A div acting as the
 * button, since it holds a link of its own (who published it).
 */
export function PublishedFormCard({ info, onOpen }: { info: PublishedFormInfo; onOpen: () => void }) {
  const services = info.template.services.length;
  const when = info.publishedAt ? new Date(info.publishedAt) : null;
  const title = info.name ?? (info.builtIn ? "Built-in form" : "Published form");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      aria-label={`Open the published form, ${title}`}
      className="block w-full cursor-pointer rounded-xl border border-border/70 bg-surface/50 px-3 py-2.5 text-left transition-colors hover:border-ring/60 hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
      data-testid="booking-published-form"
    >
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
          <Split className="size-3 shrink-0" aria-hidden />
          {/* Each service and where it sends bookings, on hover. */}
          <SimpleTooltip label={<AllocationDetails template={info.template} />}>
            <span className="cursor-default truncate underline decoration-dotted underline-offset-2" data-testid="booking-published-allocation">
              {allocationRecap(info.template)}
            </span>
          </SimpleTooltip>
        </li>
        <li className="flex items-center gap-1.5">
          <CalendarClock className="size-3 shrink-0" aria-hidden />
          <span className="flex min-w-0 flex-wrap items-center gap-x-1" data-testid="booking-published-at">
            {when && !Number.isNaN(when.getTime()) ? (
              <>
                Published {format(when, "d MMM yyyy, HH:mm")}
                {info.publishedBy && (
                  <>
                    {" "}
                    by <PersonChip userId={info.publishedBy} testId="booking-published-by" plain />
                  </>
                )}
              </>
            ) : (
              "Publish time not recorded"
            )}
          </span>
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

/** Publishing, with a name for what goes live. A template goes live under its own name unless someone types another. */
export function PublishDialog({
  open,
  onOpenChange,
  teamName,
  templateName,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamName: string;
  templateName?: string;
  onPublish: (name: string) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent size="sm" data-testid="booking-publish-dialog">
        <DialogHeader>
          <DialogTitle>{templateName ? `Publish “${templateName}”?` : "Publish this form?"}</DialogTitle>
          <DialogDescription>Everyone booking gets it straight away. Anyone mid-booking finishes on the form they started.</DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so the default name carries the time of opening. */}
        <PublishForm
          teamName={teamName}
          templateName={templateName}
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

function PublishForm({ teamName, templateName, busy, onCancel, onSubmit }: { teamName: string; templateName?: string; busy: boolean; onCancel: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = React.useState(() => templateName ?? defaultPublishName(teamName));
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

/**
 * The past forms button on the published form card, and the list it opens:
 * every form this workspace has published, newest first (migration 0127),
 * with the one live now marked. Any other can go live again as it was.
 */
export function PastFormsButton({ onRepublished, className }: { onRepublished: () => Promise<void>; className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className={className} onClick={() => setOpen(true)} data-testid="booking-past-forms">
        <History /> Past forms
      </Button>
      {open && <PastFormsDialog onOpenChange={setOpen} onRepublished={onRepublished} />}
    </>
  );
}

function PastFormsDialog({ onOpenChange, onRepublished }: { onOpenChange: (open: boolean) => void; onRepublished: () => Promise<void> }) {
  const ws = useWorkspace();
  const services = useServices();
  const past = useQuery({
    queryKey: ["booking-publications", ws.workspace.id],
    queryFn: () => services.booking.listPublications(ws.workspace.id),
    staleTime: 0,
  });
  const [confirming, setConfirming] = React.useState<BookingFormPublication | null>(null);
  const [busy, setBusy] = React.useState(false);
  const rows = past.data ?? [];
  // The newest entry is the form live now, unless something changed the form without leaving one.
  const liveId = rows[0] && rows[0].publishedAt === ws.workspace.bookingFormPublishedAt ? rows[0].id : null;

  const republish = async (row: BookingFormPublication) => {
    setBusy(true);
    try {
      await services.booking.republish(ws.workspace.id, row.id, ws.currentUser.id);
      await onRepublished();
      toast.success(`“${titleOf(row)}” is live again`, { description: "Everyone sees it from now on." });
      setConfirming(null);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not publish that form");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(next) => !busy && onOpenChange(next)}>
        <DialogContent size="md" data-testid="booking-past-forms-dialog">
          <DialogHeader>
            <DialogTitle>Past forms</DialogTitle>
            <DialogDescription>Every form published here. Any of them can go live again.</DialogDescription>
          </DialogHeader>
          {past.isLoading ? (
            <p className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" /> Loading…
            </p>
          ) : past.isError ? (
            <p className="py-6 text-[13px] text-destructive">{past.error instanceof Error ? past.error.message : "Could not load the past forms."}</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-[13px] text-muted-foreground">Nothing published yet.</p>
          ) : (
            <ul className="scrollbar-thin -mx-1 max-h-[60vh] divide-y divide-border/60 overflow-y-auto px-1" data-testid="booking-past-forms-list">
              {rows.map((row) => {
                const template = row.template ?? defaultBookingFormTemplate();
                const count = template.services.length;
                const live = row.id === liveId;
                return (
                  <li key={row.id} className="flex items-center gap-3 py-2.5" data-testid="booking-past-form">
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
                        <span className="truncate">{titleOf(row)}</span>
                        {live && (
                          <Badge variant="primary" className="shrink-0">
                            Live
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-2xs text-muted-foreground">
                        {format(new Date(row.publishedAt), "d MMM yyyy, HH:mm")}
                        {row.publishedBy && ws.userById(row.publishedBy) && (
                          <>
                            {" "}
                            by <PersonChip userId={row.publishedBy} plain />
                          </>
                        )}
                        <span aria-hidden>·</span>
                        {templateQuestionCount(template)} questions · {count === 1 ? "1 service" : `${count} services`}
                      </p>
                    </div>
                    {!live && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(row)} disabled={busy} data-testid="booking-past-form-republish">
                        <Rocket /> Re-publish
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!confirming} onOpenChange={(next) => !busy && !next && setConfirming(null)}>
        <DialogContent size="sm" data-testid="booking-republish-dialog">
          <DialogHeader>
            <DialogTitle>{confirming ? `Publish “${titleOf(confirming)}” again?` : "Publish again?"}</DialogTitle>
            <DialogDescription>Everyone booking gets it straight away. Anyone mid-booking finishes on the form they started.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => confirming && void republish(confirming)} disabled={busy} data-testid="booking-republish-confirm">
              {busy ? <LoaderCircle className="animate-spin" /> : <Rocket />} Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function titleOf(row: Pick<BookingFormPublication, "name" | "template">): string {
  return row.name ?? (row.template ? "Published form" : "Built-in form");
}

/** Where the form's services send bookings, counted: "2 auto-allocated · 1 to a team · 1 to Task Allocation". */
export function allocationRecap(template: BookingFormTemplate): string {
  let auto = 0;
  let board = 0;
  let team = 0;
  let queue = 0;
  for (const service of template.services) {
    if (service.routing?.enabled) auto++;
    else if (service.boardId) board++;
    else if (service.teamId) team++;
    else queue++;
  }
  const parts = [
    auto && `${auto} auto-allocated`,
    board && `${board} to ${board === 1 ? "a board" : "boards"}`,
    team && `${team} to ${team === 1 ? "a team" : "teams"}`,
    queue && `${queue} to Task Allocation`,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Each service of the form, and where its bookings go: a team's board, Task Allocation, or its Auto-allocation rules. */
function AllocationDetails({ template }: { template: BookingFormTemplate }) {
  const ws = useWorkspace();
  const queue = ws.boards.find((b) => b.system === "TASK_ALLOCATION")?.name ?? "Task Allocation";
  const viaTeam = (teamId: string | null) => {
    const team = ws.teamById(teamId);
    if (!team) return queue;
    return ws.boardById(team.bookingBoardId ?? null)?.name ?? `${queue}, for ${team.name}`;
  };
  return (
    <ul className="max-w-xs space-y-1 text-left" data-testid="booking-published-allocation-details">
      {template.services.map((service) => {
        const routing = service.routing?.enabled ? service.routing : null;
        const rest = !routing
          ? service.boardId
            ? (ws.boardById(service.boardId)?.name ?? viaTeam(service.teamId))
            : viaTeam(service.teamId)
          : routing.otherwise.kind === "board"
            ? (ws.boardById(routing.otherwise.boardId)?.name ?? "a board no longer there")
            : routing.otherwise.kind === "allocation"
              ? queue
              : viaTeam(service.teamId);
        return (
          <li key={service.id}>
            <span className="font-medium">{service.name || "Untitled"}</span>
            {" → "}
            {routing ? `Auto-allocation (${routing.rules.length === 1 ? "1 rule" : `${routing.rules.length} rules`}, else ${rest})` : rest}
          </li>
        );
      })}
    </ul>
  );
}


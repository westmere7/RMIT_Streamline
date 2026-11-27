"use client";

import { Copy, RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarKeyDate, CalendarTaskRow, ColorToken, EntityId, HolidayKind, ISODate, LeaveEntry, LeaveKind, User, WorkspaceHoliday } from "@/domain";
import { HOLIDAY_KINDS, HOLIDAY_KIND_LABELS, LEAVE_KINDS, LEAVE_KIND_LABELS } from "@/domain";
import { useCalendarFeed, useCalendarMutations, useCalendarTasks } from "@/features/calendar/hooks";
import { shortDay, type TaskEvent } from "@/features/calendar/model";
import { colorClasses } from "@/lib/colors";
import { cn } from "@/lib/utils";

const NONE = "__none";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-[12.5px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function DeleteButton({ onDelete, busy }: { onDelete: () => void; busy: boolean }) {
  const [sure, setSure] = React.useState(false);
  return (
    <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={busy} onClick={() => (sure ? onDelete() : setSure(true))} data-testid="calendar-dialog-delete">
      {sure ? "Remove for good" : "Remove"}
    </Button>
  );
}

// ---- leave ------------------------------------------------------------------------

export interface LeaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: EntityId;
  me: EntityId;
  isAdmin: boolean;
  people: readonly User[];
  /** The entry to change, or the first day of a new one. */
  entry?: LeaveEntry | null;
  day?: ISODate | null;
  /** Whose new leave it is, where an admin started from someone's row. */
  defaultUserId?: EntityId;
  /** Reads dated task rows as the Calendar does, for the handover list. */
  toEvents?: (rows: CalendarTaskRow[]) => TaskEvent[];
  onOpenTask?: (task: TaskEvent) => void;
}

export function LeaveDialog(props: LeaveDialogProps) {
  const { open, onOpenChange, entry } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="leave-dialog">
        <DialogHeader>
          <DialogTitle>{entry ? "Leave" : "Add leave"}</DialogTitle>
          <DialogDescription>The whole team sees it on the Calendar.</DialogDescription>
        </DialogHeader>
        {open && <LeaveForm key={entry?.id ?? `new-${props.day}-${props.defaultUserId}`} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function LeaveForm({ onOpenChange, workspaceId, me, isAdmin, people, entry, day, defaultUserId, toEvents, onOpenTask }: LeaveDialogProps) {
  const m = useCalendarMutations(workspaceId);
  const [userId, setUserId] = React.useState<EntityId>(entry?.userId ?? defaultUserId ?? me);
  const [startsOn, setStartsOn] = React.useState<ISODate>(entry?.startsOn ?? day ?? "");
  const [endsOn, setEndsOn] = React.useState<ISODate>(entry?.endsOn ?? day ?? "");
  const [startHalf, setStartHalf] = React.useState(entry?.startHalf ?? false);
  const [endHalf, setEndHalf] = React.useState(entry?.endHalf ?? false);
  const [kind, setKind] = React.useState<LeaveKind>(entry?.kind ?? "ANNUAL");
  const [cover, setCover] = React.useState<EntityId | null>(entry?.coverUserId ?? null);
  const [note, setNote] = React.useState(entry?.note ?? "");

  const oneDay = startsOn && startsOn === endsOn;
  const canEdit = !entry || isAdmin || entry.userId === me;
  // The handover: what this person has due while away.
  const until = endsOn && endsOn >= startsOn ? endsOn : startsOn;
  const awayRows = useCalendarTasks(workspaceId, startsOn, until, !!toEvents && ISO_DAY.test(startsOn) && ISO_DAY.test(until));
  const dueAway = React.useMemo(
    () => (toEvents && awayRows.data ? toEvents(awayRows.data).filter((t) => !t.done && t.peopleIds.includes(userId) && (t.dueOn ?? t.endsOn) >= startsOn && (t.dueOn ?? t.endsOn) <= until) : []),
    [toEvents, awayRows.data, userId, startsOn, until],
  );
  const busy = m.createLeave.isPending || m.updateLeave.isPending || m.deleteLeave.isPending;
  const save = async () => {
    const fields = { userId, startsOn, endsOn: endsOn || startsOn, startHalf, endHalf: oneDay ? false : endHalf, kind, coverUserId: cover, note: note.trim() || null };
    if (oneDay && startHalf && endHalf) return;
    if (entry) await m.updateLeave.mutateAsync({ current: entry, patch: fields });
    else await m.createLeave.mutateAsync({ workspaceId, ...fields });
    onOpenChange(false);
  };

  return (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save().catch(() => undefined);
          }}
        >
          {isAdmin && (
            <Field label="Who">
              <Select value={userId} onValueChange={setUserId} disabled={!canEdit}>
                <SelectTrigger data-testid="leave-person">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {people.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="leave-from">
              <Input id="leave-from" type="date" value={startsOn} disabled={!canEdit} onChange={(e) => (setStartsOn(e.target.value), (!endsOn || endsOn < e.target.value) && setEndsOn(e.target.value))} required />
            </Field>
            <Field label="To" htmlFor="leave-to">
              <Input id="leave-to" type="date" value={endsOn} min={startsOn} disabled={!canEdit} onChange={(e) => setEndsOn(e.target.value)} required />
            </Field>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <label className="flex items-center gap-2">
              <Switch checked={startHalf} onCheckedChange={(v) => (setStartHalf(v), v && oneDay && setEndHalf(false))} disabled={!canEdit} aria-label={oneDay ? "Afternoon only" : "From midday"} />
              {oneDay ? "Afternoon only" : "From midday"}
            </label>
            <label className="flex items-center gap-2">
              <Switch checked={endHalf} onCheckedChange={(v) => (setEndHalf(v), v && oneDay && setStartHalf(false))} disabled={!canEdit} aria-label={oneDay ? "Morning only" : "Back at midday"} />
              {oneDay ? "Morning only" : "Back at midday"}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={kind} onValueChange={(v) => setKind(v as LeaveKind)} disabled={!canEdit}>
                <SelectTrigger data-testid="leave-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {LEAVE_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cover">
              <Select value={cover ?? NONE} onValueChange={(v) => setCover(v === NONE ? null : v)} disabled={!canEdit}>
                <SelectTrigger data-testid="leave-cover">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nobody</SelectItem>
                  {people
                    .filter((u) => u.id !== userId)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.displayName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Note" htmlFor="leave-note">
            <Textarea id="leave-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} disabled={!canEdit} />
          </Field>
          {dueAway.length > 0 && (
            <div className="grid gap-1 rounded-lg border border-amber-300/70 bg-amber-50/60 p-2 dark:border-amber-500/30 dark:bg-amber-500/10" data-testid="leave-handover">
              <div className="text-[12.5px] font-medium">{dueAway.length} due while away</div>
              {dueAway.slice(0, 6).map((t) => (
                <button key={t.itemId} type="button" onClick={() => onOpenTask?.(t)} className="flex items-center gap-2 rounded px-1 text-left text-[12.5px] hover:bg-card">
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{shortDay(t.dueOn ?? t.endsOn)}</span>
                </button>
              ))}
              {dueAway.length > 6 && <span className="px-1 text-[12px] text-muted-foreground">+{dueAway.length - 6} more</span>}
            </div>
          )}
          <DialogFooter className="gap-2">
            {entry && canEdit && (
              <DeleteButton
                busy={busy}
                onDelete={() =>
                  void m.deleteLeave
                    .mutateAsync(entry.id)
                    .then(() => onOpenChange(false))
                    .catch(() => undefined)
                }
              />
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={busy || !startsOn} data-testid="leave-save">
                Save
              </Button>
            )}
          </DialogFooter>
        </form>
  );
}

// ---- holidays ---------------------------------------------------------------------

type HolidayDialogProps = { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: EntityId; holiday?: WorkspaceHoliday | null; day?: ISODate | null; canEdit: boolean };

export function HolidayDialog(props: HolidayDialogProps) {
  const { open, onOpenChange, holiday } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="holiday-dialog">
        <DialogHeader>
          <DialogTitle>{holiday ? holiday.name : "Add holiday"}</DialogTitle>
          <DialogDescription>Nobody works it: deadlines on it are flagged.</DialogDescription>
        </DialogHeader>
        {open && <HolidayForm key={holiday?.id ?? `new-${props.day}`} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function HolidayForm({ onOpenChange, workspaceId, holiday, day, canEdit }: HolidayDialogProps) {
  const m = useCalendarMutations(workspaceId);
  const [name, setName] = React.useState(holiday?.name ?? "");
  const [startsOn, setStartsOn] = React.useState(holiday?.startsOn ?? day ?? "");
  const [endsOn, setEndsOn] = React.useState(holiday?.endsOn ?? day ?? "");
  const [half, setHalf] = React.useState<"AM" | "PM" | null>(holiday?.halfDay ?? null);
  const [kind, setKind] = React.useState<HolidayKind>(holiday?.kind ?? "PUBLIC");
  const [note, setNote] = React.useState(holiday?.note ?? "");
  const busy = m.createHoliday.isPending || m.updateHoliday.isPending || m.deleteHoliday.isPending;
  const oneDay = startsOn && startsOn === endsOn;
  const save = async () => {
    const fields = { name, startsOn, endsOn: endsOn || startsOn, halfDay: oneDay ? half : null, kind, note: note.trim() || null };
    if (holiday) await m.updateHoliday.mutateAsync({ current: holiday, patch: fields });
    else await m.createHoliday.mutateAsync({ workspaceId, ...fields });
    onOpenChange(false);
  };
  return (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save().catch(() => undefined);
          }}
        >
          <Field label="Name" htmlFor="holiday-name">
            <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required disabled={!canEdit} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="holiday-from">
              <Input id="holiday-from" type="date" value={startsOn} disabled={!canEdit} onChange={(e) => (setStartsOn(e.target.value), (!endsOn || endsOn < e.target.value) && setEndsOn(e.target.value))} required />
            </Field>
            <Field label="To" htmlFor="holiday-to">
              <Input id="holiday-to" type="date" value={endsOn} min={startsOn} disabled={!canEdit} onChange={(e) => setEndsOn(e.target.value)} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={kind} onValueChange={(v) => setKind(v as HolidayKind)} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOLIDAY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {HOLIDAY_KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Length">
              <Select value={oneDay ? (half ?? "DAY") : "DAY"} onValueChange={(v) => setHalf(v === "DAY" ? null : (v as "AM" | "PM"))} disabled={!canEdit || !oneDay}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAY">Whole day</SelectItem>
                  <SelectItem value="AM">Morning off</SelectItem>
                  <SelectItem value="PM">Afternoon off</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Note" htmlFor="holiday-note">
            <Textarea id="holiday-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} disabled={!canEdit} />
          </Field>
          <DialogFooter className="gap-2">
            {holiday && canEdit && (
              <DeleteButton
                busy={busy}
                onDelete={() =>
                  void m.deleteHoliday
                    .mutateAsync(holiday.id)
                    .then(() => onOpenChange(false))
                    .catch(() => undefined)
                }
              />
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={busy || !name.trim() || !startsOn} data-testid="holiday-save">
                Save
              </Button>
            )}
          </DialogFooter>
        </form>
  );
}

// ---- key dates ----------------------------------------------------------------------

export const KEY_DATE_COLORS: ColorToken[] = ["indigo", "violet", "sky", "teal", "green", "amber", "orange", "rose"];

type KeyDateDialogProps = { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: EntityId; keyDate?: CalendarKeyDate | null; day?: ISODate | null; canEdit: boolean };

export function KeyDateDialog(props: KeyDateDialogProps) {
  const { open, onOpenChange, keyDate } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="key-date-dialog">
        <DialogHeader>
          <DialogTitle>{keyDate ? keyDate.name : "Add key date"}</DialogTitle>
          <DialogDescription>A launch, an intake or a campaign the team plans around.</DialogDescription>
        </DialogHeader>
        {open && <KeyDateForm key={keyDate?.id ?? `new-${props.day}`} {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function KeyDateForm({ onOpenChange, workspaceId, keyDate, day, canEdit }: KeyDateDialogProps) {
  const m = useCalendarMutations(workspaceId);
  const [name, setName] = React.useState(keyDate?.name ?? "");
  const [startsOn, setStartsOn] = React.useState(keyDate?.startsOn ?? day ?? "");
  const [endsOn, setEndsOn] = React.useState(keyDate?.endsOn ?? day ?? "");
  const [color, setColor] = React.useState<string>(keyDate?.color ?? "indigo");
  const [note, setNote] = React.useState(keyDate?.note ?? "");
  const busy = m.createKeyDate.isPending || m.updateKeyDate.isPending || m.deleteKeyDate.isPending;
  const save = async () => {
    const fields = { name, startsOn, endsOn: endsOn || startsOn, color, note: note.trim() || null };
    if (keyDate) await m.updateKeyDate.mutateAsync({ current: keyDate, patch: fields });
    else await m.createKeyDate.mutateAsync({ workspaceId, ...fields });
    onOpenChange(false);
  };
  return (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save().catch(() => undefined);
          }}
        >
          <Field label="Name" htmlFor="key-date-name">
            <Input id="key-date-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required disabled={!canEdit} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" htmlFor="key-date-from">
              <Input id="key-date-from" type="date" value={startsOn} disabled={!canEdit} onChange={(e) => (setStartsOn(e.target.value), (!endsOn || endsOn < e.target.value) && setEndsOn(e.target.value))} required />
            </Field>
            <Field label="To" htmlFor="key-date-to">
              <Input id="key-date-to" type="date" value={endsOn} min={startsOn} disabled={!canEdit} onChange={(e) => setEndsOn(e.target.value)} required />
            </Field>
          </div>
          <Field label="Colour">
            <div className="flex gap-1.5">
              {KEY_DATE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  aria-pressed={color === c}
                  disabled={!canEdit}
                  onClick={() => setColor(c)}
                  className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", colorClasses(c).dot, color === c && "ring-2 ring-foreground/60")}
                />
              ))}
            </div>
          </Field>
          <Field label="Note" htmlFor="key-date-note">
            <Textarea id="key-date-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} disabled={!canEdit} />
          </Field>
          <DialogFooter className="gap-2">
            {keyDate && canEdit && (
              <DeleteButton
                busy={busy}
                onDelete={() =>
                  void m.deleteKeyDate
                    .mutateAsync(keyDate.id)
                    .then(() => onOpenChange(false))
                    .catch(() => undefined)
                }
              />
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {canEdit ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <Button type="submit" disabled={busy || !name.trim() || !startsOn} data-testid="key-date-save">
                Save
              </Button>
            )}
          </DialogFooter>
        </form>
  );
}

// ---- feed ---------------------------------------------------------------------------

export function FeedDialog({ open, onOpenChange, workspaceId, userId }: { open: boolean; onOpenChange: (o: boolean) => void; workspaceId: EntityId; userId: EntityId }) {
  const { feed, create, replace, stop } = useCalendarFeed(workspaceId, userId, open);
  const token = feed.data?.token ?? null;
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/api/calendar/${token}.ics` : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="feed-dialog">
        <DialogHeader>
          <DialogTitle>Subscribe</DialogTitle>
          <DialogDescription>Your tasks, leave and the holidays in Google, Outlook or Apple Calendar. Keep the address private.</DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} data-testid="feed-url" />
              <Button type="button" variant="outline" size="icon" aria-label="Copy" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Copied"))}>
                <Copy />
              </Button>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => stop.mutate()} disabled={stop.isPending}>
                Stop
              </Button>
              <Button type="button" variant="outline" onClick={() => replace.mutate()} disabled={replace.isPending}>
                <RefreshCw /> New address
              </Button>
            </div>
          </div>
        ) : (
          <DialogFooter>
            <Button type="button" onClick={() => create.mutate()} disabled={create.isPending || feed.isLoading} data-testid="feed-create">
              Make my address
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

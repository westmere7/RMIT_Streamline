"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ClipboardPen, Copy, ExternalLink, EyeOff, Globe, GripVertical, KeyRound, Loader2, Lock, RefreshCw, Settings2, Users } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_BOOKING_HEADLINE,
  DEFAULT_BOOKING_LEAD,
  MAX_BOOKING_HEADLINE,
  BOOKING_SCALE_MAX,
  BOOKING_SCALE_MIN,
  BOOKING_SCALE_STEP,
  clampBookingScale,
  COLUMN_TYPE_LABELS,
  MAX_BOOKING_LEAD,
  MAX_CREATIVE_TEAM_NAME,
  PORTAL_DEFAULT_RANGES,
  PORTAL_THEMES,
  PORTAL_VIEWS,
  parsePortalRange,
  portalRangeLabel,
  resolvePortalColumnLayout,
  type PortalColumnCandidate,
  type PortalColumnEntry,
  type PortalPresentation,
  type StakeholderPortal,
} from "@/domain";
import { COLUMN_TYPE_ICONS } from "@/features/boards/components/column-type-icons";
import { copyToClipboard } from "@/features/members/hooks";
import { portalUrl, usePortalMutations, usePortalOverview } from "@/features/portal/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { DepartmentOverview } from "@/services/stakeholder-portal-service";

/**
 * The management side of the portal.
 *
 * One portal, two links, and the page is built around handing them out: each
 * link is a tile with its figure, its copy and open buttons, and its own
 * settings behind a button of its own. What belongs to both links at once —
 * the password and the token itself — sits in the card's header.
 */
export function PortalAdmin() {
  const ws = useWorkspace();
  const overview = usePortalOverview();
  const admin = canManageWorkspace(ws.permissions);

  if (!admin) {
    return <EmptyState icon={Lock} title="The portal is managed by workspace admins" description="You can still book a task from the tab beside this one." />;
  }

  return (
    <div className="space-y-5">
      {overview.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      )}
      {overview.isError && <ErrorState title="Could not load the portal." error={overview.error} onRetry={() => overview.refetch()} />}
      {overview.data && <PortalCard portal={overview.data.portal} rows={overview.data.departments} columns={overview.data.columns} />}
    </div>
  );
}

/** The portal: whether it is open, its credentials, and its two links. */
function PortalCard({ portal, rows, columns }: { portal: StakeholderPortal; rows: DepartmentOverview[]; columns: PortalColumnCandidate[] }) {
  const { setEnabled, setPresentation } = usePortalMutations();
  const [editing, setEditing] = React.useState<"portal" | "booking" | null>(null);
  const open = portal.enabled;
  const url = portalUrl(portal.token);
  const bookingUrl = `${url}/book`;
  const booked = rows.reduce((sum, row) => sum + row.requests, 0);
  const active = rows.filter((row) => row.requests > 0).length;

  return (
    <section className="rounded-2xl border border-border/70 bg-card" data-testid="portal-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-5 py-4 max-md:px-4">
        <h3 className="flex min-w-0 flex-1 items-center gap-2.5 text-[16px] font-semibold tracking-tight">
          Portal
          <Badge variant={open ? "success" : "muted"} className="gap-1.5" data-testid="portal-state">
            {open && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
            {open ? "Open" : "Closed"}
          </Badge>
          {portal.passwordHash && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" aria-hidden /> Password
            </Badge>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5 max-md:w-full max-md:flex-wrap">
          {/* Both links share one credential, so what guards it is here rather
              than in either link's settings. */}
          <PasswordButton portal={portal} />
          <RegenerateButton />
        </div>
      </div>

      {/* Two doors into the same portal. The first is where somebody looks at
          the work being done for them; the second opens straight on the form,
          for when what you want from them is a request rather than a visit.
          The addresses themselves stay out of sight: nobody reads a token, they
          copy it, and the two buttons are what they come here for. */}
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <LinkTile
          icon={Globe}
          label="Portal"
          lead={
            <>
              Departments see their work. Opens on the {portal.defaultView} view
              {portal.showRecap ? ", with the figures" : ""}
              {portal.passwordHash ? ", behind the password" : ""}.
            </>
          }
          figure={rows.length}
          figureLabel={rows.length === 1 ? "department" : "departments"}
          aside={rows.length > 0 ? `${active} of ${rows.length} have booked` : "none set up yet"}
          url={url}
          href={routes.portal(portal.token)}
          testId="portal-link"
          copyTestId="portal-copy"
          onCopy={() => void copyToClipboard(url, "Link copied")}
          onSettings={() => setEditing("portal")}
          open={open}
          // The portal's own switch: its address, and the form behind it, answer or do not.
          toggle={{
            on: open,
            pending: setEnabled.isPending,
            onChange: (next) => setEnabled.mutate(next),
            label: open ? "Close the portal" : "Open the portal",
            testId: "portal-toggle",
          }}
        >
          <StakeholderList rows={rows} />
        </LinkTile>
        <LinkTile
          icon={ClipboardPen}
          label="Booking form"
          lead={
            !open ? (
              <>Lives inside the portal, so it opens when the portal does.</>
            ) : portal.allowBooking ? (
              <>Opens straight on the form. Requests land on the board.</>
            ) : (
              <>Not taking requests.</>
            )
          }
          figure={booked}
          figureLabel={booked === 1 ? "request booked" : "requests booked"}
          aside="so far"
          url={bookingUrl}
          href={`${routes.portal(portal.token)}/book`}
          testId="portal-booking-link"
          copyTestId="portal-booking-link-copy"
          onCopy={() => void copyToClipboard(bookingUrl, "Booking link copied")}
          onSettings={() => setEditing("booking")}
          open={open && portal.allowBooking}
          // Taking requests is the form's own switch. It waits on the portal's.
          toggle={{
            on: open && portal.allowBooking,
            pending: setPresentation.isPending,
            disabled: !open,
            onChange: (next) =>
              setPresentation.mutate({ allowBooking: next }, { onSuccess: () => toast.success(next ? "Taking requests" : "Not taking requests") }),
            label: portal.allowBooking ? "Stop taking requests" : "Take requests",
            hint: open ? undefined : "Open the portal first",
            testId: "portal-allow-booking",
          }}
        />
      </div>

      <SettingsDialog kind="portal" portal={portal} columns={columns} open={editing === "portal"} onOpenChange={(next) => setEditing(next ? "portal" : null)} />
      <SettingsDialog kind="booking" portal={portal} columns={columns} open={editing === "booking"} onOpenChange={(next) => setEditing(next ? "booking" : null)} />
    </section>
  );
}

/** Sets, changes or removes the password both links ask for. */
function PasswordButton({ portal }: { portal: StakeholderPortal }) {
  const { setPassword } = usePortalMutations();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setValue("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="portal-password-toggle">
          <KeyRound /> {portal.passwordHash ? "Change password" : "Add password"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!value.trim()) return;
            // Closed only once the write has landed. Hashing is deliberately
            // slow, and closing first made the form look finished while it
            // was not; navigate in that window and the password was lost.
            await setPassword.mutateAsync({ password: value });
            setValue("");
            setOpen(false);
          }}
        >
          <p className="text-[13px] font-medium">{portal.passwordHash ? "Change the password" : "Ask for a password"}</p>
          <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="New password" aria-label="Portal password" autoComplete="new-password" autoFocus data-testid="portal-password-input" />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!value.trim() || setPassword.isPending}>
              {setPassword.isPending ? "Setting…" : "Set password"}
            </Button>
            {portal.passwordHash && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={setPassword.isPending}
                onClick={async () => {
                  await setPassword.mutateAsync({ password: null });
                  setOpen(false);
                }}
                data-testid="portal-password-remove"
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** A new token for both links. The old one stops working at once, so it asks first. */
function RegenerateButton() {
  const { regenerate } = usePortalMutations();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirm(true)} data-testid="portal-regenerate">
        <RefreshCw /> New link
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Issue a new link?"
        description="Both links stop working straight away, including for anyone reading the portal right now. Their requests are untouched."
        confirmLabel="Issue new link"
        destructive
        onConfirm={async () => {
          await regenerate.mutateAsync();
        }}
      />
    </>
  );
}

/**
 * One of the portal's two doors, as a tile: what it is, one figure that says
 * how it is doing, and the things anybody does with it — copy the link, open
 * it, tune it. The address is kept for tests and screen readers and shown to
 * nobody; a token is not something a person reads.
 */
export function LinkTile({
  icon: Icon,
  label,
  lead,
  figure,
  figureLabel,
  aside,
  url,
  href,
  testId,
  copyTestId,
  onCopy,
  onSettings,
  open,
  toggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  lead: React.ReactNode;
  figure: number;
  figureLabel: string;
  aside: string;
  url: string;
  href: string;
  testId: string;
  copyTestId: string;
  onCopy: () => void;
  onSettings: () => void;
  open: boolean;
  /** The link's on/off switch, top right where it is seen first. */
  toggle: { on: boolean; pending: boolean; disabled?: boolean; onChange: (next: boolean) => void; label: string; hint?: string; testId: string };
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  const dim = !open && "opacity-60";
  // The tile's own blank space opens the link, as its Open button does. A
  // click that lands on anything with a job of its own (the switch, settings,
  // the buttons below, a link) is left to that.
  const openFromTile = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, label, [role=switch], [role=dialog]")) return;
    if (window.getSelection()?.toString()) return;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    // A solid fill a step up from the section and a full border, so the two
    // doors read as things to pick up rather than as part of the page. No shadow.
    <div
      className="flex min-w-0 cursor-pointer flex-col rounded-xl border border-border bg-surface transition-colors hover:border-ring/50 dark:border-white/10 dark:bg-surface-strong dark:hover:border-ring/50"
      onClick={openFromTile}
      title={`Open the ${label.toLowerCase()} in a new tab`}
      data-testid={`${testId}-block`}
    >
      <div className="flex items-start gap-3 p-4">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", dim)}>
          <Icon className="size-4" />
        </span>
        <div className={cn("min-w-0 flex-1", dim)}>
          <div className="flex items-center gap-2">
            <h4 className="text-[14px] font-semibold">{label}</h4>
            {!open && (
              <Badge variant="muted" className="gap-1">
                <EyeOff className="size-3" aria-hidden /> Not serving
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{lead}</p>
        </div>
        {/* Always at full strength, even on a link that is not serving: this is how it gets turned back on. */}
        <div className="flex shrink-0 items-center gap-1">
          <label className={cn("flex h-8 items-center gap-2 px-1 text-[12px] font-medium", toggle.on ? "text-foreground" : "text-muted-foreground", toggle.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")} title={toggle.hint}>
            {toggle.pending && <Loader2 aria-hidden className="size-3.5 animate-spin" />}
            <span>{toggle.on ? "On" : "Off"}</span>
            <Switch size="sm" checked={toggle.on} disabled={toggle.disabled || toggle.pending} onCheckedChange={toggle.onChange} aria-label={toggle.label} data-testid={toggle.testId} />
          </label>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={onSettings} aria-label={`${label} settings`} data-testid={`${testId}-settings`}>
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className={cn("flex-1 px-4 pb-4", dim)}>
        <p className="flex items-baseline gap-1.5">
          <span className="text-[22px] leading-none font-semibold tabular" data-testid={`${testId}-figure`}>
            {figure}
          </span>
          <span className="text-[13px] font-medium">{figureLabel}</span>
          <span className="text-2xs text-muted-foreground">· {aside}</span>
        </p>
        {children && <div className="mt-3">{children}</div>}
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-4 py-2.5">
        <Button variant="ghost" size="sm" asChild>
          <a href={href} target="_blank" rel="noreferrer noopener" aria-label={`Open the ${label.toLowerCase()} in a new tab`} data-testid={`${testId}-open`}>
            Open <ExternalLink className="size-3.5" />
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={cn("transition-colors", copied && "border-green-500/50 text-green-700 dark:text-green-300")}
          aria-label={`Copy the ${label.toLowerCase()} link`}
          onClick={() => {
            onCopy();
            setCopied(true);
          }}
          data-testid={copyTestId}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {/* The address, for anything that has to read it: a test, a screen reader. Nobody else. */}
      <span className="sr-only" data-testid={testId}>
        {url}
      </span>
    </div>
  );
}

/**
 * Who the portal carries work for.
 *
 * Read-only on purpose: these words come from the stakeholder groups in
 * Settings → Departments, which stays the one place they are written. Shown under
 * the link because "which stakeholders does this link show" is the first thing
 * anyone asks of it, and the counts say which of them have ever booked anything.
 */
function StakeholderList({ rows }: { rows: DepartmentOverview[] }) {
  const ws = useWorkspace();
  if (rows.length === 0) {
    return (
      <p className="flex items-start gap-1.5 text-2xs text-muted-foreground" data-testid="portal-stakeholders">
        <Users className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          No departments yet. Add them in{" "}
          <a href={routes.settings(ws.slug, "departments")} className="font-medium text-foreground underline-offset-2 hover:underline">
            Settings → Departments
          </a>{" "}
          and the portal offers each as a filter.
        </span>
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Departments the portal shows" data-testid="portal-stakeholders">
      {rows.map(({ department, requests }) => (
        <li
          key={department.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-2xs transition-colors hover:border-ring/50"
          data-testid="portal-stakeholder-row"
          data-department={department.name}
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colorClasses(department.color).dot)} />
          <span className="font-medium">{department.name}</span>
          <span className={cn("tabular", requests > 0 ? "text-foreground/70" : "text-muted-foreground/60")}>{requests > 0 ? `${requests} booked` : "none yet"}</span>
        </li>
      ))}
    </ul>
  );
}

// ---- each link's settings ------------------------------------------------------

/** The settings a panel edits. A draft of these is what Save writes and Discard throws away. */
type Draft = Required<Pick<PortalPresentation, "defaultView" | "defaultRange" | "defaultTheme" | "themeSwitch" | "showRecap" | "showItemGroups" | "allowBooking" | "bookingTheme" | "bookingThemeSwitch" | "bookingSignIn" | "bookingScale" | "bookingScaleSwitch">> & {
  bookingHeadline: string;
  bookingLead: string;
  teamName: string;
  /** Every column on offer, in order, shown or not. */
  columnLayout: PortalColumnEntry[];
};

/** Which fields each panel owns. Anything else in the draft is left exactly as it was. */
const PANEL_FIELDS = {
  portal: ["teamName", "defaultView", "defaultRange", "defaultTheme", "themeSwitch", "columnLayout", "showRecap", "showItemGroups"],
  booking: ["bookingTheme", "bookingThemeSwitch", "bookingHeadline", "bookingLead", "bookingSignIn", "bookingScale", "bookingScaleSwitch"],
} as const satisfies Record<string, ReadonlyArray<keyof Draft>>;

function draftOf(portal: StakeholderPortal, teamName: string, columns: readonly PortalColumnCandidate[]): Draft {
  return {
    defaultView: portal.defaultView,
    defaultRange: portal.defaultRange,
    defaultTheme: portal.defaultTheme,
    themeSwitch: portal.themeSwitch,
    columnLayout: resolvePortalColumnLayout(portal.columnLayout, portal.hiddenColumns, columns),
    showRecap: portal.showRecap,
    showItemGroups: portal.showItemGroups,
    allowBooking: portal.allowBooking,
    bookingTheme: portal.bookingTheme,
    bookingThemeSwitch: portal.bookingThemeSwitch,
    bookingSignIn: portal.bookingSignIn,
    bookingScale: portal.bookingScale ?? 100,
    bookingScaleSwitch: portal.bookingScaleSwitch ?? true,
    bookingHeadline: portal.bookingHeadline ?? "",
    bookingLead: portal.bookingLead ?? "",
    teamName,
  };
}

function same(a: unknown, b: unknown): boolean {
  // The column layout is an ordered list of objects: order and every flag count.
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return typeof a === "string" && typeof b === "string" ? a.trim() === b.trim() : a === b;
}

/**
 * One link's settings, as a panel over the page.
 *
 * Edits are a draft until Save, which writes everything that changed at once.
 * Every control used to write the moment it was touched, which made a panel of
 * them slow to use and put half-finished changes in front of stakeholders.
 * Closing with changes unsaved asks before it throws them away.
 */
function SettingsDialog({ kind, portal, columns, open, onOpenChange }: { kind: keyof typeof PANEL_FIELDS; portal: StakeholderPortal; columns: PortalColumnCandidate[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const { saveSettings } = usePortalMutations();
  const storedName = ws.workspace.creativeTeamName ?? "";
  const initial = React.useMemo(() => draftOf(portal, storedName, columns), [portal, storedName, columns]);
  const [draft, setDraft] = React.useState(initial);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  // Each opening starts from what is saved. Noticed during render, so the
  // panel never paints a moment of the previous draft.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(initial);
  }

  const fields = PANEL_FIELDS[kind];
  const changed = fields.filter((field) => !same(draft[field], initial[field]));
  const dirty = changed.length > 0;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const patch: PortalPresentation = {};
    let teamName: string | undefined;
    for (const field of changed) {
      if (field === "teamName") teamName = draft.teamName;
      else (patch as Record<string, unknown>)[field] = draft[field];
    }
    await saveSettings.mutateAsync({ patch, teamName });
    onOpenChange(false);
  };

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (dirty && !saveSettings.isPending) setConfirmDiscard(true);
    else onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={requestClose}>
        <DialogContent
          size="lg"
          className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0"
          // Focus the panel, not its first field: landing in the team name with
          // the text selected made one stray keystroke replace it.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          data-testid={`portal-${kind}-settings`}
        >
          <DialogHeader className="border-b border-border/60 px-6 pt-5 pb-4">
            <DialogTitle className="flex items-center gap-2.5">
              {kind === "portal" ? <Globe className="size-4 text-primary" aria-hidden /> : <ClipboardPen className="size-4 text-accent-soft-foreground" aria-hidden />}
              {kind === "portal" ? "Portal settings" : "Booking form settings"}
            </DialogTitle>
            <DialogDescription>{kind === "portal" ? "How the portal looks to departments." : "How the booking form looks, and whether it takes requests."}</DialogDescription>
          </DialogHeader>

          <div className="scrollbar-thin grid content-start gap-5 overflow-y-auto px-6 py-5">
            {kind === "portal" ? <PortalFields draft={draft} set={set} placeholder={ws.workspace.name} columns={columns} /> : <BookingFields draft={draft} set={set} />}
          </div>

          <DialogFooter className="items-center border-t border-border/60 px-6 py-3.5">
            <span className="mr-auto text-2xs text-muted-foreground" aria-live="polite">
              {dirty ? `${changed.length} unsaved ${changed.length === 1 ? "change" : "changes"}` : "No changes"}
            </span>
            <Button variant="ghost" size="sm" disabled={!dirty || saveSettings.isPending} onClick={() => setDraft(initial)} data-testid="portal-settings-discard">
              Discard
            </Button>
            <Button size="sm" disabled={!dirty || saveSettings.isPending} onClick={() => void save()} data-testid="portal-settings-save">
              {saveSettings.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard your changes?"
        description="They have not been saved."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          setDraft(initial);
          onOpenChange(false);
        }}
      />
    </>
  );
}

type SetField = <K extends keyof Draft>(key: K, value: Draft[K]) => void;

function PortalFields({ draft, set, placeholder, columns }: { draft: Draft; set: SetField; placeholder: string; columns: PortalColumnCandidate[] }) {
  return (
    <>
      <Field label="Team name">
        <Input value={draft.teamName} onChange={(e) => set("teamName", e.target.value)} maxLength={MAX_CREATIVE_TEAM_NAME} placeholder={placeholder} aria-label="Creative team name" className="h-9" data-testid="portal-team-name" />
      </Field>
      <Field label="Opens on">
        <Choice options={PORTAL_VIEWS.map((view) => ({ value: view, label: view }))} value={draft.defaultView} onChange={(value) => set("defaultView", value as Draft["defaultView"])} name="View the portal opens on" testId="portal-view" />
      </Field>
      <Field label="Default span">
        <Choice
          options={PORTAL_DEFAULT_RANGES.map((range) => ({ value: range, label: portalRangeLabel(parsePortalRange(range)!) }))}
          value={draft.defaultRange}
          onChange={(value) => set("defaultRange", value as Draft["defaultRange"])}
          name="Period the portal opens on"
          testId="portal-range"
          plain
        />
      </Field>
      <ThemeField theme={draft.defaultTheme} onTheme={(value) => set("defaultTheme", value)} allowSwitch={draft.themeSwitch} onAllowSwitch={(value) => set("themeSwitch", value)} testId="portal-default-theme" />
      <Field label="Columns">
        <ColumnLayoutEditor layout={draft.columnLayout} columns={columns} onChange={(next) => set("columnLayout", next)} />
      </Field>
      <Field label="Shows">
        <div className="grid gap-2.5">
          <Toggle label="The figures" checked={draft.showRecap} onChange={(value) => set("showRecap", value)} testId="portal-show-recap" />
          <Toggle label="The boards' own groups" checked={draft.showItemGroups} onChange={(value) => set("showItemGroups", value)} testId="portal-show-item-groups" />
        </div>
      </Field>
    </>
  );
}

/**
 * The portal board's columns, as a summary in the settings and the full list in
 * a pop-up: the shown ones in their order, dragged to reorder, and the hidden
 * ones under them. Special columns wear the green their type has in a board's
 * column menu. A board's own column starts hidden: showing it is what publishes it.
 */
function ColumnLayoutEditor({ layout, columns, onChange }: { layout: PortalColumnEntry[]; columns: PortalColumnCandidate[]; onChange: (next: PortalColumnEntry[]) => void }) {
  const byKey = React.useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const rows = layout.filter((entry) => byKey.has(entry.key));
  const shown = rows.filter((entry) => !entry.hidden);
  const hidden = rows.filter((entry) => entry.hidden);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = layout.findIndex((entry) => entry.key === active.id);
    const to = layout.findIndex((entry) => entry.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(layout, from, to));
  };
  // Shown again, a column goes to the end of the shown ones rather than back to wherever it once sat.
  const toggle = (key: string, on: boolean) => {
    const entry = layout.find((e) => e.key === key);
    if (!entry) return;
    const rest = layout.filter((e) => e.key !== key);
    if (!on) return onChange(layout.map((e) => (e.key === key ? { ...e, hidden: true } : e)));
    const lastShown = rest.reduce((at, e, index) => (!e.hidden && byKey.has(e.key) ? index : at), -1);
    onChange([...rest.slice(0, lastShown + 1), { ...entry, hidden: false }, ...rest.slice(lastShown + 1)]);
  };
  const SUMMARY = 6;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/40"
          data-testid="portal-columns-open"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {shown.slice(0, SUMMARY).map((entry) => (
              <span key={entry.key} className="rounded-md bg-surface-strong px-1.5 py-0.5 text-2xs font-medium">
                {byKey.get(entry.key)!.name}
              </span>
            ))}
            {shown.length > SUMMARY && <span className="text-2xs text-muted-foreground">+{shown.length - SUMMARY}</span>}
          </span>
          <span className="shrink-0 text-2xs text-muted-foreground tabular">
            {shown.length} of {rows.length}
          </span>
          <span className="shrink-0 text-[13px] font-medium text-foreground/80 group-hover:text-foreground">Edit</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 p-0" data-testid="portal-columns">
        <div className="flex items-baseline justify-between border-b border-border/60 px-3 py-2.5">
          <p className="text-[13px] font-semibold">Columns</p>
          <p className="text-2xs text-muted-foreground">Drag to reorder</p>
        </div>
        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5">
          <SectionLabel>Shown · {shown.length}</SectionLabel>
          <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis, restrictToParentElement]} onDragEnd={onDragEnd}>
            <SortableContext items={shown.map((entry) => entry.key)} strategy={verticalListSortingStrategy}>
              <ul>
                {shown.map((entry) => (
                  <ColumnLayoutRow key={entry.key} entry={entry} column={byKey.get(entry.key)!} onToggle={(on) => toggle(entry.key, on)} sortable />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {hidden.length > 0 && (
            <>
              <SectionLabel className="mt-2">Hidden · {hidden.length}</SectionLabel>
              <ul>
                {hidden.map((entry) => (
                  <ColumnLayoutRow key={entry.key} entry={entry} column={byKey.get(entry.key)!} onToggle={(on) => toggle(entry.key, on)} />
                ))}
              </ul>
            </>
          )}
        </div>
        <p className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 text-2xs text-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-green-500" /> Special column
        </p>
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-2 pt-1 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase", className)}>{children}</p>;
}

function ColumnLayoutRow({ entry, column, onToggle, sortable = false }: { entry: PortalColumnEntry; column: PortalColumnCandidate; onToggle: (on: boolean) => void; sortable?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.key, disabled: !sortable });
  const Icon = COLUMN_TYPE_ICONS[column.type];
  const on = !entry.hidden;
  return (
    <li
      ref={setNodeRef}
      style={sortable ? { transform: CSS.Translate.toString(transform), transition } : undefined}
      className={cn("group/col flex h-8 items-center gap-2 rounded-md pr-1.5 pl-1 text-[13px] hover:bg-accent/50", isDragging && "z-10 bg-card shadow-md", !on && "text-muted-foreground")}
      data-testid={`portal-column-row-${entry.key}`}
    >
      {sortable ? (
        <button type="button" aria-label={`Move ${column.name}`} className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/50 group-hover/col:text-muted-foreground active:cursor-grabbing" {...attributes} {...listeners}>
          <GripVertical className="size-3.5" />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      <span className="relative shrink-0">
        <Icon className={cn("size-3.5", column.special ? "text-green-600 dark:text-green-400" : "text-muted-foreground")} />
        {column.special && <span aria-label="Special column" className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-green-500" />}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {column.name}
        {/* Two boards can each have a "Notes" of a different kind; the type tells them apart. */}
        {!column.builtIn && !column.special && <span className="ml-1.5 text-2xs text-muted-foreground/80">{COLUMN_TYPE_LABELS[column.type]}</span>}
      </span>
      <span title={column.required ? "Always shown" : undefined}>
        <Switch size="sm" checked={on} disabled={column.required} onCheckedChange={onToggle} aria-label={`Show ${column.name}`} data-testid={`portal-column-${entry.key}`} />
      </span>
    </li>
  );
}

function BookingFields({ draft, set }: { draft: Draft; set: SetField }) {
  return (
    <>
      <ThemeField theme={draft.bookingTheme} onTheme={(value) => set("bookingTheme", value)} allowSwitch={draft.bookingThemeSwitch} onAllowSwitch={(value) => set("bookingThemeSwitch", value)} testId="portal-booking-theme" />
      <Field label="Headline">
        <Input value={draft.bookingHeadline} onChange={(e) => set("bookingHeadline", e.target.value)} maxLength={MAX_BOOKING_HEADLINE} placeholder={DEFAULT_BOOKING_HEADLINE} aria-label="Booking page headline" className="h-9" data-testid="portal-booking-headline" />
      </Field>
      <Field label="Intro">
        <Textarea value={draft.bookingLead} onChange={(e) => set("bookingLead", e.target.value)} maxLength={MAX_BOOKING_LEAD} placeholder={DEFAULT_BOOKING_LEAD} aria-label="Booking page intro" rows={2} className="min-h-0 resize-none" data-testid="portal-booking-lead" />
      </Field>
      <Toggle label="Offers staff sign-in" checked={draft.bookingSignIn} onChange={(value) => set("bookingSignIn", value)} testId="portal-booking-sign-in" />
      <ScaleField value={draft.bookingScale} onChange={(value) => set("bookingScale", value)} />
      <Toggle label="Visitors can change size" checked={draft.bookingScaleSwitch} onChange={(value) => set("bookingScaleSwitch", value)} testId="portal-booking-scale-switch" />
    </>
  );
}

/** How large the form is drawn, for a kiosk, a big screen or a reader who wants it bigger. */
function ScaleField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Field label="Interface size">
      <div className="flex items-center gap-3">
        <span className="text-2xs text-muted-foreground tabular">{BOOKING_SCALE_MIN}%</span>
        <input
          type="range"
          min={BOOKING_SCALE_MIN}
          max={BOOKING_SCALE_MAX}
          step={BOOKING_SCALE_STEP}
          value={value}
          onChange={(e) => onChange(clampBookingScale(Number(e.target.value)))}
          aria-label="Interface size"
          aria-valuetext={`${value}%`}
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--color-primary)]"
          data-testid="portal-booking-scale"
        />
        <span className="text-2xs text-muted-foreground tabular">{BOOKING_SCALE_MAX}%</span>
        <span className="w-12 text-right text-[13px] font-medium tabular" data-testid="portal-booking-scale-value">
          {value}%
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={() => onChange(100)} disabled={value === 100}>
          Reset
        </Button>
      </div>
    </Field>
  );
}

/** A link's theme, and whether its visitors may switch it for themselves. */
function ThemeField({ theme, onTheme, allowSwitch, onAllowSwitch, testId }: { theme: Draft["defaultTheme"]; onTheme: (theme: Draft["defaultTheme"]) => void; allowSwitch: boolean; onAllowSwitch: (value: boolean) => void; testId: string }) {
  return (
    <Field label="Theme">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Choice options={PORTAL_THEMES.map((value) => ({ value, label: value }))} value={theme} onChange={(value) => onTheme(value as Draft["defaultTheme"])} name="Theme" testId={testId} />
        <Toggle label="Visitors can switch" checked={allowSwitch} onChange={onAllowSwitch} testId={`${testId}-switch`} />
      </div>
    </Field>
  );
}

/** A labelled control. The label says it; nothing underneath explains it. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 label-quiet">{label}</p>
      {children}
    </div>
  );
}

/** The pill group used for anything with a few options. */
function Choice({ options, value, onChange, name, testId, plain }: { options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void; name: string; testId?: string; plain?: boolean }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex flex-wrap items-center rounded-full border border-border/70 p-0.5" data-testid={testId}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("h-7 rounded-full px-2.5 text-2xs font-medium transition-colors", !plain && "capitalize", value === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          data-testid={testId ? `${testId}-${option.value}` : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A setting that is on or off.
 *
 * A span rather than a `<label>` around it: a label re-dispatches the click onto
 * the control, which toggles it twice.
 */
function Toggle({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (next: boolean) => void; testId: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px] text-foreground/85">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} aria-label={label} data-testid={testId} />
      {label}
    </span>
  );
}

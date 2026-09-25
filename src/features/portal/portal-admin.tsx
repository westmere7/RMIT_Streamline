"use client";

import { Check, ClipboardPen, Copy, ExternalLink, Eye, EyeOff, Globe, KeyRound, Loader2, Lock, RefreshCw, Settings2, Users } from "lucide-react";
import * as React from "react";
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
  MAX_BOOKING_LEAD,
  MAX_CREATIVE_TEAM_NAME,
  PORTAL_COLUMN_LABELS,
  PORTAL_COLUMNS,
  PORTAL_DEFAULT_RANGES,
  PORTAL_THEMES,
  PORTAL_VIEWS,
  parsePortalRange,
  portalRangeLabel,
  type PortalPresentation,
  type StakeholderPortal,
} from "@/domain";
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
      {overview.data && <PortalCard portal={overview.data.portal} rows={overview.data.departments} />}
    </div>
  );
}

/** The portal: whether it is open, its credentials, and its two links. */
function PortalCard({ portal, rows }: { portal: StakeholderPortal; rows: DepartmentOverview[] }) {
  const { setEnabled } = usePortalMutations();
  const [editing, setEditing] = React.useState<"portal" | "booking" | null>(null);
  const open = portal.enabled;
  const url = portalUrl(portal.token);
  const bookingUrl = `${url}/book`;
  const booked = rows.reduce((sum, row) => sum + row.requests, 0);
  const active = rows.filter((row) => row.requests > 0).length;

  return (
    <section className="rounded-2xl border border-border/70 bg-card" data-testid="portal-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-5 py-4">
        <h3 className="flex min-w-0 flex-1 items-center gap-2.5 text-[16px] font-semibold tracking-tight">
          Stakeholder portal
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
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Both links share one credential, so what guards it is here rather
              than in either link's settings. */}
          <PasswordButton portal={portal} />
          <RegenerateButton />
          {/* A switch, not a button: this is a state the portal is in. The
              spinner is here because the write is slow enough to look like
              nothing happened. */}
          <span className="flex items-center gap-2 border-l border-border/60 pl-3 text-[13px]">
            {setEnabled.isPending && <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" />}
            <span aria-hidden className="text-muted-foreground">
              Open
            </span>
            <Switch
              checked={open}
              disabled={setEnabled.isPending}
              onCheckedChange={(next) => setEnabled.mutate(next)}
              aria-label={open ? "Close the portal" : "Open the portal"}
              data-testid="portal-toggle"
            />
          </span>
        </div>
      </div>

      {/* Two doors into the same portal. The first is where somebody looks at
          the work being done for them; the second opens straight on the form,
          for when what you want from them is a request rather than a visit.
          The addresses themselves stay out of sight: nobody reads a token, they
          copy it, and the two buttons are what they come here for. */}
      <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
        <LinkTile
          tone="portal"
          icon={Globe}
          label="Portal"
          lead={
            <>
              Where stakeholders see the work being done for them. Opens on the {portal.defaultView} view
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
        >
          <StakeholderList rows={rows} />
        </LinkTile>
        <LinkTile
          tone="booking"
          icon={ClipboardPen}
          label="Booking form"
          lead={
            portal.allowBooking ? (
              <>The same portal, opened straight on the form. Stakeholders describe what they need and it lands on the board as a request.</>
            ) : (
              <>This link is not taking requests. Turn on &ldquo;Takes new requests&rdquo; in its settings.</>
            )
          }
          figure={booked}
          figureLabel={booked === 1 ? "request booked" : "requests booked"}
          aside="through the form so far"
          url={bookingUrl}
          href={`${routes.portal(portal.token)}/book`}
          testId="portal-booking-link"
          copyTestId="portal-booking-link-copy"
          onCopy={() => void copyToClipboard(bookingUrl, "Booking link copied")}
          onSettings={() => setEditing("booking")}
          open={open && portal.allowBooking}
        />
      </div>

      <SettingsDialog kind="portal" portal={portal} open={editing === "portal"} onOpenChange={(next) => setEditing(next ? "portal" : null)} />
      <SettingsDialog kind="booking" portal={portal} open={editing === "booking"} onOpenChange={(next) => setEditing(next ? "booking" : null)} />
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

/** The two tiles' colourings: the brand red for the portal, indigo for the form, so the pair reads as two things. */
const TILE_TONES = {
  portal: {
    glow: "bg-primary/25",
    icon: "bg-primary/10 text-primary ring-primary/15",
    figure: "text-primary",
    edge: "hover:border-primary/40",
  },
  booking: {
    glow: "bg-accent-soft-foreground/25",
    icon: "bg-accent-soft text-accent-soft-foreground ring-accent-soft-foreground/15",
    figure: "text-accent-soft-foreground",
    edge: "hover:border-accent-soft-foreground/40",
  },
} as const;

/**
 * One of the portal's two doors, as a tile: what it is, one figure that says
 * how it is doing, and the things anybody does with it — copy the link, open
 * it, tune it. The address is kept for tests and screen readers and shown to
 * nobody; a token is not something a person reads.
 */
function LinkTile({
  tone,
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
  children,
}: {
  tone: keyof typeof TILE_TONES;
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
  children?: React.ReactNode;
}) {
  const tones = TILE_TONES[tone];
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div
      className={cn(
        "group/tile relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface/50 p-5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        tones.edge,
      )}
      data-testid={`${testId}-block`}
    >
      {/* A wash of the tile's colour in one corner, brighter under the pointer. */}
      <span aria-hidden className={cn("pointer-events-none absolute -top-16 -right-12 size-48 rounded-full blur-3xl transition-opacity duration-300 opacity-60 group-hover/tile:opacity-100", tones.glow, !open && "opacity-20")} />

      <div className={cn("relative flex items-start gap-3", !open && "opacity-70 saturate-50")}>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", tones.icon)}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <div className="flex items-center gap-2">
            <h4 className="text-[15px] font-semibold tracking-tight">{label}</h4>
            {!open && (
              <Badge variant="muted" className="gap-1">
                <EyeOff className="size-3" aria-hidden /> Not serving
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{lead}</p>
        </div>
      </div>
      {/* Always at full strength, even on a link that is not serving: its
          settings are how it gets turned back on. */}
      <Button variant="ghost" size="icon" className="absolute top-4 right-4 size-8 text-muted-foreground hover:text-foreground" onClick={onSettings} aria-label={`${label} settings`} data-testid={`${testId}-settings`}>
        <Settings2 className="size-4" />
      </Button>

      <div className={cn("relative mt-5 flex items-end justify-between gap-4", !open && "opacity-70 saturate-50")}>
        <div>
          <p className={cn("text-[32px] leading-none font-semibold tracking-tight tabular", tones.figure)} data-testid={`${testId}-figure`}>
            {figure}
          </p>
          <p className="mt-1.5 text-[13px] font-medium">{figureLabel}</p>
          <p className="text-2xs text-muted-foreground">{aside}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className={cn("bg-card transition-colors", copied && "border-green-500/50 text-green-700 dark:text-green-300")}
            aria-label={`Copy the ${label.toLowerCase()} link`}
            onClick={() => {
              onCopy();
              setCopied(true);
            }}
            data-testid={copyTestId}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={href} target="_blank" rel="noreferrer noopener" aria-label={`Open the ${label.toLowerCase()} in a new tab`} data-testid={`${testId}-open`}>
              Open <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
      {/* The address, for anything that has to read it: a test, a screen reader. Nobody else. */}
      <span className="sr-only" data-testid={testId}>
        {url}
      </span>

      {children && <div className={cn("relative mt-4 border-t border-border/60 pt-4", !open && "opacity-70 saturate-50")}>{children}</div>}
    </div>
  );
}

/**
 * Who the portal carries work for.
 *
 * Read-only on purpose: these words come from the stakeholder groups in
 * Settings → Lists, which stays the one place they are written. Shown under
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
          <a href={routes.settings(ws.slug, "lists")} className="font-medium text-foreground underline-offset-2 hover:underline">
            Settings → Lists
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
type Draft = Required<Pick<PortalPresentation, "defaultView" | "defaultRange" | "defaultTheme" | "themeSwitch" | "hiddenColumns" | "showRecap" | "showItemGroups" | "allowBooking" | "bookingTheme" | "bookingThemeSwitch" | "bookingSignIn" | "bookingScale" | "bookingScaleSwitch">> & {
  bookingHeadline: string;
  bookingLead: string;
  teamName: string;
};

/** Which fields each panel owns. Anything else in the draft is left exactly as it was. */
const PANEL_FIELDS = {
  portal: ["teamName", "defaultView", "defaultRange", "defaultTheme", "themeSwitch", "hiddenColumns", "showRecap", "showItemGroups"],
  booking: ["allowBooking", "bookingTheme", "bookingThemeSwitch", "bookingHeadline", "bookingLead", "bookingSignIn", "bookingScale", "bookingScaleSwitch"],
} as const satisfies Record<string, ReadonlyArray<keyof Draft>>;

function draftOf(portal: StakeholderPortal, teamName: string): Draft {
  return {
    defaultView: portal.defaultView,
    defaultRange: portal.defaultRange,
    defaultTheme: portal.defaultTheme,
    themeSwitch: portal.themeSwitch,
    hiddenColumns: portal.hiddenColumns,
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
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value) => b.includes(value));
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
function SettingsDialog({ kind, portal, open, onOpenChange }: { kind: keyof typeof PANEL_FIELDS; portal: StakeholderPortal; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const { saveSettings } = usePortalMutations();
  const storedName = ws.workspace.creativeTeamName ?? "";
  const initial = React.useMemo(() => draftOf(portal, storedName), [portal, storedName]);
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
            <DialogDescription>{kind === "portal" ? "How the portal looks to stakeholders." : "How the booking form looks, and whether it takes requests."}</DialogDescription>
          </DialogHeader>

          <div className="scrollbar-thin grid content-start gap-5 overflow-y-auto px-6 py-5">
            {kind === "portal" ? <PortalFields draft={draft} set={set} placeholder={ws.workspace.name} /> : <BookingFields draft={draft} set={set} />}
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

function PortalFields({ draft, set, placeholder }: { draft: Draft; set: SetField; placeholder: string }) {
  return (
    <>
      <Field label="Team name">
        <Input value={draft.teamName} onChange={(e) => set("teamName", e.target.value)} maxLength={MAX_CREATIVE_TEAM_NAME} placeholder={placeholder} aria-label="Creative team name" className="h-9" data-testid="portal-team-name" />
      </Field>
      <Field label="Opens on">
        <Choice options={PORTAL_VIEWS.map((view) => ({ value: view, label: view }))} value={draft.defaultView} onChange={(value) => set("defaultView", value as Draft["defaultView"])} name="View the portal opens on" testId="portal-view" />
      </Field>
      <Field label="Period">
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
        <div className="flex flex-wrap gap-1.5">
          {PORTAL_COLUMNS.map((key) => {
            const on = !draft.hiddenColumns.includes(key);
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => set("hiddenColumns", on ? [...draft.hiddenColumns, key] : draft.hiddenColumns.filter((c) => c !== key))}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-2xs font-medium transition-colors",
                  on ? "border-transparent bg-foreground text-background" : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
                data-testid={`portal-column-${key}`}
              >
                {on ? <Eye className="size-3" aria-hidden /> : <EyeOff className="size-3" aria-hidden />}
                {PORTAL_COLUMN_LABELS[key]}
              </button>
            );
          })}
        </div>
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

function BookingFields({ draft, set }: { draft: Draft; set: SetField }) {
  return (
    <>
      <Toggle label="Takes new requests" checked={draft.allowBooking} onChange={(value) => set("allowBooking", value)} testId="portal-allow-booking" />
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

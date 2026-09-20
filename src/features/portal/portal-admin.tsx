"use client";

import { Check, ChevronDown, ClipboardPen, Copy, ExternalLink, Eye, EyeOff, Globe, KeyRound, Loader2, Lock, RefreshCw, Settings2, Users } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PORTAL_COLUMN_LABELS, PORTAL_COLUMNS, PORTAL_THEMES, PORTAL_VIEWS, type PortalTheme, type PortalView, type StakeholderPortal } from "@/domain";
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
 * One portal, one link, and the page is built around handing that link out:
 * the two addresses sit at the top with a line each saying what they open and
 * who they show, and everything that tunes the portal — its name, what it
 * opens on, which columns, the theme, the password — folds away under them.
 * The settings are set once and then left alone; the links are copied every
 * week.
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

/** The portal: its links, whether it is open, and — folded away — how it presents itself. */
function PortalCard({ portal, rows }: { portal: StakeholderPortal; rows: DepartmentOverview[] }) {
  const { setEnabled } = usePortalMutations();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
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
          {/* A switch, not a button: this is a state the portal is in. The
              spinner is here because the write is slow enough to look like
              nothing happened. */}
          <span className="flex items-center gap-2 pl-1 text-[13px]">
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
          figureLabel={rows.length === 1 ? "stakeholder group" : "stakeholder groups"}
          aside={rows.length > 0 ? `${active} of ${rows.length} have booked` : "none set up yet"}
          url={url}
          href={routes.portal(portal.token)}
          testId="portal-link"
          copyTestId="portal-copy"
          onCopy={() => void copyToClipboard(url, "Link copied")}
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
              <>This link is not taking requests. Turn on &ldquo;Takes new requests&rdquo; in the settings below.</>
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
          open={open && portal.allowBooking}
        />
      </div>

      <button
        type="button"
        onClick={() => setSettingsOpen((v) => !v)}
        aria-expanded={settingsOpen}
        aria-controls="portal-settings"
        className="flex w-full items-center gap-2 border-t border-border/60 px-5 py-3 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="portal-settings-toggle"
      >
        <Settings2 className="size-3.5" aria-hidden />
        Settings
        <span className="ml-auto flex items-center gap-2 text-2xs font-normal">
          {!settingsOpen && <SettingsSummary portal={portal} />}
          <ChevronDown className={cn("size-4 transition-transform", settingsOpen && "rotate-180")} aria-hidden />
        </span>
      </button>
      <div id="portal-settings" hidden={!settingsOpen}>
        <PortalSettings portal={portal} />
      </div>
    </section>
  );
}

/** What the folded settings say about themselves, so nobody has to open them to check. */
function SettingsSummary({ portal }: { portal: StakeholderPortal }) {
  const ws = useWorkspace();
  const hidden = portal.hiddenColumns.length;
  return (
    <span className="hidden truncate text-muted-foreground sm:inline" data-testid="portal-settings-summary">
      {ws.workspace.creativeTeamName || ws.workspace.name} · {portal.defaultTheme} theme{hidden > 0 ? ` · ${hidden} ${hidden === 1 ? "column" : "columns"} hidden` : ""}
    </span>
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
 * how it is doing, and the two things anybody does with it — copy the link,
 * open it. The address is kept for tests and screen readers and shown to
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
        !open && "opacity-70 saturate-50",
      )}
      data-testid={`${testId}-block`}
    >
      {/* A wash of the tile's colour in one corner, brighter under the pointer. */}
      <span aria-hidden className={cn("pointer-events-none absolute -top-16 -right-12 size-48 rounded-full blur-3xl transition-opacity duration-300 opacity-60 group-hover/tile:opacity-100", tones.glow)} />

      <div className="relative flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", tones.icon)}>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
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

      <div className="relative mt-5 flex items-end justify-between gap-4">
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

      {children && <div className="relative mt-4 border-t border-border/60 pt-4">{children}</div>}
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

// ---- the settings, folded away ------------------------------------------------

/** A labelled row of controls, with the reason for them underneath. */
function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <p className="mb-1.5 label-quiet">{label}</p>
      {children}
      {hint && <p className="mt-1 text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The pill group used for anything with a few options. */
function Choice({ options, value, onChange, name }: { options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex flex-wrap items-center rounded-full border border-border/70 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("h-7 rounded-full px-2.5 text-2xs font-medium capitalize transition-colors", value === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
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
    <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
      <Switch size="sm" checked={checked} onCheckedChange={onChange} aria-label={label} data-testid={testId} />
      {label}
    </span>
  );
}

/** What the portal calls the team. Presentation only — the workspace keeps its name. */
function TeamNameField() {
  const ws = useWorkspace();
  const { setTeamName } = usePortalMutations();
  const stored = ws.workspace.creativeTeamName ?? "";
  const [value, setValue] = React.useState(stored);
  const [wasStored, setWasStored] = React.useState(stored);
  if (wasStored !== stored) {
    setWasStored(stored);
    setValue(stored);
  }

  const dirty = value.trim() !== stored.trim();
  return (
    <Field label="What the portal calls you" hint={`Shown in the portal's header. The workspace keeps its own name, ${ws.workspace.name}.`}>
      <div className="flex flex-wrap items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} placeholder={ws.workspace.name} aria-label="Creative team name" className="h-9 min-w-0 flex-1" data-testid="portal-team-name" />
        {dirty && (
          <Button size="sm" variant="outline" disabled={setTeamName.isPending} onClick={() => setTeamName.mutate(value)}>
            {setTeamName.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
          </Button>
        )}
      </div>
    </Field>
  );
}

/** Everything that tunes the portal. Set once, then left alone, which is why it folds. */
function PortalSettings({ portal }: { portal: StakeholderPortal }) {
  const { setTheme, setPresentation, regenerate, setPassword } = usePortalMutations();
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [password, setPasswordValue] = React.useState("");

  return (
    <div className="grid gap-x-8 gap-y-4 border-t border-border/60 p-3 lg:grid-cols-2" data-testid="portal-settings">
      {/* Words on the left, the board on the right; the switches and the
          credentials span the row. Two columns because none of these needs
          the width, and one long column read as a form to be filled in. */}
      <div className="grid gap-4">
        <TeamNameField />
      </div>

      <div className="grid gap-4">
        <Field label="Opens on" hint="The view the link lands on. Anyone can switch once they are in.">
          <Choice options={PORTAL_VIEWS.map((view) => ({ value: view, label: view }))} value={portal.defaultView} onChange={(defaultView) => setPresentation.mutate({ defaultView: defaultView as PortalView })} name="View the portal opens on" />
        </Field>
        <Field label="Opens in" hint="Light or dark, or whatever the visitor's device says.">
          <Choice options={PORTAL_THEMES.map((theme) => ({ value: theme, label: theme }))} value={portal.defaultTheme} onChange={(theme) => setTheme.mutate(theme as PortalTheme)} name="Default theme" />
        </Field>
      </div>

      <Field label="Columns" hint="What the portal's board shows. Hiding one tidies the page; it does not restrict anything." className="lg:col-span-2">
        <div className="flex flex-wrap gap-1.5">
          {PORTAL_COLUMNS.map((key) => {
            const on = !portal.hiddenColumns.includes(key);
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => setPresentation.mutate({ hiddenColumns: on ? [...portal.hiddenColumns, key] : portal.hiddenColumns.filter((c) => c !== key) })}
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

      <Field label="This link" hint={portal.showItemGroups ? "Grouped by board, the way each team runs it; visitors can switch." : "Grouped by status. The teams' own groups stay in the team."} className="lg:col-span-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Toggle label="Takes new requests" checked={portal.allowBooking} onChange={(allowBooking) => setPresentation.mutate({ allowBooking })} testId="portal-allow-booking" />
          <Toggle label="Shows the figures" checked={portal.showRecap} onChange={(showRecap) => setPresentation.mutate({ showRecap })} testId="portal-show-recap" />
          <Toggle label="Shows the boards' own groups" checked={portal.showItemGroups} onChange={(showItemGroups) => setPresentation.mutate({ showItemGroups })} testId="portal-show-item-groups" />
        </div>
      </Field>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 lg:col-span-2">
        <Button variant="ghost" size="sm" onClick={() => setPasswordOpen((v) => !v)} data-testid="portal-password-toggle">
          <KeyRound /> {portal.passwordHash ? "Change password" : "Add password"}
        </Button>
        {portal.passwordHash && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPassword.mutate({ password: null })}>
            Remove password
          </Button>
        )}
        <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={() => setConfirmRegenerate(true)} data-testid="portal-regenerate">
          <RefreshCw /> New link
        </Button>
      </div>

      {passwordOpen && (
        <form
          className="flex flex-wrap items-center gap-2 lg:col-span-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!password.trim()) return;
            // Closed only once the write has landed. Hashing is deliberately
            // slow, and closing first made the form look finished while it
            // was not — navigate in that window and the password was lost.
            await setPassword.mutateAsync({ password });
            setPasswordValue("");
            setPasswordOpen(false);
          }}
        >
          <Input type="password" value={password} onChange={(e) => setPasswordValue(e.target.value)} placeholder="New password" aria-label="Portal password" className="max-w-xs" autoComplete="new-password" data-testid="portal-password-input" />
          <Button type="submit" size="sm" disabled={!password.trim() || setPassword.isPending}>
            {setPassword.isPending ? "Setting…" : "Set password"}
          </Button>
          <span className="text-2xs text-muted-foreground">Anyone already inside is asked for it again.</span>
        </form>
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Issue a new link?"
        description="The current link stops working straight away, including for anyone reading the portal right now. Their requests are untouched."
        confirmLabel="Issue new link"
        destructive
        onConfirm={async () => {
          await regenerate.mutateAsync();
        }}
      />
    </div>
  );
}

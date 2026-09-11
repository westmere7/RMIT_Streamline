"use client";

import { Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Lock, RefreshCw, Settings2, Users } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { MAX_PORTAL_DESCRIPTION, PORTAL_COLUMN_LABELS, PORTAL_COLUMNS, PORTAL_THEMES, PORTAL_VIEWS, type PortalTheme, type PortalView, type StakeholderPortal } from "@/domain";
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
 * One portal, one link. It used to be one of each per department, which meant a
 * page of near-identical panels and a link to hand out per stakeholder; the
 * work was never divided that way, and neither is this any more. What the
 * stakeholders get instead is a filter inside the portal.
 *
 * So this screen has two parts: the link and how it presents itself, and — for
 * reference only — the stakeholders whose work it carries. The stakeholders
 * themselves are still edited in Settings → Lists, which stays the one place
 * those words are written.
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
      <TeamNameField />

      {overview.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      )}
      {overview.isError && <ErrorState title="Could not load the portal." error={overview.error} onRetry={() => overview.refetch()} />}

      {overview.data && (
        <>
          <PortalCard portal={overview.data.portal} />
          <StakeholderList rows={overview.data.departments} />
        </>
      )}
    </div>
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
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <h3 className="text-[13px] font-semibold">What the portal calls you</h3>
      <p className="mt-0.5 mb-2.5 text-[13px] text-muted-foreground">
        Shown in the portal&rsquo;s header. The workspace keeps its own name, {ws.workspace.name}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={60}
          placeholder={ws.workspace.name}
          aria-label="Creative team name"
          className="max-w-sm"
          data-testid="portal-team-name"
        />
        <Button disabled={!dirty || setTeamName.isPending} onClick={() => setTeamName.mutate(value)}>
          {setTeamName.isPending ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
      </div>
    </section>
  );
}

/** A labelled row of controls, with the reason for them underneath. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 label-quiet">{label}</p>
      {children}
      {hint && <p className="mt-1 text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** The pill group used for the theme, reused for anything else with a few options. */
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
          className={cn(
            "h-7 rounded-full px-2.5 text-2xs font-medium capitalize transition-colors",
            value === option.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          )}
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

/**
 * A description that saves when the writer stops, not on every keystroke.
 *
 * Each save is a round trip and a refetch; typing a sentence would fire twenty
 * of them.
 */
function DescriptionEditor({ value, busy, onSave }: { value: string; busy: boolean; onSave: (value: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  const dirty = draft.trim() !== value.trim();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && dirty) onSave(draft);
          if (event.key === "Escape") setDraft(value);
        }}
        maxLength={MAX_PORTAL_DESCRIPTION}
        placeholder="Everything the Marketing team is making for you."
        aria-label="Portal description"
        className="h-9 max-w-md flex-1"
        data-testid="portal-description"
      />
      {dirty && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave(draft)} data-testid="portal-description-save">
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
      )}
    </div>
  );
}

/** The portal itself: its link, whether it is open, and how it presents itself. */
function PortalCard({ portal }: { portal: StakeholderPortal }) {
  const { setEnabled, setTheme, setPresentation, regenerate, setPassword } = usePortalMutations();
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [password, setPasswordValue] = React.useState("");
  const open = portal.enabled;
  const url = portalUrl(portal.token);

  return (
    <section className="rounded-xl border border-border/70 bg-card" data-testid="portal-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 p-3">
        <h3 className="flex min-w-0 flex-1 items-center gap-2.5 text-[15px] font-semibold">
          Stakeholder portal
          <Badge variant={open ? "success" : "muted"} data-testid="portal-state">
            {open ? "Open" : "Closed"}
          </Badge>
          {portal.passwordHash && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" aria-hidden /> Password
            </Badge>
          )}
        </h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => void copyToClipboard(url, "Link copied")} data-testid="portal-copy">
            <Copy /> Copy
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={routes.portal(portal.token)} target="_blank" rel="noreferrer noopener">
              <ExternalLink /> Preview
            </a>
          </Button>
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

      <div className="space-y-4 p-3">
        <code className="block min-w-0 truncate rounded-md bg-surface px-2 py-1.5 font-mono text-2xs text-muted-foreground" data-testid="portal-link">
          {url}
        </code>

        <Field label="Description" hint={open ? "Shown under the team's name on the portal." : "Shown under the team's name once the link is open."}>
          <DescriptionEditor key={portal.id} value={portal.description ?? ""} busy={setPresentation.isPending} onSave={(description) => setPresentation.mutate({ description })} />
        </Field>

        <Field label="Opens on" hint="The view the link lands on. Anyone can switch once they are in.">
          <Choice
            options={PORTAL_VIEWS.map((view) => ({ value: view, label: view }))}
            value={portal.defaultView}
            onChange={(defaultView) => setPresentation.mutate({ defaultView: defaultView as PortalView })}
            name="View the portal opens on"
          />
        </Field>

        <Field label="Columns" hint="What the portal's board shows. Hiding one tidies the page; it does not restrict anything.">
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

        <Field label="This link">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Toggle label="Takes new requests" checked={portal.allowBooking} onChange={(allowBooking) => setPresentation.mutate({ allowBooking })} testId="portal-allow-booking" />
            <Toggle label="Shows the figures" checked={portal.showRecap} onChange={(showRecap) => setPresentation.mutate({ showRecap })} testId="portal-show-recap" />
          </div>
        </Field>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="text-2xs text-muted-foreground">Opens in</span>
          <div role="radiogroup" aria-label="Default theme" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
            {PORTAL_THEMES.map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={portal.defaultTheme === theme}
                onClick={() => setTheme.mutate(theme as PortalTheme)}
                className={cn(
                  "h-7 rounded-full px-2.5 text-2xs font-medium capitalize transition-colors",
                  portal.defaultTheme === theme ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {theme}
              </button>
            ))}
          </div>

          <span aria-hidden className="mx-1 h-5 w-px bg-border/70" />

          <Button variant="ghost" size="sm" onClick={() => setPasswordOpen((v) => !v)} data-testid="portal-password-toggle">
            <KeyRound /> {portal.passwordHash ? "Change password" : "Add password"}
          </Button>
          {portal.passwordHash && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPassword.mutate({ password: null })}>
              Remove password
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmRegenerate(true)} data-testid="portal-regenerate">
            <RefreshCw /> New link
          </Button>
        </div>

        {passwordOpen && (
          <form
            className="flex flex-wrap items-center gap-2"
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
            <Input
              type="password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="New password"
              aria-label="Portal password"
              className="max-w-xs"
              autoComplete="new-password"
              data-testid="portal-password-input"
            />
            <Button type="submit" size="sm" disabled={!password.trim() || setPassword.isPending}>
              {setPassword.isPending ? "Setting…" : "Set password"}
            </Button>
            <span className="text-2xs text-muted-foreground">Anyone already inside is asked for it again.</span>
          </form>
        )}
      </div>

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
    </section>
  );
}

/**
 * Who the portal carries work for.
 *
 * Read-only on purpose: these words come from the stakeholder groups in
 * Settings → Lists, which stays the one place they are written. Shown here
 * because "which stakeholders does this link show" is the first thing anyone
 * asks of it, and the counts say which of them have ever booked anything.
 */
function StakeholderList({ rows }: { rows: DepartmentOverview[] }) {
  const ws = useWorkspace();
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No stakeholder groups yet"
        description="Stakeholders come from the groups in Settings → Lists. Add one there and the portal offers it as a filter."
        action={
          <Button variant="outline" asChild>
            <a href={routes.settings(ws.slug, "lists")}>
              <Settings2 /> Open Lists
            </a>
          </Button>
        }
      />
    );
  }

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4" data-testid="portal-stakeholders">
      <h3 className="text-[13px] font-semibold">Who it shows</h3>
      <p className="mt-0.5 mb-3 text-[13px] text-muted-foreground">
        Everyone here is a filter inside the one portal. The words come from{" "}
        <a href={routes.settings(ws.slug, "lists")} className="font-medium text-foreground underline-offset-2 hover:underline">
          Settings → Lists
        </a>
        ; a task joins a stakeholder by carrying their name in a Stakeholder column, or by having been booked for them.
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {rows.map(({ department, requests }) => (
          <li
            key={department.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-2xs"
            data-testid="portal-stakeholder-row"
            data-department={department.name}
          >
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colorClasses(department.color).dot)} />
            <span className="font-medium">{department.name}</span>
            <span className="tabular text-muted-foreground">{requests} booked</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

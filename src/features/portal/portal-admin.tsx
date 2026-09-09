"use client";

import { Check, ChevronRight, Copy, ExternalLink, Eye, EyeOff, KeyRound, Link2, Loader2, Lock, RefreshCw, Settings2, Users } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  MAX_PORTAL_DESCRIPTION,
  PORTAL_COLUMN_LABELS,
  PORTAL_COLUMNS,
  PORTAL_THEMES,
  PORTAL_VIEWS,
  type PortalTheme,
  type PortalView,
} from "@/domain";
import { copyToClipboard } from "@/features/members/hooks";
import { portalUrl, usePortalMutations, usePortalOverview } from "@/features/portal/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { DepartmentOverview } from "@/services";

/**
 * One card per department: whether its portal is open, the link, and the two
 * things that revoke it.
 *
 * Departments themselves are not edited here. They are the workspace's
 * stakeholder groups, and Settings → Lists is the one place those words are
 * written — a second editing surface is exactly how two lists drift apart. What
 * this screen owns is the link and what it opens onto.
 */
export function PortalAdmin() {
  const ws = useWorkspace();
  const overview = usePortalOverview();
  const admin = canManageWorkspace(ws.permissions);

  if (!admin) {
    return (
      <EmptyState
        icon={Lock}
        title="Portals are managed by workspace admins"
        description="You can still book a task from the tab beside this one."
      />
    );
  }

  return (
    <div className="space-y-5">
      <TeamNameField />

      {overview.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}
      {overview.isError && <ErrorState title="Could not load the departments." error={overview.error} onRetry={() => overview.refetch()} />}

      {overview.data && overview.data.length === 0 && (
        <EmptyState
          icon={Users}
          title="No stakeholder groups yet"
          description="Departments come from the stakeholder groups in Settings → Lists. Add one there and it appears here with a link of its own."
          action={
            <Button variant="outline" asChild>
              <a href={routes.settings(ws.slug, "lists")}>
                <Settings2 /> Open Lists
              </a>
            </Button>
          }
        />
      )}

      {overview.data && overview.data.length > 0 && (
        <>
          <p className="text-[13px] text-muted-foreground">
            Each department reads its own requests through its own link. Departments come from the stakeholder groups in{" "}
            <a href={routes.settings(ws.slug, "lists")} className="font-medium text-foreground underline-offset-2 hover:underline">
              Settings → Lists
            </a>
            .
          </p>
          <ul className="space-y-3" data-testid="portal-departments">
            {overview.data.map((row) => (
              <DepartmentCard key={row.department.id} row={row} />
            ))}
          </ul>
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
        Shown in the header of every department&rsquo;s portal. The workspace keeps its own name, {ws.workspace.name}.
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
 * The application's own `Switch`, not a hand-drawn one: it carries the accent
 * the rest of the app switches with, and a track painted in `foreground`
 * instead read as a white slab that belonged to no palette.
 *
 * A span rather than a `<label>` around it, for the reason recorded on the
 * open/close switch: a label re-dispatches the click onto the control.
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
 * Each save is a round trip and a refetch of the whole Departments list; typing
 * a sentence would fire twenty of them.
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

/**
 * One department, folded up.
 *
 * A workspace with a dozen departments was a dozen stacked panels of link,
 * theme, password and regenerate — a page of controls to find the one switch
 * anybody came for. Collapsed is the resting state: the name, whether the link
 * is live, and the two things done most often (copy it, open it). Everything
 * that changes the link is a fold away, which also puts a small deliberate
 * distance between a passing glance and "New link".
 */
function DepartmentCard({ row }: { row: DepartmentOverview }) {
  const { department, portal } = row;
  const { setEnabled, setTheme, setPresentation, regenerate, setPassword } = usePortalMutations();
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [password, setPasswordValue] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);
  const colors = colorClasses(department.color);
  const open = !!portal?.enabled;
  const url = portal ? portalUrl(portal.token) : "";
  // Opening a portal writes a row and, first time round, makes one; the button
  // says so rather than sitting still for a second and a half.
  const busy = setEnabled.isPending && setEnabled.variables?.departmentId === department.id;

  return (
    <li
      // Open, it is the thing being worked on: lifted off the page and ringed
      // in the accent, so a column of six identical panels has an obvious
      // subject. Closed, it goes back to being one of a list.
      className={cn(
        "rounded-xl border bg-card transition-shadow",
        expanded ? "border-ring/40 shadow-md ring-1 ring-ring/15" : "border-border/70",
      )}
      data-testid="portal-department"
      data-department={department.name}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left"
          data-testid="portal-department-expand"
        >
          <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
          <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", colors.dot)} />
          <span className="truncate text-[15px] font-semibold">{department.name}</span>
          <Badge variant={open ? "success" : "muted"} data-testid="portal-state">
            {open ? "Open" : "Closed"}
          </Badge>
          {portal?.passwordHash && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" aria-hidden /> Password
            </Badge>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {portal && (
            <>
              <Button variant="ghost" size="sm" onClick={() => void copyToClipboard(url, "Link copied")} data-testid="portal-copy">
                <Copy /> Copy
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={routes.portal(portal.token)} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Preview
                </a>
              </Button>
            </>
          )}
          {/* A switch, not a button: this is a state the department is in, and a
              row of red "Open" buttons read as six things asking to be pressed.
              A span rather than a <label> around it — a label re-dispatches the
              click onto the control, which toggled twice and raced. The spinner
              is here because the write is slow enough to look like nothing
              happened: it creates the portal row on the first open. */}
          <span className="flex items-center gap-2 pl-1 text-[13px]">
            {busy && <Loader2 aria-hidden className="size-3.5 animate-spin text-muted-foreground" />}
            <span aria-hidden className="text-muted-foreground">
              {busy ? (open ? "Closing" : "Opening") : "Open"}
            </span>
            <Switch
              checked={open}
              disabled={busy}
              onCheckedChange={(next) => setEnabled.mutate({ departmentId: department.id, enabled: next })}
              aria-label={`${open ? "Close" : "Open"} the ${department.name} portal`}
              data-testid="portal-toggle"
            />
          </span>
        </div>
      </div>

      {expanded && portal && (
        <div className="space-y-4 rounded-b-xl border-t border-border/60 bg-surface/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 font-mono text-2xs text-muted-foreground" data-testid="portal-link">
              {url}
            </code>
          </div>

          <Field
            label="Description"
            hint={open ? "Shown under the department's name on the portal." : "Shown under the department's name once the link is open."}
          >
            <DescriptionEditor
              key={portal.id}
              value={portal.description ?? ""}
              busy={setPresentation.isPending}
              onSave={(description) => setPresentation.mutate({ departmentId: department.id, patch: { description } })}
            />
          </Field>

          <Field label="Opens on" hint="The view the link lands on. Anyone can switch once they are in.">
            <Choice
              options={PORTAL_VIEWS.map((view) => ({ value: view, label: view }))}
              value={portal.defaultView}
              onChange={(defaultView) => setPresentation.mutate({ departmentId: department.id, patch: { defaultView: defaultView as PortalView } })}
              name={`View for ${department.name}`}
            />
          </Field>

          <Field label="Columns" hint="What this department sees on its board. Hiding one tidies the page; it does not restrict anything.">
            <div className="flex flex-wrap gap-1.5">
              {PORTAL_COLUMNS.map((key) => {
                const on = !portal.hiddenColumns.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() =>
                      setPresentation.mutate({
                        departmentId: department.id,
                        patch: { hiddenColumns: on ? [...portal.hiddenColumns, key] : portal.hiddenColumns.filter((c) => c !== key) },
                      })
                    }
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
              <Toggle
                label="Takes new requests"
                checked={portal.allowBooking}
                onChange={(allowBooking) => setPresentation.mutate({ departmentId: department.id, patch: { allowBooking } })}
                testId="portal-allow-booking"
              />
              <Toggle
                label="Shows the figures"
                checked={portal.showRecap}
                onChange={(showRecap) => setPresentation.mutate({ departmentId: department.id, patch: { showRecap } })}
                testId="portal-show-recap"
              />
            </div>
          </Field>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <span className="text-2xs text-muted-foreground">Opens in</span>
            <div role="radiogroup" aria-label={`Default theme for ${department.name}`} className="inline-flex items-center rounded-full border border-border/70 p-0.5">
              {PORTAL_THEMES.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  role="radio"
                  aria-checked={portal.defaultTheme === theme}
                  onClick={() => setTheme.mutate({ departmentId: department.id, theme: theme as PortalTheme })}
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
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPassword.mutate({ departmentId: department.id, password: null })}>
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
                await setPassword.mutateAsync({ departmentId: department.id, password });
                setPasswordValue("");
                setPasswordOpen(false);
              }}
            >
              <Input
                type="password"
                value={password}
                onChange={(e) => setPasswordValue(e.target.value)}
                placeholder="New password"
                aria-label={`Password for the ${department.name} portal`}
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
      )}

      {!portal && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-3 text-[13px] text-muted-foreground">
          <Link2 className="size-3.5" aria-hidden /> No link yet. Open the portal to make one.
        </p>
      )}

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title={`Issue a new link for ${department.name}?`}
        description="The current link stops working straight away, including for anyone reading the portal right now. Their requests are untouched."
        confirmLabel="Issue new link"
        destructive
        onConfirm={async () => {
          await regenerate.mutateAsync(department.id);
        }}
      />
    </li>
  );
}

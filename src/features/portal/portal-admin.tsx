"use client";

import { Check, Copy, ExternalLink, KeyRound, Link2, Loader2, Lock, RefreshCw, Settings2, Users } from "lucide-react";
import * as React from "react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { PORTAL_THEMES, type PortalTheme } from "@/domain";
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

function DepartmentCard({ row }: { row: DepartmentOverview }) {
  const { department, portal } = row;
  const { setEnabled, setTheme, regenerate, setPassword } = usePortalMutations();
  const [confirmRegenerate, setConfirmRegenerate] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [password, setPasswordValue] = React.useState("");
  const colors = colorClasses(department.color);
  const open = !!portal?.enabled;
  const url = portal ? portalUrl(portal.token) : "";

  return (
    <li className="rounded-xl border border-border/70 bg-card p-4" data-testid="portal-department" data-department={department.name}>
      <div className="flex flex-wrap items-start gap-3">
        <span aria-hidden className={cn("mt-1 size-3 shrink-0 rounded-full", colors.dot)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{department.name}</h3>
            <Badge variant={open ? "success" : "muted"} data-testid="portal-state">
              {open ? "Open" : "Closed"}
            </Badge>
            {portal?.passwordHash && (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" aria-hidden /> Password
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {open ? "Anyone with the link can see this department's work and book new tasks." : "Nobody can open this link."}
          </p>
        </div>
        {/* A span, not a label. A <label> wrapping a control re-dispatches the
            click onto it, so every click toggled twice and which of the two
            writes landed last was a race — a portal could come back open after
            being closed. The switch carries its own accessible name. */}
        <span className="flex shrink-0 items-center gap-2 text-[13px]">
          <span aria-hidden className="text-muted-foreground">
            Open
          </span>
          <Switch
            checked={open}
            disabled={setEnabled.isPending}
            onCheckedChange={(next) => setEnabled.mutate({ departmentId: department.id, enabled: next })}
            aria-label={`${open ? "Close" : "Open"} the ${department.name} portal`}
            data-testid="portal-toggle"
          />
        </span>
      </div>

      {portal && (
        <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 font-mono text-2xs text-muted-foreground" data-testid="portal-link">
              {url}
            </code>
            <Button variant="outline" size="sm" onClick={() => void copyToClipboard(url, "Link copied")} data-testid="portal-copy">
              <Copy /> Copy
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={routes.portal(portal.token)} target="_blank" rel="noreferrer noopener">
                <ExternalLink /> Preview
              </a>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

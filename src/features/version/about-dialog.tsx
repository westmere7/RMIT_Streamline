"use client";

import { ClipboardList, LayoutList, RefreshCw, ShoppingBag, Table2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/features/auth/components/auth-shell";
import { useDataContext } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { CURRENT_VERSION, formatVersion } from "@/lib/version";
import { cn } from "@/lib/utils";
import { selectUpdateAvailable, useVersionStore } from "@/stores/version-store";

/**
 * What this build is and what it does. Reached from the logo in the sidebar and
 * from Settings; a dialog rather than a page, because it is read once and
 * closed. The only place the version is shown, and the only place to ask the
 * server whether a newer build is live.
 */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const { providerKind } = useDataContext();
  const latest = useVersionStore((s) => s.latest);
  const checkedAt = useVersionStore((s) => s.checkedAt);
  const checking = useVersionStore((s) => s.checking);
  const failed = useVersionStore((s) => s.failed);
  const check = useVersionStore((s) => s.check);
  const updateAvailable = useVersionStore(selectUpdateAvailable);
  const built = CURRENT_VERSION.builtAt ? new Date(CURRENT_VERSION.builtAt) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="p-0" data-testid="about-dialog">
        {/* The brand, on the navy the sign-in screen uses. */}
        <div className="relative overflow-hidden rounded-t-xl bg-navy px-6 pt-7 pb-6 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-24 size-64 rounded-full bg-primary/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
          <DialogTitle asChild>
            <div className="relative">
              <BrandLogo tone="onNavy" className="h-8" />
              <span className="sr-only">About Streamline</span>
            </div>
          </DialogTitle>
          <DialogDescription className="relative mt-3 max-w-sm text-[13px] leading-relaxed text-white/70">
            Work management for the RMIT creative and marketing team: campaign production, creative requests and publication work across the Melbourne and Vietnam teams.
          </DialogDescription>
        </div>

        <div className="space-y-5 px-6 pt-5 pb-6">
          <ul className="grid gap-2 text-[13px]">
            <Feature icon={LayoutList}>Boards in seven views, with subitems, dependencies and linked work</Feature>
            <Feature icon={Table2}>Trackers that replace the spreadsheets, in and out as .xlsx</Feature>
            <Feature icon={ShoppingBag}>Task booking for stakeholders, allocated to the team that will do it</Feature>
            <Feature icon={ClipboardList}>Assets, approvals, updates and mentions in one inbox</Feature>
          </ul>

          <div className="rounded-xl border border-border/70 bg-card p-4 text-[13px] shadow-xs" data-testid="about-version">
            <p>
              <span className="font-medium">Streamline {formatVersion(CURRENT_VERSION)}</span>
              {built && !Number.isNaN(built.getTime()) && <span className="text-muted-foreground"> · built {built.toLocaleString()}</span>}
            </p>
            <p className="mt-1 text-muted-foreground" data-testid="version-status">
              {updateAvailable && latest
                ? `A newer version is live: ${formatVersion(latest)}. Reload to get it; nothing here is lost.`
                : failed
                  ? "Could not reach the server to check for updates. It will try again shortly."
                  : checkedAt
                    ? `You are up to date. Checked at ${new Date(checkedAt).toLocaleTimeString()}.`
                    : "Checking for updates…"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {updateAvailable && (
                <Button size="sm" onClick={() => window.location.reload()} data-testid="version-reload">
                  <RefreshCw /> Reload now
                </Button>
              )}
              <Button variant="outline" size="sm" disabled={checking} onClick={() => void check()} data-testid="version-check">
                <RefreshCw className={cn(checking && "animate-spin")} /> {checking ? "Checking…" : "Check for updates"}
              </Button>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <Fact label="Workspace" value={ws.workspace.name} />
            <Fact label="Data" value={providerKind === "supabase" ? "Supabase · shared" : "This browser only"} />
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Feature({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="text-foreground/90">{children}</span>
    </li>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

"use client";

import { Boxes, Inbox, LayoutList, ShoppingBag, Table2 } from "lucide-react";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/features/auth/components/auth-shell";
import { useDataContext } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { BACKEND_REGION, DEPLOY_ENV, getAppConfig, supabaseProjectRef } from "@/lib/config";
import { CURRENT_VERSION, shortBuildId } from "@/lib/version";

/**
 * What this build is and what it does. Reached from the logo in the sidebar and
 * from Settings; a dialog rather than a page, because it is read once and
 * closed. The version sits on a badge beside the mark, the way the loading
 * screen wears it. Nobody has to ask whether a newer build is live: the app
 * watches for one and says so when there is one (see version-watcher.tsx).
 */
export function AboutDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ws = useWorkspace();
  const { providerKind } = useDataContext();
  const built = CURRENT_VERSION.builtAt ? new Date(CURRENT_VERSION.builtAt) : null;
  const projectRef = providerKind === "supabase" ? supabaseProjectRef(getAppConfig().supabaseUrl) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="p-0" data-testid="about-dialog">
        {/* The brand, on the navy the sign-in screen uses. */}
        <div className="relative overflow-hidden rounded-t-xl bg-navy px-6 pt-7 pb-6 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-24 size-64 rounded-full bg-primary/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />
          <DialogTitle asChild>
            <div className="relative flex items-end gap-2.5">
              <BrandLogo tone="onNavy" className="h-14" />
              <span className="mb-1 rounded-full bg-white/15 px-2 py-0.5 text-xs text-white/80 tabular" data-testid="about-version">
                v{CURRENT_VERSION.version}
              </span>
              <span className="sr-only">About Streamline</span>
            </div>
          </DialogTitle>
          <DialogDescription className="relative mt-4 max-w-md text-[13px] leading-relaxed text-white/70">
            Work management for the RMIT creative and marketing team: campaign production, creative requests and publication work across the Melbourne and Vietnam teams.
          </DialogDescription>
        </div>

        <div className="space-y-5 px-6 pt-5 pb-6">
          <ul className="grid gap-2.5 text-[13px]">
            <Feature icon={LayoutList}>
              One board, seven views: table, kanban, timeline, calendar, gantt, workload and chart, with subitems, dependencies and items linked across boards
            </Feature>
            <Feature icon={ShoppingBag}>Task booking on a form the team shapes itself, saved as templates and open to stakeholders without an account</Feature>
            <Feature icon={Boxes}>Deliverables listed line by line on every task, ticked off as they land and summed up on the board</Feature>
            <Feature icon={Table2}>Trackers that replace the spreadsheets, in and out as .xlsx</Feature>
            <Feature icon={Inbox}>Updates, mentions and approvals gathered in one inbox</Feature>
          </ul>

        </div>

        {/* The small print: which build this is and where it runs. */}
        <footer className="rounded-b-xl border-t border-border/70 bg-surface/60 px-6 py-3.5" data-testid="about-facts">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Fact label="Workspace" value={ws.workspace.name} />
            <Fact label="Data" value={providerKind === "supabase" ? "Supabase · shared" : "This browser only"} />
            <Fact label="Deployment" value={DEPLOY_ENV} />
            <Fact label="Commit" value={shortBuildId(CURRENT_VERSION.buildId)} mono />
            <Fact label="Backend region" value={BACKEND_REGION ?? (projectRef ? `${projectRef} · region not set` : "—")} />
            <Fact label="Built" value={built && !Number.isNaN(built.getTime()) ? built.toLocaleDateString() : "—"} />
          </dl>
          <p className="mt-3 border-t border-border/60 pt-2.5 text-2xs text-muted-foreground">Built by Nguyen Tuan Danh</p>
        </footer>
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

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 uppercase">{label}</dt>
      <dd className={cn("truncate text-2xs text-foreground/90", mono && "font-mono")} title={value}>
        {value}
      </dd>
    </div>
  );
}

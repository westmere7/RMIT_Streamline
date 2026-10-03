"use client";

import { Boxes, Bug, ChartColumnBig, ChevronRight, Globe, Link2, Sparkles, Zap } from "lucide-react";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/features/auth/components/auth-shell";
import { useBugReportDialog } from "@/features/bug-report/bug-report-dialog";
import { useDataContext } from "@/features/data/data-context";
import { ChangelogDialog } from "@/features/version/changelog-dialog";
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
  const [changelogOpen, setChangelogOpen] = React.useState(false);
  const reportBug = useBugReportDialog((s) => s.show);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-hidden p-0" data-testid="about-dialog">
        {/* The brand, on the navy the sign-in screen uses. */}
        <div className="relative overflow-hidden rounded-t-2xl bg-navy px-6 pt-7 pb-6 text-white">
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
          <ul className="grid gap-3.5 text-[13px]" data-testid="about-features">
            <Feature icon={ChartColumnBig} title="Workspace dashboard">
              Delivery, workload and effort from every board in one place, shareable by link.
            </Feature>
            <Feature icon={Link2} title="Tasks linked across boards">
              One piece of work on two boards: fields, updates and deliverables stay in step.
            </Feature>
            <Feature icon={Zap} title="Automations">
              Rules run in the database the moment something changes, browser open or not.
            </Feature>
            <Feature icon={Globe} title="Booking and a portal for departments">
              A form that routes each request to the right board, and one link to follow it.
            </Feature>
            <Feature icon={Boxes} title="Deliverables, checklists and progress">
              Assets line by line with owners and dates, summed up live on every board.
            </Feature>
          </ul>

          <button
            type="button"
            onClick={() => setChangelogOpen(true)}
            className="group flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-surface/50 px-3 py-2.5 text-left text-[13px] transition-colors hover:border-border hover:bg-surface-strong/60"
            data-testid="about-changelog"
          >
            <Sparkles className="size-4 text-primary" />
            <span className="flex-1 font-medium">What&apos;s new</span>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              reportBug();
            }}
            className="group -mt-3 flex w-full items-center gap-2.5 rounded-xl border border-border/70 bg-surface/50 px-3 py-2.5 text-left text-[13px] transition-colors hover:border-border hover:bg-surface-strong/60"
            data-testid="about-report-bug"
          >
            <Bug className="size-4 text-muted-foreground" />
            <span className="flex-1 font-medium">Report a bug</span>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* The small print: which build this is and where it runs. */}
        <footer className="rounded-b-2xl border-t border-border/70 bg-surface/60 px-6 py-3.5" data-testid="about-facts">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Fact label="Workspace" value={ws.workspace.name} />
            <Fact label="Data" value={providerKind === "supabase" ? "Server · shared" : "This browser only"} />
            <Fact label="Deployment" value={DEPLOY_ENV} />
            <Fact label="Commit" value={shortBuildId(CURRENT_VERSION.buildId)} mono />
            <Fact label="Backend region" value={BACKEND_REGION ?? (projectRef ? `${projectRef} · region not set` : "—")} />
            <Fact label="Built" value={built && !Number.isNaN(built.getTime()) ? built.toLocaleDateString() : "—"} />
          </dl>
          <p className="mt-3 border-t border-border/60 pt-2.5 text-2xs text-muted-foreground">Built by Nguyen Tuan Danh</p>
        </footer>
      </DialogContent>
      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
    </Dialog>
  );
}

function Feature({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">{children}</span>
      </span>
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

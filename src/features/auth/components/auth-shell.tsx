"use client";

import { CheckCircle2, ClipboardList, SquareKanban, Table2 } from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { User } from "@/domain";
import { cn } from "@/lib/utils";

/**
 * The frame every signed-out screen shares: a navy brand panel on the left and
 * a card on the right. RMIT navy and red carry the identity; depth comes from a
 * soft red glow and a faint grid rather than from decoration. Nothing on the
 * panel moves — the only thing that animates on these screens is the progress
 * bar while something is being fetched.
 */
export function AuthShell({
  headline,
  lead,
  footnote,
  children,
  cardTestId,
  progress,
  wide,
  width,
  fill,
}: {
  headline: string;
  lead: string;
  /** Small print at the foot of the brand panel. */
  footnote?: React.ReactNode;
  children: React.ReactNode;
  cardTestId?: string;
  /** Shown as a thin sweeping bar along the top of the card while something is happening. */
  progress?: boolean;
  wide?: boolean;
  /** Card width; "lg" is the same as `wide`, "xl" and "2xl" fit long forms. */
  width?: "md" | "lg" | "xl" | "2xl";
  /**
   * The card fills the height of the screen and its children manage their own
   * scrolling (a fixed header over a scrolling body), instead of the page
   * growing with the content.
   */
  fill?: boolean;
}) {
  const widthClass = width === "2xl" ? "max-w-4xl" : width === "xl" ? "max-w-2xl" : wide || width === "lg" ? "max-w-lg" : "max-w-md";
  return (
    <main className={cn("flex bg-canvas", fill ? "h-screen" : "min-h-screen")}>
      <section className="relative hidden w-[440px] shrink-0 flex-col justify-between overflow-hidden bg-navy p-10 text-white lg:flex xl:w-[520px]" aria-hidden>
        {/* Depth: a red glow low on the panel, a blue one high, and a faint grid. */}
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[560px] rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute -top-32 -right-24 size-[420px] rounded-full bg-[#4b52d6]/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_80%)]" />

        <div className="relative flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">Streamline</p>
            <p className="text-xs text-white/60">RMIT Creative Team</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <h1 className="max-w-md text-[34px] leading-[1.15] font-semibold tracking-tight text-balance">{headline}</h1>
          <p className="max-w-sm text-[15px] leading-relaxed text-white/70">{lead}</p>
          <ul className="grid gap-2.5 pt-1 text-[13px] text-white/75">
            <Feature icon={SquareKanban}>Boards for campaigns, requests and publications</Feature>
            <Feature icon={Table2}>Trackers that replace the studio spreadsheets</Feature>
            <Feature icon={ClipboardList}>Approvals, updates and mentions in one inbox</Feature>
          </ul>
        </div>

        <div className="relative text-xs text-white/50">{footnote}</div>
      </section>

      <section className={cn("relative flex flex-1 flex-col items-center justify-center gap-6 p-6 sm:p-10", fill && "min-h-0 overflow-hidden")}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--accent-soft)_0%,transparent_55%)] opacity-70 dark:opacity-40" />
        {/* On a phone the brand panel is hidden, so the mark sits above the card instead. */}
        <div className={cn("relative flex w-full items-center gap-3 lg:hidden", widthClass)}>
          <BrandMark />
          <div className="leading-tight">
            <p className="text-[15px] font-semibold tracking-tight">Streamline</p>
            <p className="text-xs text-muted-foreground">RMIT Creative Team</p>
          </div>
        </div>
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-2xl border border-border/60 bg-background shadow-[0_24px_60px_-24px_rgba(0,0,84,0.35)]",
            fill ? "flex min-h-0 flex-1 flex-col" : "p-7 sm:p-8",
            widthClass,
          )}
          data-testid={cardTestId}
        >
          {progress && <span aria-hidden className="auth-sweep absolute inset-x-0 top-0 h-0.5" />}
          {children}
        </div>
      </section>
    </main>
  );
}

export function BrandMark({ className, pulse }: { className?: string; pulse?: boolean }) {
  return (
    <span className={cn("relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-[15px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(230,30,42,0.8)]", className)}>
      {pulse && <span aria-hidden className="absolute inset-0 rounded-xl bg-primary/40 animate-ping [animation-duration:2.4s]" />}
      <span className="relative">R</span>
    </span>
  );
}

function Feature({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className="flex size-6 items-center justify-center rounded-md bg-white/10">
        <Icon className="size-3.5" />
      </span>
      {children}
    </li>
  );
}

/**
 * What the card shows while a session is being checked or a sign-in is
 * finishing: who is coming in (once known), what is happening, and one bar that
 * fills a third at a time across the three steps (sign in, find the workspace,
 * open it). Deliberately small; it sits inside the card instead of replacing
 * the page.
 */
export function SessionProgress({ user, message, done, step }: { user?: User | null; message: string; done?: boolean; step?: 1 | 2 | 3 }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/70 px-3.5 py-3" role="status" aria-live="polite" data-testid="session-progress">
      <div className="flex items-center gap-3">
        {user ? <UserAvatar user={user} size="md" tooltip={false} /> : <BrandMark className="size-9 rounded-lg text-sm" />}
        <div className="min-w-0 flex-1 leading-tight">
          {user && <p className="truncate text-[13px] font-medium">Welcome back, {user.firstName}</p>}
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {message}
            {!done && <Dots />}
          </p>
        </div>
        {done && <CheckCircle2 className="size-4 shrink-0 text-green-600 dark:text-green-400" />}
      </div>
      {step && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Sign-in progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done ? 3 : step}>
          <span className={cn("block h-full rounded-full bg-primary transition-[width] duration-500", !done && "gate-glow")} style={{ width: `${(done ? 3 : step) * (100 / 3)}%` }} />
        </div>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1 rounded-full bg-current opacity-40 animate-pulse" style={{ animationDelay: `${i * 160}ms` }} />
      ))}
    </span>
  );
}

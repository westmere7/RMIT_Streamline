"use client";

import { useQuery } from "@tanstack/react-query";
import { format, isSameYear } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  ArrowRightLeft,
  BadgeCheck,
  CheckCircle2,
  CircleDot,
  ClipboardPen,
  Clock,
  Flag,
  Hourglass,
  Milestone as MilestoneIcon,
  MoveRight,
  PackageCheck,
  PackagePlus,
  Plus,
  RotateCcw,
  Route,
  Send,
  Users,
} from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, StatusColumnSettings } from "@/domain";
import { useItemActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { useItemAssets } from "@/features/items/asset-hooks";
import { buildJourney, formatSpan, type Journey, type JourneyPhase, type JourneyStatus, type Milestone, type MilestoneKind } from "@/features/journey/journey";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

/** How each kind of milestone is drawn: an icon on a disc of its own colour. */
const KIND: Record<MilestoneKind, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  booked: { icon: ClipboardPen, color: "#8b5cf6" },
  created: { icon: Plus, color: "#64748b" },
  allocated: { icon: Send, color: "#f59e0b" },
  moved: { icon: ArrowRightLeft, color: "#0ea5e9" },
  stage: { icon: MoveRight, color: "#64748b" },
  status: { icon: CircleDot, color: "#3b82f6" },
  done: { icon: CheckCircle2, color: "#10b981" },
  "assets-added": { icon: PackagePlus, color: "#6366f1" },
  "asset-done": { icon: PackageCheck, color: "#14b8a6" },
  "assets-complete": { icon: BadgeCheck, color: "#10b981" },
  "asset-reopened": { icon: RotateCcw, color: "#f97316" },
  archived: { icon: Archive, color: "#475569" },
  restored: { icon: ArchiveRestore, color: "#0ea5e9" },
};

const PHASE_COLOR: Record<JourneyPhase["key"], string> = { queue: "#f59e0b", team: "#3b82f6", wrap: "#10b981" };

/**
 * The task's journey, as a pop-up: where it came from, where it went, how long
 * each leg took, and — while it is still going — how long it has been sitting
 * where it is now. Built from the activity log (see `buildJourney`).
 */
export function TaskJourneyDialog({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0" data-testid="task-journey">
        {open && <JourneyBody item={item} />}
      </DialogContent>
    </Dialog>
  );
}

function JourneyBody({ item }: { item: Item }) {
  const ws = useWorkspace();
  const services = useServices();
  const activity = useItemActivity(item.id);
  const assets = useItemAssets(item.id);
  const columns = useQuery({ queryKey: queryKeys.boardColumns(item.boardId), queryFn: () => services.repos.boards.listColumns(item.boardId), staleTime: 60_000 });
  // "Now" moves on while the pop-up is open, so a journey still going keeps counting.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const statuses = React.useMemo(
    () =>
      (columns.data ?? [])
        .filter((c) => c.type === "STATUS")
        .flatMap((c) => {
          const settings = c.settings as StatusColumnSettings;
          return settings.labels.map((l) => ({ name: l.name, color: l.color, done: (settings.doneLabelIds ?? []).includes(l.id) }));
        }),
    [columns.data],
  );
  const queueBoardName = ws.boards.find((b) => b.system === "TASK_ALLOCATION")?.name ?? null;
  const journey = React.useMemo(() => buildJourney(activity.data ?? [], { statuses, queueBoardName, now }), [activity.data, statuses, queueBoardName, now]);
  const loading = activity.isLoading || columns.isLoading;

  return (
    <>
      <Header item={item} journey={journey} loading={loading} />
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-20" />
            <Skeleton className="h-10" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : journey.milestones.length === 0 ? (
          <p className="p-10 text-center text-[13px] text-muted-foreground">Nothing recorded for this task yet.</p>
        ) : (
          <>
            <Figures journey={journey} deliverables={assets.data ? { done: assets.data.filter((a) => a.completedAt !== null).length, total: assets.data.length } : null} />
            <StatusTime journey={journey} />
            <Timeline journey={journey} now={now} />
          </>
        )}
      </div>
    </>
  );
}

// ---- header ------------------------------------------------------------------

function Header({ item, journey, loading }: { item: Item; journey: Journey; loading: boolean }) {
  const lead = journey.booking
    ? [journey.booking.via === "portal" ? "Booked through the portal" : "Booked", journey.booking.requesterName ? `by ${journey.booking.requesterName}` : null, journey.booking.department ? `for ${journey.booking.department}` : null].filter(Boolean).join(" ")
    : "Created";
  return (
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border/70 px-6 pt-5 pb-4 pr-14">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
          <Route className="size-3.5 text-primary" /> Task journey
        </p>
        <DialogTitle className="mt-1.5 flex min-w-0 items-center gap-2.5 text-[20px] leading-tight font-semibold tracking-tight">
          {item.ticket && <span className="shrink-0 rounded-md bg-surface-strong px-1.5 py-0.5 font-mono text-[12px] font-medium text-muted-foreground">{item.ticket}</span>}
          <span className="truncate">{item.name}</span>
        </DialogTitle>
        <DialogDescription className="mt-1 text-[13px]">{loading || !journey.start ? " " : `${lead} · ${stamp(journey.start)}`}</DialogDescription>
      </div>
      {!loading && journey.start && (
        <div className="text-right" data-testid="journey-total">
          <p className="text-[30px] leading-none font-semibold tracking-tight tabular">{formatSpan(journey.totalMs)}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
            {journey.ongoing ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                so far{journey.current ? ` · ${journey.current.name}` : ""}
              </>
            ) : (
              <>
                <Flag className="size-3" /> end to end · archived
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ---- the four figures ----------------------------------------------------------

function Figures({ journey, deliverables }: { journey: Journey; deliverables: { done: number; total: number } | null }) {
  const queue = journey.phases.find((p) => p.key === "queue");
  const team = journey.phases.find((p) => p.key === "team");
  // The task's deliverables as they stand, which the log may not have seen arrive.
  const lastProgress = deliverables && deliverables.total > 0 ? deliverables : ([...journey.milestones].reverse().find((m) => m.progress)?.progress ?? null);
  return (
    <div className="grid grid-cols-2 gap-px border-b border-border/70 bg-border/60 sm:grid-cols-4" data-testid="journey-figures">
      <FigureCell icon={Hourglass} color={PHASE_COLOR.queue} label="In the queue" value={queue ? formatSpan(queue.ms) : "—"} hint={queue ? (queue.open ? "waiting to be allocated" : "booking to allocation") : "went straight to a team"} />
      <FigureCell icon={Users} color={PHASE_COLOR.team} label="With the team" value={team ? formatSpan(team.ms) : "—"} hint={team ? (team.open ? "still being worked on" : "allocation to done") : "not with a team yet"} />
      <FigureCell
        icon={PackageCheck}
        color="#14b8a6"
        label="Deliverables"
        value={lastProgress ? `${lastProgress.done}/${lastProgress.total}` : "—"}
        hint={lastProgress ? `${lastProgress.total ? Math.round((lastProgress.done / lastProgress.total) * 100) : 0}% delivered` : "none listed"}
        progress={lastProgress && lastProgress.total ? lastProgress.done / lastProgress.total : undefined}
      />
      <FigureCell icon={MilestoneIcon} color="#8b5cf6" label="Milestones" value={String(journey.milestones.length)} hint={`${journey.statusChanges} status ${journey.statusChanges === 1 ? "change" : "changes"}`} />
    </div>
  );
}

function FigureCell({ icon: Icon, color, label, value, hint, progress }: { icon: React.ComponentType<{ className?: string }>; color: string; label: string; value: string; hint: string; progress?: number }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md" style={{ background: `${color}1f`, color }}>
          <Icon className="size-3.5" />
        </span>
        {label}
      </p>
      <p className="mt-2 text-[24px] leading-none font-semibold tracking-tight tabular">{value}</p>
      {progress !== undefined && (
        <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-full bg-surface-strong">
          <span className="block h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: color }} />
        </span>
      )}
      <p className="mt-1.5 text-2xs text-muted-foreground">{hint}</p>
    </div>
  );
}

// ---- time in each status ----------------------------------------------------------

/**
 * How long the task spent in each status, longest first: a row per status with
 * its share drawn as a bar, the time itself large enough to read at a glance,
 * and the status it is in now marked as still running.
 */
function StatusTime({ journey }: { journey: Journey }) {
  if (journey.inStatus.length === 0) return null;
  const total = Math.max(1, journey.inStatus.reduce((sum, s) => sum + s.ms, 0));
  const longest = Math.max(1, ...journey.inStatus.map((s) => s.ms));
  const rows = [...journey.inStatus].sort((a, b) => b.ms - a.ms);
  const current = journey.ongoing ? journey.current?.name.toLowerCase() : undefined;
  return (
    <section className="border-b border-border/70 px-6 py-5" data-testid="journey-status-time">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Time in each status</h3>
        <p className="text-2xs text-muted-foreground tabular">{formatSpan(total)} in total</p>
      </div>
      <ul className="mt-3 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
        {rows.map((status) => {
          const color = statusHex(status);
          const share = status.ms / total;
          const now = current === status.name.toLowerCase();
          return (
            <li key={status.name} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-4 border-b border-border/50 px-4 py-3 last:border-b-0" data-testid="journey-status-row">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="relative flex size-2.5 shrink-0">
                  {now && <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
                  <span className="relative inline-flex size-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 0 3px ${color}26` }} />
                </span>
                <span className="truncate text-[13px] font-medium">{status.name}</span>
                {now && <span className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase" style={{ background: `${color}1f`, color }}>Now</span>}
              </span>
              <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-strong/80">
                <span
                  className={cn("block h-full rounded-full", now && "progress-stripes")}
                  style={{ width: `${Math.max(2, (status.ms / longest) * 100)}%`, background: `linear-gradient(90deg, ${color}b3, ${color})` }}
                />
              </span>
              <span className="flex items-baseline justify-end gap-2 text-right">
                <span className="text-[15px] font-semibold tracking-tight tabular">{formatSpan(status.ms)}</span>
                <span className="w-9 text-2xs text-muted-foreground tabular">{Math.round(share * 100)}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- the timeline --------------------------------------------------------------------

function Timeline({ journey, now }: { journey: Journey; now: Date }) {
  const ws = useWorkspace();
  const last = journey.milestones[journey.milestones.length - 1];
  const idle = last && journey.ongoing ? now.getTime() - new Date(last.at).getTime() : 0;
  return (
    <ol className="relative px-6 pt-5 pb-7" data-testid="journey-timeline">
      {journey.milestones.map((m, index) => (
        <React.Fragment key={m.id}>
          {m.sincePrev !== null && <Gap ms={m.sincePrev} />}
          <Step milestone={m} index={index} actor={ws.userById(m.actorId)} />
        </React.Fragment>
      ))}
      {journey.ongoing ? (
        <>
          <Gap ms={idle} live />
          <Terminal
            live
            icon={Clock}
            title="Still going"
            detail={journey.current ? `${formatSpan(idle)} since the last milestone · currently ${journey.current.name}` : `${formatSpan(idle)} since the last milestone`}
            index={journey.milestones.length}
          />
        </>
      ) : (
        <Terminal icon={Flag} title="Journey complete" detail={`${formatSpan(journey.totalMs)} from ${journey.booking ? "booking" : "creation"} to archive`} index={journey.milestones.length} />
      )}
    </ol>
  );
}

/** The rail between two milestones, with how long passed along it. */
function Gap({ ms, live }: { ms: number; live?: boolean }) {
  return (
    <li aria-hidden className="grid grid-cols-[5.5rem_2rem_1fr] gap-x-3">
      <span />
      <span className="relative flex justify-center">
        <span className={cn("w-0.5 rounded-full", live ? "bg-[repeating-linear-gradient(to_bottom,var(--border)_0_4px,transparent_4px_8px)]" : "bg-border")} style={{ minHeight: "2.25rem" }} />
      </span>
      <span className="flex items-center">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular">
          <Clock className="size-2.5" /> {formatSpan(ms)} {live ? "and counting" : "later"}
        </span>
      </span>
    </li>
  );
}

function Step({ milestone: m, index, actor }: { milestone: Milestone; index: number; actor: ReturnType<ReturnType<typeof useWorkspace>["userById"]> }) {
  const kind = KIND[m.kind];
  const color = m.kind === "status" && m.to ? statusHex(m.to) : kind.color;
  const Icon = kind.icon;
  const major = m.kind === "booked" || m.kind === "allocated" || m.kind === "done" || m.kind === "assets-complete" || m.kind === "archived";
  return (
    <li className="grid grid-cols-[5.5rem_2rem_1fr] gap-x-3 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500" style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }} data-testid="journey-step" data-kind={m.kind}>
      <div className="pt-2.5 text-right">
        <p className="text-[12px] font-medium tabular">{dayLabel(m.at)}</p>
        <p className="text-2xs text-muted-foreground tabular">{format(new Date(m.at), "HH:mm")}</p>
      </div>
      <div className="flex justify-center pt-1.5">
        <span className={cn("relative z-10 flex items-center justify-center rounded-full text-white shadow-sm", major ? "size-8" : "size-7")} style={{ background: color, boxShadow: `0 0 0 4px var(--card), 0 0 0 5px ${color}40${major ? `, 0 6px 18px -4px ${color}90` : ""}` }}>
          <Icon className={major ? "size-4" : "size-3.5"} />
        </span>
      </div>
      <div className={cn("min-w-0 rounded-xl border bg-card px-3.5 py-2.5 shadow-xs", major ? "border-border" : "border-border/60")} style={major ? { backgroundImage: `linear-gradient(135deg, ${color}14, transparent 60%)` } : undefined}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className={cn("text-[13px] font-semibold", major && "text-[14px]")}>{m.title}</p>
          {m.detail && <p className="min-w-0 truncate text-[12px] text-muted-foreground">{m.detail}</p>}
        </div>
        {(m.from || m.to) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {m.from && <StatusChip status={m.from} faded />}
            {m.from && m.to && <MoveRight className="size-3 text-muted-foreground" />}
            {m.to && <StatusChip status={m.to} />}
          </div>
        )}
        {m.progress && m.progress.total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-strong">
              <span className="block h-full rounded-full" style={{ width: `${Math.round((m.progress.done / m.progress.total) * 100)}%`, background: color }} />
            </span>
            <span className="text-2xs text-muted-foreground tabular">
              {m.progress.done} of {m.progress.total} delivered
            </span>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted-foreground">
          {actor && (
            <span className="inline-flex items-center gap-1.5">
              <UserAvatar user={actor} size="xs" />
              {actor.displayName}
            </span>
          )}
          <span className="tabular">{m.sinceStart === 0 ? "Start" : `+${formatSpan(m.sinceStart)} from start`}</span>
        </div>
      </div>
    </li>
  );
}

function Terminal({ icon: Icon, title, detail, live, index }: { icon: React.ComponentType<{ className?: string }>; title: string; detail: string; live?: boolean; index: number }) {
  return (
    <li className="grid grid-cols-[5.5rem_2rem_1fr] gap-x-3 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500" style={{ animationDelay: `${Math.min(index, 12) * 55}ms` }} data-testid="journey-end">
      <div className="pt-2 text-right text-[12px] font-medium text-muted-foreground">{live ? "Now" : ""}</div>
      <div className="flex justify-center pt-1">
        <span className={cn("relative flex size-8 items-center justify-center rounded-full", live ? "bg-emerald-500 text-white" : "bg-foreground text-background")} style={{ boxShadow: "0 0 0 4px var(--card)" }}>
          {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />}
          <Icon className="relative size-4" />
        </span>
      </div>
      <div className="pt-1.5">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="text-[12px] text-muted-foreground">{detail}</p>
      </div>
    </li>
  );
}

function StatusChip({ status, faded }: { status: JourneyStatus; faded?: boolean }) {
  const classes = status.color ? colorClasses(status.color).soft : "bg-surface-strong text-foreground/80";
  return <span className={cn("rounded-md px-1.5 py-0.5 text-2xs font-medium", classes, faded && "opacity-60")}>{status.name}</span>;
}

// ---- helpers -----------------------------------------------------------------------------

function statusHex(status: JourneyStatus): string {
  if (status.color) return colorClasses(status.color).hex;
  return status.done ? "#10b981" : "#64748b";
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  return format(date, isSameYear(date, new Date()) ? "MMM d" : "MMM d, yyyy");
}

function stamp(iso: string): string {
  const date = new Date(iso);
  return format(date, isSameYear(date, new Date()) ? "MMM d, HH:mm" : "MMM d yyyy, HH:mm");
}

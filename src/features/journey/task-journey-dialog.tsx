"use client";

import { useItemAssets } from "@/features/items/asset-hooks";
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
  MoveRight,
  PackageCheck,
  PackagePlus,
  Plus,
  RotateCcw,
  Route,
  Send,
} from "lucide-react";
import * as React from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item, StatusColumnSettings } from "@/domain";
import { useItemActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { buildJourney, formatSpan, type Journey, type JourneyStatus, type Milestone, type MilestoneKind } from "@/features/journey/journey";
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
  const assets = useItemAssets(item.id);
  const assetCount = assets.data?.length;
  const journey = React.useMemo(() => buildJourney(activity.data ?? [], { statuses, queueBoardName, now, assetCount }), [activity.data, statuses, queueBoardName, now, assetCount]);
  const loading = activity.isLoading || columns.isLoading || assets.isLoading;

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

// ---- time in each status ----------------------------------------------------------

/**
 * How long the task spent in each status, as one bar: a segment per status,
 * longest first, its width its share of the whole. A segment wide enough
 * carries its label underneath; one too thin to label points to its label
 * with a line, each on a lane of its own so two slivers side by side never
 * write over each other. The status it is in now is striped and marked.
 */
function StatusTime({ journey }: { journey: Journey }) {
  if (journey.inStatus.length === 0) return null;
  const total = Math.max(1, journey.inStatus.reduce((sum, s) => sum + s.ms, 0));
  const current = journey.ongoing ? journey.current?.name.toLowerCase() : undefined;
  const ordered = [...journey.inStatus].sort((a, b) => b.ms - a.ms);
  const segments = ordered.map((status, index) => {
    const share = status.ms / total;
    // Where it starts: the shares of the longer ones before it.
    const start = ordered.slice(0, index).reduce((sum, s) => sum + s.ms / total, 0);
    return { status, share, mid: start + share / 2, color: statusHex(status), now: current === status.name.toLowerCase() };
  });
  // Wide enough for a name and a time underneath; anything thinner gets a line.
  const WIDE = 0.16;
  const wide = segments.filter((s) => s.share >= WIDE);
  const thin = segments.filter((s) => s.share < WIDE);
  const BAR = 14;
  const LABELS = BAR + 10;
  const LANES = LABELS + (wide.length ? 42 : 0) + 6;
  const LANE = 24;
  const height = LANES + thin.length * LANE;
  const percent = (share: number) => (share > 0 && share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`);

  return (
    <section className="border-b border-border/70 px-6 py-5" data-testid="journey-status-time">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">Time in each status</h3>
        <p className="text-2xs text-muted-foreground tabular">{formatSpan(total)} in total</p>
      </div>
      <div className="mt-3 rounded-xl border border-border/70 bg-card px-5 pt-5 pb-3 shadow-xs">
        <div className="relative" style={{ height }}>
          <div className="absolute inset-x-0 top-0 flex gap-px overflow-hidden rounded-full bg-surface-strong/80" style={{ height: BAR }}>
            {segments.map((s) => (
              <span
                key={s.status.name}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", s.now && "progress-stripes")}
                // A sliver still shows: a status held for seconds is still a status it was in.
                style={{ width: `${Math.max(s.share * 100, 0.6)}%`, background: s.color }}
                title={`${s.status.name}: ${formatSpan(s.status.ms)}`}
                data-testid="journey-status-segment"
              />
            ))}
          </div>

          {wide.map((s) => (
            <div key={s.status.name} className="absolute -translate-x-1/2 px-1 text-center" style={{ left: `${s.mid * 100}%`, top: LABELS, maxWidth: `${s.share * 100}%` }} data-testid="journey-status-row">
              <StatusLabel name={s.status.name} color={s.color} now={s.now} />
              <p className="mt-0.5 text-[12px] tabular">
                <span className="font-semibold">{formatSpan(s.status.ms)}</span> <span className="text-muted-foreground">{percent(s.share)}</span>
              </p>
            </div>
          ))}

          {thin.map((s, lane) => {
            const x = s.mid * 100;
            const toLeft = x > 55;
            const top = LANES + lane * LANE;
            return (
              <React.Fragment key={s.status.name}>
                <span aria-hidden className="absolute w-px bg-muted-foreground/45" style={{ left: `${x}%`, top: BAR + 2, height: top + 9 - (BAR + 2) }} />
                <span aria-hidden className="absolute size-1.5 -translate-x-1/2 rounded-full" style={{ left: `${x}%`, top: top + 6, background: s.color }} />
                <div
                  className="absolute flex items-center gap-2 whitespace-nowrap"
                  style={{ top, ...(toLeft ? { right: `calc(${100 - x}% + 10px)` } : { left: `calc(${x}% + 10px)` }) }}
                  data-testid="journey-status-row"
                >
                  <StatusLabel name={s.status.name} color={s.color} now={s.now} />
                  <span className="text-[12px] tabular">
                    <span className="font-semibold">{formatSpan(s.status.ms)}</span> <span className="text-muted-foreground">{percent(s.share)}</span>
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** A status's name in its colour, and "Now" when the task is in it. */
function StatusLabel({ name, color, now }: { name: string; color: string; now: boolean }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate text-[12px] font-medium">{name}</span>
      {now && <span className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-wide uppercase" style={{ background: `${color}1f`, color }}>Now</span>}
    </span>
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

"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardPen, Clock, ListTodo, Star } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Skeleton, SkeletonLine } from "@/components/ui/skeleton";
import type { Board } from "@/domain";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { ActivitySkeleton } from "@/features/activity/activity-skeleton";
import { useWorkspaceActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { MobileTaskList, MobileTaskRow } from "@/features/mobile/task-row";
import { MyWorkMobileSkeleton } from "@/features/my-work/my-work-skeleton";
import { useMyWork } from "@/features/my-work/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { isOverdue, isToday } from "@/lib/dates/dates";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { NotificationPrompt } from "@/features/notifications/notification-prompt";

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Home on a phone: what needs doing, then where to find things.
 *
 * The desktop home opens with six recent boards, which on a phone is a screen
 * and a half of navigation before a single task. Here the day comes first — what
 * is overdue, what is due today — then the work itself, and boards are a row of
 * chips rather than a stack of cards.
 */
export function HomeMobile() {
  const ws = useWorkspace();
  const services = useServices();
  const now = React.useMemo(() => new Date(), []);

  const recent = useQuery({
    queryKey: queryKeys.recentBoards(ws.currentUser.id),
    queryFn: () => services.repos.admin.listRecentBoardIds(ws.currentUser.id, 6),
  });
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const activity = useWorkspaceActivity(ws.workspace.id, 8);

  const visible = (b: Board | undefined): b is Board => !!b && b.archivedAt === null && canViewBoard(ws.permissions, b);
  const recentBoards = (recent.data ?? []).map((id) => ws.boardById(id)).filter(visible);
  const favouriteBoards = ws.boards.filter((b) => ws.isFavourite(b.id) && visible(b));
  const chips = [...favouriteBoards, ...recentBoards.filter((b) => !favouriteBoards.some((f) => f.id === b.id))].slice(0, 8);

  const counted = !!myWork.data;
  const open = (myWork.data ?? []).filter((entry) => !entry.isDone);
  const overdue = open.filter((entry) => isOverdue(entry.dueDate, now));
  const today = open.filter((entry) => isToday(entry.dueDate, now));
  const next = open
    .slice()
    .sort((a, b) => {
      const rank = (d: string | null) => (isOverdue(d, now) ? 0 : isToday(d, now) ? 1 : d ? 2 : 3);
      return rank(a.dueDate) - rank(b.dueDate) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    })
    .slice(0, 5);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-8">
        <h1 className="text-lg font-semibold tracking-tight">
          {greeting(now)}, {ws.currentUser.firstName}
        </h1>
        <p className="text-[13px] text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        <NotificationPrompt className="mt-4" />

        {/* What the day looks like, before anything else — and nothing at all
            until it is known. Three noughts that turn into "4 overdue" a second
            later have already told somebody their morning is clear. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Tally label="Overdue" value={counted ? overdue.length : null} tone="warn" href={routes.myWork(ws.slug)} />
          <Tally label="Due today" value={counted ? today.length : null} href={routes.myWork(ws.slug)} />
          <Tally label="Open" value={counted ? open.length : null} href={routes.myWork(ws.slug)} />
        </div>

        <Heading title="Your work" href={routes.myWork(ws.slug)} action="My Work" icon={ListTodo} />
        {myWork.isLoading ? (
          <MyWorkMobileSkeleton sections={1} rows={3} />
        ) : next.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 px-3 py-6 text-center text-[13px] text-muted-foreground">
            Nothing assigned to you right now.
          </p>
        ) : (
          <MobileTaskList data-testid="home-my-work">
            {next.map((entry) => (
              <MobileTaskRow key={entry.item.id} entry={entry} now={now} />
            ))}
          </MobileTaskList>
        )}

        {(chips.length > 0 || recent.isLoading) && (
          <>
            <Heading title="Boards" href={routes.browse(ws.slug)} action="Browse" icon={Star} />
            {/* A row that scrolls inside itself, so the page never does. */}
            <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4" data-testid="home-boards">
              {/* Favourites are known from the workspace and drawn at once; the
                  recently visited are a read, so the row keeps their places
                  rather than growing chips sideways a moment later. */}
              <ul className="flex w-max gap-2 pb-1">
                {chips.map((board) => (
                  <li key={board.id}>
                    <Link
                      href={ws.boardPath(board)}
                      className="flex h-11 max-w-56 items-center gap-2 rounded-xl border border-border/70 bg-card px-3 active:bg-accent/70"
                    >
                      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", colorClasses(board.color).solid)}>
                        <DynamicIcon name={board.icon} className="size-3.5" />
                      </span>
                      <span className="truncate text-[13px] font-medium">{board.name}</span>
                    </Link>
                  </li>
                ))}
                {recent.isLoading &&
                  Array.from({ length: Math.max(1, 4 - chips.length) }).map((_, i) => <Skeleton key={`pending-${i}`} className="h-11 w-36 rounded-xl" />)}
              </ul>
            </div>
          </>
        )}

        <Heading title="Portal and Booking" href={routes.book(ws.slug)} action="Open" icon={ClipboardPen} />
        <Link
          href={routes.book(ws.slug)}
          className="flex min-h-14 items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2 active:bg-accent/70"
        >
          <ClipboardPen aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-[13px] text-muted-foreground">Ask the creative team for work.</span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
        </Link>

        <Heading title="Recent activity" icon={Clock} />
        <div className="rounded-xl border border-border/70 bg-card px-3 py-1">
          {activity.isLoading ? <ActivitySkeleton rows={4} className="divide-y divide-border/60" /> : <ActivityFeed activities={activity.data ?? []} showItem emptyTitle="Nothing has happened yet." />}
        </div>
      </div>
    </div>
  );
}

/** One figure off My Work, or the space it is about to take. */
function Tally({ label, value, tone, href }: { label: string; value: number | null; tone?: "warn"; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border/70 bg-card px-3 py-2.5 active:bg-accent/70" data-testid="home-tally">
      <span className={cn("block text-xl font-semibold tabular", tone === "warn" && (value ?? 0) > 0 && "text-red-600 dark:text-red-400")}>
        {value ?? <SkeletonLine className="w-6" />}
      </span>
      <span className="block text-xs text-muted-foreground">{label}</span>
    </Link>
  );
}

function Heading({ title, href, action, icon: Icon }: { title: string; href?: string; action?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mt-6 mb-2 flex items-center gap-2 px-1">
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">{title}</h2>
      {href && action && (
        <Link href={href} className="flex h-11 items-center gap-1 px-1 text-[13px] font-medium text-muted-foreground">
          {action} <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

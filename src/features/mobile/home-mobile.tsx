"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardPen, Clock, ListTodo, Star } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board } from "@/domain";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useWorkspaceActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { MobileTaskList, MobileTaskRow } from "@/features/mobile/task-row";
import { useMyWork } from "@/features/my-work/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { isOverdue, isToday } from "@/lib/dates/dates";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

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

        {/* What the day looks like, before anything else. */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Tally label="Overdue" value={overdue.length} tone={overdue.length > 0 ? "warn" : undefined} href={routes.myWork(ws.slug)} />
          <Tally label="Due today" value={today.length} href={routes.myWork(ws.slug)} />
          <Tally label="Open" value={open.length} href={routes.myWork(ws.slug)} />
        </div>

        <Heading title="Your work" href={routes.myWork(ws.slug)} action="My Work" icon={ListTodo} />
        {myWork.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
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

        {chips.length > 0 && (
          <>
            <Heading title="Boards" href={routes.browse(ws.slug)} action="Browse" icon={Star} />
            {/* A row that scrolls inside itself, so the page never does. */}
            <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4" data-testid="home-boards">
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
              </ul>
            </div>
          </>
        )}

        <Heading title="Stakeholder Portal" href={routes.book(ws.slug)} action="Open" icon={ClipboardPen} />
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
          {activity.isLoading ? <Skeleton className="my-2 h-24" /> : <ActivityFeed activities={activity.data ?? []} showItem emptyTitle="Nothing has happened yet." />}
        </div>
      </div>
    </div>
  );
}

function Tally({ label, value, tone, href }: { label: string; value: number; tone?: "warn"; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-border/70 bg-card px-3 py-2.5 active:bg-accent/70">
      <span className={cn("block text-xl font-semibold tabular", tone === "warn" && value > 0 && "text-red-600 dark:text-red-400")}>{value}</span>
      <span className="block text-2xs text-muted-foreground">{label}</span>
    </Link>
  );
}

function Heading({ title, href, action, icon: Icon }: { title: string; href?: string; action?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mt-6 mb-2 flex items-center gap-2 px-1">
      <Icon aria-hidden className="size-4 text-muted-foreground" />
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">{title}</h2>
      {href && action && (
        <Link href={href} className="flex h-11 items-center gap-1 px-1 text-2xs font-medium text-muted-foreground">
          {action} <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

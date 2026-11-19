"use client";

import { RelativeTime } from "@/components/shared/relative-time";
import { useRecentTasks } from "@/features/items/item-visits";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, ListTodo } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { LabelPill } from "@/components/shared/label-pill";
import { SectionHeading } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board } from "@/domain";
import { isStuckLabel } from "@/domain";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { ActivitySkeleton } from "@/features/activity/activity-skeleton";
import { useWorkspaceActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { useMyWork } from "@/features/my-work/hooks";
import { HomeMobile } from "@/features/mobile/home-mobile";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue, isToday } from "@/lib/dates/dates";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { sectionFor } from "@/services/my-work-service";
import { NotificationPrompt } from "@/features/notifications/notification-prompt";
import { PortalLinks } from "@/features/portal/portal-links";

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Home, in the shape the screen calls for. Only one is mounted: the phone's
 * version asks for less and arranges it differently, and hiding one behind CSS
 * would run both sets of queries.
 */
export function HomePage() {
  const isMobile = useIsMobile();
  return isMobile ? <HomeMobile /> : <HomeDesktop />;
}

function HomeDesktop() {
  const ws = useWorkspace();
  const services = useServices();
  const now = React.useMemo(() => new Date(), []);

  const recent = useQuery({
    // Visits are kept across every workspace, so enough of them to still find six of this one's.
    queryKey: [...queryKeys.recentBoards(ws.currentUser.id), ws.workspace.id],
    queryFn: () => services.repos.admin.listRecentBoardIds(ws.currentUser.id, 60),
  });
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const activity = useWorkspaceActivity(ws.workspace.id, 40);

  const visible = (b: Board | undefined): b is Board => !!b && b.archivedAt === null && canViewBoard(ws.permissions, b);
  const recentBoards = (recent.data ?? []).map((id) => ws.boardById(id)).filter(visible).slice(0, 6);
  const favouriteBoards = ws.boards.filter((b) => ws.isFavourite(b.id) && visible(b));
  const importantWork = (myWork.data ?? [])
    .filter((entry) => !entry.isDone)
    .sort((a, b) => {
      const rank = (d: string | null) => (isOverdue(d, now) ? 0 : isToday(d, now) ? 1 : d ? 2 : 3);
      return rank(a.dueDate) - rank(b.dueDate) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
    })
    .slice(0, 7);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-6 xl:max-w-7xl xl:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {greeting(now)}, {ws.currentUser.firstName}
            </h1>
            <p className="text-[13px] text-muted-foreground">Here is what is moving across {ws.workspace.name}.</p>
          </div>
          <p className="text-[13px] text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        </header>
        <NotificationPrompt className="mb-6" />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            {/* The two links people are handed most, up front and large. */}
            <PortalLinks
              variant="cards"
              heading={
                <SectionHeading
                  action={
                    <Link href={routes.book(ws.slug)} className="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground">
                      Manage <ArrowRight className="size-3" />
                    </Link>
                  }
                >
                  Portal and Booking
                </SectionHeading>
              }
            />

            <section>
              <SectionHeading>Favourites</SectionHeading>
              {favouriteBoards.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/70 px-4 py-3 text-[13px] text-muted-foreground">Star a board to pin it here and in the sidebar.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {favouriteBoards.map((board) => (
                    <li key={board.id}>
                      <BoardCard board={board} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading>Recently visited</SectionHeading>
              {recent.isLoading ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-busy aria-label="Loading recently visited boards">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : recentBoards.length === 0 ? (
                <EmptyState icon={Clock} title="No boards visited yet" description="Open a board from the sidebar to see it here." compact />
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {recentBoards.map((board) => (
                    <li key={board.id}>
                      <BoardCard board={board} />
                    </li>
                  ))}
                </ul>
              )}
              <RecentTasks />
            </section>

            <section>
              <SectionHeading
                action={
                  <Link href={routes.myWork(ws.slug)} className="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground">
                    View all <ArrowRight className="size-3" />
                  </Link>
                }
              >
                My work
              </SectionHeading>
              <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
                {myWork.isLoading ? (
                  <HomeWorkSkeleton />
                ) : importantWork.length === 0 ? (
                  <EmptyState icon={ListTodo} title="Nothing assigned to you right now" compact />
                ) : (
                  <ul className="divide-y">
                    {importantWork.map((entry) => {
                      const section = sectionFor(entry, now);
                      return (
                        <li key={entry.item.id}>
                          <Link
                            href={ws.boardPath(entry.board, { itemId: entry.item.id })}
                            className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-accent sm:grid-cols-[minmax(0,1fr)_150px_130px_100px] sm:gap-4"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{entry.item.name}</span>
                              <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                                {entry.board.name}
                                {entry.group ? ` · ${entry.group.name}` : ""}
                                {entry.linkedBoards.length > 0 ? ` · also on ${entry.linkedBoards.map((b) => b.name).join(", ")}` : ""}
                              </span>
                            </span>
                            <span className="hidden sm:block">
                              <LabelPill label={entry.status} size="sm" striped={isStuckLabel(entry.statusColumn, entry.status?.id)} />
                            </span>
                            <span className="hidden sm:block">
                              <LabelPill label={entry.priority} appearance="soft" size="sm" />
                            </span>
                            <span
                              className={cn(
                                "text-right text-xs tabular",
                                section === "overdue" ? "font-medium text-red-600 dark:text-red-400" : section === "today" ? "font-medium text-foreground" : "text-muted-foreground",
                              )}
                            >
                              {entry.dueDate ? formatShortDate(entry.dueDate, now) : "—"}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* The whole right side is what is happening across the workspace. It
              stays in view and scrolls on its own, whatever the left side does. */}
          <aside className="space-y-8 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1 scrollbar-thin" data-testid="home-activity">
            <section>
              <SectionHeading>Recent activity</SectionHeading>
              {activity.isLoading ? (
                <ActivitySkeleton rows={5} className="divide-y" />
              ) : (
                <ActivityFeed activities={(activity.data ?? []).filter((a) => !a.boardId || visible(ws.boardById(a.boardId)))} showItem className="divide-y" />
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** The My Work card on Home, in the row shape that card uses. */
function HomeWorkSkeleton() {
  return (
    <ul className="divide-y" aria-busy aria-label="Loading your work" data-testid="home-work-skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px_130px_100px] sm:gap-4">
          <div className="min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="hidden h-5 w-24 rounded-full sm:block" />
          <Skeleton className="hidden h-5 w-16 rounded-full sm:block" />
          <Skeleton className="ml-auto h-3.5 w-12" />
        </li>
      ))}
    </ul>
  );
}

function BoardCard({ board }: { board: Board }) {
  const ws = useWorkspace();
  const team = ws.teamById(board.teamId);
  return (
    <Link href={ws.boardPath(board)} className="flex h-16 items-center gap-3 rounded-xl border border-border/70 bg-card px-3.5 shadow-xs transition-[background-color,border-color,box-shadow] hover:border-ring/60 hover:shadow-md">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-white", colorClasses(board.color).solid)}>
        <DynamicIcon name={board.icon} className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium">{board.name}</span>
        <span className="block truncate text-2xs text-muted-foreground">{team?.name ?? "No team"}</span>
      </span>
    </Link>
  );
}

/** The tasks this person opened most recently, under the boards they visited: back to one in a click. */
function RecentTasks() {
  const ws = useWorkspace();
  const tasks = useRecentTasks(6);
  if (tasks.isLoading) {
    return (
      <div className="mt-3 space-y-1.5" aria-busy aria-label="Loading recently visited tasks">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg" />
        ))}
      </div>
    );
  }
  if (!tasks.data || tasks.data.length === 0) return null;
  return (
    <ul className="mt-3 divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs" data-testid="home-recent-tasks">
      {tasks.data.map(({ item, board, visitedAt }) => (
        <li key={item.id}>
          <Link href={ws.boardPath(board, { itemId: item.id })} className="flex min-h-11 items-center gap-3 px-3.5 py-2 text-[13px] hover:bg-accent">
            <DynamicIcon name={board.icon} className={cn("size-4 shrink-0", colorClasses(board.color).text)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              <span className="block truncate text-2xs text-muted-foreground">{board.name}</span>
            </span>
            <RelativeTime iso={visitedAt} className="shrink-0 text-2xs text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

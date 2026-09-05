"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, ListTodo, Star, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { LabelPill } from "@/components/shared/label-pill";
import { SectionHeading } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board } from "@/domain";
import { isStuckLabel } from "@/domain";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useWorkspaceActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { useMyWork } from "@/features/my-work/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { formatShortDate, isOverdue, isToday } from "@/lib/dates/dates";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { sectionFor } from "@/services/my-work-service";

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const ws = useWorkspace();
  const services = useServices();
  const now = React.useMemo(() => new Date(), []);

  const recent = useQuery({
    queryKey: queryKeys.recentBoards(ws.currentUser.id),
    queryFn: () => services.repos.admin.listRecentBoardIds(ws.currentUser.id, 6),
  });
  const myWork = useMyWork(ws.workspace.id, ws.currentUser.id);
  const activity = useWorkspaceActivity(ws.workspace.id, 12);

  const visible = (b: Board | undefined): b is Board => !!b && b.archivedAt === null && canViewBoard(ws.permissions, b);
  const recentBoards = (recent.data ?? []).map((id) => ws.boardById(id)).filter(visible);
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

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            <section>
              <SectionHeading>Recently visited</SectionHeading>
              {recent.isLoading ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
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
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
                  </div>
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

          <aside className="space-y-8">
            <section>
              <SectionHeading>Favourites</SectionHeading>
              {favouriteBoards.length === 0 ? (
                <EmptyState icon={Star} title="No favourites yet" description="Star a board to pin it here and in the sidebar." compact />
              ) : (
                <ul className="space-y-1">
                  {favouriteBoards.map((board) => (
                    <li key={board.id}>
                      <BoardRow board={board} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading>Your teams</SectionHeading>
              {ws.myTeams.length === 0 ? (
                <EmptyState icon={Users} title="You are not in a team yet" compact />
              ) : (
                <ul className="space-y-1">
                  {ws.myTeams.map((team) => {
                    const members = ws.teamMembers.filter((m) => m.teamId === team.id);
                    return (
                      <li key={team.id}>
                        <Link href={routes.team(ws.slug, team.id)} className="flex h-9 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent">
                          <DynamicIcon name={team.icon} className={cn("size-4", colorClasses(team.color).text)} />
                          <span className="flex-1 truncate font-medium">{team.name}</span>
                          <span className="flex -space-x-1.5">
                            {members.slice(0, 4).map((m) => (
                              <UserAvatar key={m.id} user={ws.userById(m.userId)} size="xs" />
                            ))}
                          </span>
                          <span className="text-2xs text-muted-foreground tabular">{ws.boardsForTeam(team.id).length} boards</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section>
              <SectionHeading>Recent activity</SectionHeading>
              {activity.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
                </div>
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

function BoardRow({ board }: { board: Board }) {
  const ws = useWorkspace();
  return (
    <Link href={ws.boardPath(board)} className="flex h-9 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent">
      <DynamicIcon name={board.icon} className={cn("size-4", colorClasses(board.color).text)} />
      <span className="flex-1 truncate font-medium">{board.name}</span>
      <span className="truncate text-2xs text-muted-foreground">{ws.teamById(board.teamId)?.name}</span>
    </Link>
  );
}

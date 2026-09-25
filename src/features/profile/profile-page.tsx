"use client";

import { Boxes, CalendarCheck, Clock, History, Info, ListChecks, Mail, MessageSquare, Pencil, SquareKanban, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { WorkspaceRole } from "@/domain";
import { assetCount, formatWorkHours } from "@/domain";
import { describeActivity } from "@/features/activity/format-activity";
import { useCurrentUser } from "@/features/auth/auth-context";
import { RankedBars } from "@/features/dashboard/charts/ranked-bars";
import { assetTypeLabel } from "@/features/items/item-assets-recap";
import { EditProfileDialog } from "@/features/profile/edit-profile-dialog";
import { useProfile } from "@/features/profile/hooks";
import { STAKEHOLDER_LOAD_NOTE, StakeholderLoad } from "@/features/profile/stakeholder-load";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useMentionLinks } from "@/features/workspace/mention-link";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { bucketDate, formatShortDate, isOverdue } from "@/lib/dates/dates";
import { canManageMembers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { BoardRelation } from "@/services";

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" };
const RELATION_LABEL: Record<BoardRelation, string> = { owner: "Owner", member: "Member", team: "Via team" };
/** Past this many the task list folds, with a button to show the rest. */
const TASKS_SHOWN = 15;
const DUE_ROWS = [
  { key: "overdue", label: "Overdue", color: "#ef4444" },
  { key: "today", label: "Today", color: "#f59e0b" },
  { key: "thisWeek", label: "This week", color: "#3b82f6" },
  { key: "later", label: "Later", color: "#64748b" },
  { key: "noDate", label: "No date", color: "#cbd5e1" },
] as const;

/**
 * One person, in full: who they are and how to reach them, what they are
 * carrying in figures, the same work split three ways, and then the lists —
 * tasks, deliverables, boards, activity — one tab at a time, so a long list
 * does not leave the panel beside it standing in empty space.
 *
 * The same page serves your own profile and everyone else's; only the wording
 * of the heading and the Message button change.
 */
export function ProfilePage({ userId }: { userId: string }) {
  const ws = useWorkspace();
  const me = useCurrentUser();
  const profile = useProfile(userId);
  const groups = useWorkspaceList(ws.workspace.id, "STAKEHOLDER_GROUPS");
  const assetTypes = useWorkspaceList(ws.workspace.id, "ASSET_TYPES");
  const links = useMentionLinks();
  const [editing, setEditing] = React.useState(false);
  const [taskFilter, setTaskFilter] = React.useState<"open" | "done">("open");
  const [showAll, setShowAll] = React.useState(false);

  const isSelf = me.id === userId;
  // RLS allows a workspace admin to edit anyone in the workspace, and anyone to edit themselves.
  const canEdit = isSelf || canManageMembers(ws.permissions);

  if (profile.isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="p-6">
        <EmptyState icon={Users} title="Person not found" description="They may have been removed from this workspace." />
      </div>
    );
  }

  const { user, member, joinedAt, teams, boards, tasks, assets, activity } = profile.data;
  const hours = formatWorkHours(user);
  const group = user.stakeholderGroup ?? null;
  const groupColor = groups.find((g) => g.name.toLowerCase() === (group ?? "").toLowerCase())?.color ?? (group ? tagColorFor(group) : "gray");
  const assetsPercent = assets.total > 0 ? Math.round((assets.done / assets.total) * 100) : 0;

  const open = tasks.filter((t) => !t.isDone);
  const done = tasks.filter((t) => t.isDone);
  const listed = taskFilter === "open" ? open : done;
  const buckets = { overdue: 0, today: 0, thisWeek: 0, later: 0, noDate: 0 };
  for (const task of open) buckets[bucketDate(task.dueDate)] += 1;
  const dueRows = DUE_ROWS.map((row) => ({ id: row.key, name: row.label, value: buckets[row.key], color: row.color })).filter((row) => row.value > 0);
  const boardCounts = new Map<string, { id: string; name: string; value: number; color: string; slug: string }>();
  for (const task of open) {
    const entry = boardCounts.get(task.board.id) ?? { id: task.board.id, name: task.board.name, value: 0, color: colorClasses(task.board.color).hex, slug: task.board.slug };
    entry.value += 1;
    boardCounts.set(task.board.id, entry);
  }
  const byBoard = [...boardCounts.values()].sort((a, b) => b.value - a.value);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        <PageHeader title={isSelf ? "Your profile" : user.displayName} description={isSelf ? "How you appear to everyone in the workspace." : undefined} />

        <section className="mt-4 flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-xs sm:flex-row sm:items-start">
          <UserAvatar user={user} size="xl" tooltip={false} className="size-20 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold" data-testid="profile-name">
                {user.displayName}
              </h2>
              {member && <Badge variant="muted">{ROLE_LABEL[member.role]}</Badge>}
              {member?.status === "INVITED" && <Badge variant="warning">Pending onboarding</Badge>}
              {user.deactivatedAt && <Badge variant="outline">Deactivated</Badge>}
              {group && (
                <span
                  className={cn("inline-flex items-center gap-1 rounded border border-border/60 py-px pr-1.5 pl-1 text-[10px] font-medium tracking-wide uppercase", colorClasses(groupColor).soft)}
                  data-testid="profile-stakeholder-chip"
                >
                  <span aria-hidden className={cn("size-1 rounded-full", colorClasses(groupColor).dot)} />
                  {group}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{user.jobTitle ?? "No job title yet"}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-muted-foreground">
              <Detail icon={Mail} label={user.email} href={`mailto:${user.email}`} />
              <Detail icon={Clock} label={hours ? `${hours} · ${user.timezone}` : user.timezone} />
              <Detail icon={CalendarCheck} label={`Joined ${formatShortDate(joinedAt.slice(0, 10))}`} />
            </dl>
            {teams.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="profile-teams">
                <Users className="mr-0.5 size-3.5 text-muted-foreground" aria-label="Teams" />
                {teams.map((team) => (
                  <Link
                    key={team.id}
                    href={routes.team(ws.slug, team.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-2xs font-medium transition-colors hover:bg-accent/70"
                  >
                    <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${colorClasses(team.color).dot}`} />
                    {team.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {!isSelf && (
              <Button asChild size="sm" data-testid="profile-message">
                <Link href={routes.messages(ws.slug, user.id)}>
                  <MessageSquare /> Message
                </Link>
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="profile-edit">
                <Pencil /> Edit
              </Button>
            )}
          </div>
        </section>

        {/* ---- What they are carrying, in figures ----------------------------- */}
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 shadow-xs lg:grid-cols-4" data-testid="profile-figures">
          <Figure label="Open tasks" value={open.length} hint={`${done.length} done of ${tasks.length}`} />
          <Figure label="Overdue tasks" value={buckets.overdue} urgent={buckets.overdue > 0} hint={`${buckets.today + buckets.thisWeek} more due this week`} />
          <Figure label="Assets done" value={`${assets.done}/${assets.total}`} hint={`${assetsPercent}%${assets.units === assets.total ? "" : ` · ${assets.units} units`}`} progress={assets.total > 0 ? assets.done / assets.total : undefined} />
          <Figure label="Assets overdue" value={assets.overdue} urgent={assets.overdue > 0} hint="past their due date" />
        </div>

        {/* ---- The open work, three ways ----------------------------------------- */}
        <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 shadow-xs lg:grid-cols-3">
          <Split title="By due date">
            <RankedBars data={dueRows} valueLabel="tasks" compact emptyMessage="Nothing open right now." />
          </Split>
          <Split title="By board">
            <RankedBars
              data={byBoard.slice(0, 5)}
              valueLabel="tasks"
              compact
              emptyMessage="Nothing open right now."
              hrefOf={(row) => {
                const board = byBoard.find((b) => b.id === row.id);
                return board ? routes.board(ws.slug, board.slug) : null;
              }}
            />
          </Split>
          {/* Who the work is for, not which group this person belongs to: the
              split comes off the tasks' own stakeholder cells, which is the
              same thing the dashboard's resourcing filter counts. */}
          <Split title="By department" info={STAKEHOLDER_LOAD_NOTE}>
            <StakeholderLoad userId={userId} />
          </Split>
        </div>

        {/* ---- The lists, one at a time ------------------------------------------ */}
        <Tabs defaultValue="tasks" className="mt-3 rounded-xl border border-border/70 bg-card shadow-xs">
          <UnderlineTabsList className="px-3">
            <TabLabel value="tasks" icon={ListChecks} label="Tasks" count={tasks.length} />
            <TabLabel value="assets" icon={Boxes} label="Assets" count={assets.total} />
            <TabLabel value="boards" icon={SquareKanban} label="Boards" count={boards.length} />
            <TabLabel value="activity" icon={History} label="Activity" count={activity.length} />
          </UnderlineTabsList>

          <TabsContent value="tasks" className="p-3">
            {tasks.length === 0 ? (
              <Muted>Nothing assigned right now.</Muted>
            ) : (
              <>
                <div role="radiogroup" aria-label="Which tasks" className="mb-2 inline-flex items-center rounded-full border border-border/70 p-0.5">
                  {(["open", "done"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={taskFilter === key}
                      onClick={() => {
                        setTaskFilter(key);
                        setShowAll(false);
                      }}
                      className={cn("h-7 rounded-full px-3 text-2xs font-medium transition-colors", taskFilter === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                      data-testid={`profile-tasks-${key}`}
                    >
                      {key === "open" ? `Open ${open.length}` : `Done ${done.length}`}
                    </button>
                  ))}
                </div>
                {listed.length === 0 ? (
                  <Muted>{taskFilter === "open" ? "Nothing open right now." : "Nothing finished yet."}</Muted>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {(showAll ? listed : listed.slice(0, TASKS_SHOWN)).map((task) => {
                      const late = !task.isDone && isOverdue(task.dueDate);
                      return (
                        <li key={task.item.id}>
                          <Link
                            href={routes.board(ws.slug, task.board.slug, { itemId: task.item.id })}
                            className="flex items-center gap-3 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-accent/70 max-md:min-h-11 max-md:text-[15px]"
                            data-testid="profile-task"
                          >
                            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", colorClasses(task.board.color).dot)} />
                            <span className="min-w-0 flex-1 truncate">{task.item.name}</span>
                            <span className="hidden shrink-0 text-2xs text-muted-foreground md:inline">{task.board.name}</span>
                            {task.dueDate && (
                              <span className={cn("hidden w-20 shrink-0 whitespace-nowrap text-right text-2xs tabular sm:inline", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                                {formatShortDate(task.dueDate)}
                              </span>
                            )}
                            {task.status && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium ${colorClasses(task.status.color).soft}`}>{task.status.name}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {listed.length > TASKS_SHOWN && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 px-2 text-2xs font-medium text-foreground/80 underline-offset-4 hover:underline">
                    {showAll ? "Show fewer" : `Show all ${listed.length}`}
                  </button>
                )}
              </>
            )}
          </TabsContent>

          {/* ---- The deliverables with their name on them --------------------- */}
          <TabsContent value="assets" className="p-3">
            {assets.total === 0 ? (
              <Muted>No deliverables assigned.</Muted>
            ) : (
              <ul className="divide-y divide-border/50" data-testid="profile-assets">
                {assets.lines.map((asset) => {
                  const type = assetTypeLabel(asset.assetType, assetTypes);
                  const finished = asset.completedAt !== null;
                  const late = !finished && isOverdue(asset.dueDate);
                  return (
                    <li key={asset.id} className="flex items-center gap-2 px-2 py-2 text-[13px]">
                      <span className={cn("min-w-0 flex-1 truncate", finished && "text-muted-foreground line-through")}>{asset.name}</span>
                      {type && <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium", colorClasses(type.color).soft)}>{type.name}</span>}
                      <span className="shrink-0 text-2xs text-muted-foreground tabular">×{assetCount(asset)}</span>
                      {asset.dueDate && (
                        <span className={cn("hidden w-20 shrink-0 whitespace-nowrap text-right text-2xs tabular sm:inline", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                          {formatShortDate(asset.dueDate)}
                        </span>
                      )}
                    </li>
                  );
                })}
                {assets.total > assets.lines.length && <li className="px-2 pt-2 text-2xs text-muted-foreground">and {assets.total - assets.lines.length} more</li>}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="boards" className="p-3">
            {boards.length === 0 ? (
              <Muted>No boards yet.</Muted>
            ) : (
              <ul className="grid gap-x-4 sm:grid-cols-2">
                {boards.map(({ board, relation }) => (
                  <li key={board.id}>
                    <Link href={routes.board(ws.slug, board.slug)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] transition-colors hover:bg-accent/70 max-md:min-h-11 max-md:text-[15px]">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${colorClasses(board.color).dot}`} />
                      <span className="truncate">{board.name}</span>
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{RELATION_LABEL[relation]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>

          {/* ---- And what they have been up to -------------------------------- */}
          <TabsContent value="activity" className="p-3">
            {activity.length === 0 ? (
              <Muted>Nothing recorded lately.</Muted>
            ) : (
              <ol className="divide-y divide-border/50" data-testid="profile-activity">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 px-2 py-2 text-[13px] text-muted-foreground">
                    <span className="min-w-0">{describeActivity(entry, ws.users, true, links)}</span>
                    <RelativeTime iso={entry.createdAt} className="ml-auto shrink-0 text-2xs" />
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <EditProfileDialog user={user} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

/** One figure in the strip: what it counts, the number, and a line under it. */
function Figure({ label, value, hint, urgent, progress }: { label: string; value: number | string; hint?: string; urgent?: boolean; progress?: number }) {
  return (
    <div className="flex flex-col bg-card px-5 py-4">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[26px] leading-tight font-semibold tracking-tight tabular", urgent && "text-red-600 dark:text-red-400")}>{value}</p>
      {progress !== undefined && (
        <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-strong">
          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      {hint && <p className="mt-auto pt-1.5 text-2xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** One of the three splits of the open work: a quiet heading over its bars. */
function Split({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        Open work {title.toLowerCase()}
        {info && (
          <SimpleTooltip label={info}>
            <Info className="size-3 cursor-help" aria-label={info} />
          </SimpleTooltip>
        )}
      </h3>
      {children}
    </section>
  );
}

function TabLabel({ value, icon: Icon, label, count }: { value: string; icon: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <UnderlineTabsTrigger value={value} data-testid={`profile-tab-${value}`}>
      <Icon className="size-3.5" /> {label}
      <span className="text-2xs text-muted-foreground tabular">{count}</span>
    </UnderlineTabsTrigger>
  );
}

function Detail({ icon: Icon, label, href }: { icon: React.ComponentType<{ className?: string }>; label: string; href?: string }) {
  const content = (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" />
      {label}
    </span>
  );
  return <dd>{href ? <a href={href} className="hover:text-foreground hover:underline">{content}</a> : content}</dd>;
}


function Muted({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-[13px] text-muted-foreground">{children}</p>;
}

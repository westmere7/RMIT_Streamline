"use client";

import { Boxes, Building2, CalendarCheck, Clock, History, SquareKanban, ListChecks, Mail, MessageSquare, Pencil, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceRole } from "@/domain";
import { assetCount, formatWorkHours } from "@/domain";
import { describeActivity } from "@/features/activity/format-activity";
import { useCurrentUser } from "@/features/auth/auth-context";
import { assetTypeLabel } from "@/features/items/item-assets-recap";
import { EditProfileDialog } from "@/features/profile/edit-profile-dialog";
import { useProfile } from "@/features/profile/hooks";
import { useWorkspaceList } from "@/features/workspace/list-hooks";
import { useMentionLinks } from "@/features/workspace/mention-link";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses, tagColorFor } from "@/lib/colors";
import { formatShortDate, isOverdue } from "@/lib/dates/dates";
import { canManageMembers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { BoardRelation } from "@/services";

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" };
const RELATION_LABEL: Record<BoardRelation, string> = { owner: "Owner", member: "Member", team: "Via team" };

/**
 * One person, in full: who they are and how to reach them, what they are part
 * of, and what they are actually carrying — the tasks assigned to them, the
 * deliverables with their name on, and what they have been doing.
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

  const isSelf = me.id === userId;
  // RLS allows a workspace admin to edit anyone in the workspace, and anyone to edit themselves.
  const canEdit = isSelf || canManageMembers(ws.permissions);

  if (profile.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
        <Skeleton className="h-28" />
        <Skeleton className="h-40" />
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

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        <PageHeader title={isSelf ? "Your profile" : user.displayName} description={isSelf ? "How you appear to everyone in the workspace." : undefined} />

        <section className="mt-4 flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-xs sm:flex-row sm:items-start">
          <UserAvatar user={user} size="xl" tooltip={false} className="size-20 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold" data-testid="profile-name">
                {user.displayName}
              </h2>
              {member && <Badge variant="muted">{ROLE_LABEL[member.role]}</Badge>}
              {member?.status === "INVITED" && <Badge variant="outline">Invited</Badge>}
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
              {user.department && <Detail icon={Building2} label={user.department} />}
              <Detail icon={Clock} label={hours ? `${hours} · ${user.timezone}` : user.timezone} />
              <Detail icon={CalendarCheck} label={`Joined ${formatShortDate(joinedAt.slice(0, 10))}`} />
            </dl>
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
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Open tasks" value={tasks.length} />
          <Stat label="Assets" value={assets.total} hint={assets.units === assets.total ? undefined : `${assets.units} units`} />
          <Stat label="Assets done" value={`${assets.done}/${assets.total}`} hint={assets.total > 0 ? `${assetsPercent}%` : undefined} />
          <Stat label="Overdue" value={assets.overdue} tone={assets.overdue > 0 ? "warn" : undefined} />
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
          <Panel icon={Users} title="Teams" count={teams.length}>
            {teams.length === 0 ? (
              <Muted>Not in any team yet.</Muted>
            ) : (
              <ul className="space-y-1">
                {teams.map((team) => (
                  <li key={team.id}>
                    <Link href={routes.team(ws.slug, team.id)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/70 max-md:min-h-11 max-md:text-[15px]">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${colorClasses(team.color).dot}`} />
                      <span className="truncate">{team.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={SquareKanban} title="Boards" count={boards.length}>
            {boards.length === 0 ? (
              <Muted>No boards yet.</Muted>
            ) : (
              <ul className="space-y-1">
                {boards.map(({ board, relation }) => (
                  <li key={board.id}>
                    <Link href={routes.board(ws.slug, board.slug)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/70 max-md:min-h-11 max-md:text-[15px]">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${colorClasses(board.color).dot}`} />
                      <span className="truncate">{board.name}</span>
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{RELATION_LABEL[relation]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={ListChecks} title="Assigned tasks" count={tasks.length}>
            {tasks.length === 0 ? (
              <Muted>Nothing assigned right now.</Muted>
            ) : (
              <ul className="space-y-1">
                {tasks.slice(0, 10).map((task) => (
                  <li key={task.item.id}>
                    <Link
                      href={routes.board(ws.slug, task.board.slug, { itemId: task.item.id })}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/70 max-md:min-h-11 max-md:text-[15px]"
                      data-testid="profile-task"
                    >
                      <span className="min-w-0 flex-1 truncate">{task.item.name}</span>
                      <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">{task.board.name}</span>
                      {task.status && <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium ${colorClasses(task.status.color).soft}`}>{task.status.name}</span>}
                    </Link>
                  </li>
                ))}
                {tasks.length > 10 && <li className="px-2 pt-1 text-2xs text-muted-foreground">and {tasks.length - 10} more</li>}
              </ul>
            )}
          </Panel>

          {/* ---- The deliverables with their name on them --------------------- */}
          <Panel icon={Boxes} title="Assets in charge of" count={assets.total}>
            {assets.total === 0 ? (
              <Muted>No deliverables assigned.</Muted>
            ) : (
              <ul className="space-y-1" data-testid="profile-assets">
                {assets.lines.map((asset) => {
                  const type = assetTypeLabel(asset.assetType, assetTypes);
                  const done = asset.completedAt !== null;
                  const late = !done && isOverdue(asset.dueDate);
                  return (
                    <li key={asset.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]">
                      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>{asset.name}</span>
                      {type && <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium", colorClasses(type.color).soft)}>{type.name}</span>}
                      <span className="shrink-0 text-2xs text-muted-foreground tabular">×{assetCount(asset)}</span>
                      {asset.dueDate && (
                        <span className={cn("hidden shrink-0 text-2xs tabular sm:inline", late ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                          {formatShortDate(asset.dueDate)}
                        </span>
                      )}
                    </li>
                  );
                })}
                {assets.total > assets.lines.length && <li className="px-2 pt-1 text-2xs text-muted-foreground">and {assets.total - assets.lines.length} more</li>}
              </ul>
            )}
          </Panel>

          {/* ---- And what they have been up to -------------------------------- */}
          <Panel icon={History} title="Recent activity" count={activity.length} className="lg:col-span-2">
            {activity.length === 0 ? (
              <Muted>Nothing recorded lately.</Muted>
            ) : (
              <ol className="space-y-1" data-testid="profile-activity">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground">
                    <span className="min-w-0">{describeActivity(entry, ws.users, true, links)}</span>
                    <RelativeTime iso={entry.createdAt} className="ml-auto shrink-0 text-2xs" />
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <EditProfileDialog user={user} open={editing} onOpenChange={setEditing} />
    </div>
  );
}

/** One figure from the header strip: the number first, what it counts under it. */
function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5 shadow-xs">
      <p className={cn("text-lg font-semibold tabular", tone === "warn" && "text-red-600 dark:text-red-400")}>{value}</p>
      <p className="text-2xs text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 opacity-70">· {hint}</span> : null}
      </p>
    </div>
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

function Panel({
  icon: Icon,
  title,
  count,
  className,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-border/70 bg-card p-4 shadow-xs ${className ?? ""}`}>
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-medium">
        <Icon className="size-4 text-muted-foreground" />
        {title}
        <span className="text-2xs text-muted-foreground">{count}</span>
      </h3>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-3 text-[13px] text-muted-foreground">{children}</p>;
}

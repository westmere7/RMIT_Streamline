"use client";

import { Building2, Clock, LayoutGrid, ListChecks, Mail, MessageSquare, Pencil, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkspaceRole } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { EditProfileDialog } from "@/features/profile/edit-profile-dialog";
import { useProfile } from "@/features/profile/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageMembers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import type { BoardRelation } from "@/services";

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" };
const RELATION_LABEL: Record<BoardRelation, string> = { owner: "Owner", member: "Member", team: "Via team" };

export function ProfilePage({ userId }: { userId: string }) {
  const ws = useWorkspace();
  const me = useCurrentUser();
  const profile = useProfile(userId);
  const [editing, setEditing] = React.useState(false);

  const isSelf = me.id === userId;
  // RLS allows a workspace admin to edit anyone in the workspace, and anyone to edit themselves.
  const canEdit = isSelf || canManageMembers(ws.permissions);

  if (profile.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
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

  const { user, member, teams, boards, tasks } = profile.data;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl p-6">
        <PageHeader title={isSelf ? "Your profile" : user.displayName} description={isSelf ? "How you appear to everyone in the workspace." : undefined} />

        <section className="mt-4 flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-xs sm:flex-row sm:items-center">
          <UserAvatar user={user} size="xl" tooltip={false} className="size-20 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold" data-testid="profile-name">
                {user.displayName}
              </h2>
              {member && <Badge variant="muted">{ROLE_LABEL[member.role]}</Badge>}
              {member?.status === "INVITED" && <Badge variant="outline">Invited</Badge>}
              {user.deactivatedAt && <Badge variant="outline">Deactivated</Badge>}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{user.jobTitle ?? "No job title yet"}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[13px] text-muted-foreground">
              <Detail icon={Mail} label={user.email} href={`mailto:${user.email}`} />
              {user.department && <Detail icon={Building2} label={user.department} />}
              <Detail icon={Clock} label={user.timezone} />
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

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel icon={Users} title="Teams" count={teams.length}>
            {teams.length === 0 ? (
              <Muted>Not in any team yet.</Muted>
            ) : (
              <ul className="space-y-1">
                {teams.map((team) => (
                  <li key={team.id}>
                    <Link href={routes.team(ws.slug, team.id)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/70">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${colorClasses(team.color).dot}`} />
                      <span className="truncate">{team.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={LayoutGrid} title="Boards" count={boards.length}>
            {boards.length === 0 ? (
              <Muted>No boards yet.</Muted>
            ) : (
              <ul className="space-y-1">
                {boards.map(({ board, relation }) => (
                  <li key={board.id}>
                    <Link href={routes.board(ws.slug, board.slug)} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/70">
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${colorClasses(board.color).dot}`} />
                      <span className="truncate">{board.name}</span>
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{RELATION_LABEL[relation]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel icon={ListChecks} title="Assigned tasks" count={tasks.length} className="lg:col-span-2">
            {tasks.length === 0 ? (
              <Muted>Nothing assigned right now.</Muted>
            ) : (
              <ul className="space-y-1">
                {tasks.slice(0, 12).map((task) => (
                  <li key={task.item.id}>
                    <Link
                      href={routes.board(ws.slug, task.board.slug, { itemId: task.item.id })}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent/70"
                      data-testid="profile-task"
                    >
                      <span className="min-w-0 flex-1 truncate">{task.item.name}</span>
                      <span className="hidden shrink-0 text-2xs text-muted-foreground sm:inline">{task.board.name}</span>
                      {task.status && (
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-2xs font-medium ${colorClasses(task.status.color).soft}`}>{task.status.name}</span>
                      )}
                    </Link>
                  </li>
                ))}
                {tasks.length > 12 && <li className="px-2 pt-1 text-2xs text-muted-foreground">and {tasks.length - 12} more</li>}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <EditProfileDialog user={user} open={editing} onOpenChange={setEditing} />
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

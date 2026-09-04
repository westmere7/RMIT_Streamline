"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Search, UserPlus, Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { WORKSPACE_ROLES, type User, type WorkspaceMember, type WorkspaceRole } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageMembers } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" };

export function MembersPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const manage = canManageMembers(ws.permissions);

  const rows = ws.members
    .map((member) => ({ member, user: ws.userById(member.userId) }))
    .filter((r): r is { member: WorkspaceMember; user: User } => !!r.user)
    .filter(({ user }) => {
      const q = query.trim().toLowerCase();
      return !q || user.displayName.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) || (user.jobTitle ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Members"
        description={`${ws.members.filter((m) => m.status === "ACTIVE").length} active members`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" className="w-56 pl-7" aria-label="Search members" />
            </div>
            {manage && (
              <Button onClick={() => setInviteOpen(true)}>
                <UserPlus /> Invite
              </Button>
            )}
          </>
        }
      />
      <div className="scrollbar-thin flex-1 overflow-auto px-6 pb-8">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No members match" description="Try a different name or email." />
        ) : (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead className="bg-surface text-left text-2xs font-medium text-muted-foreground">
                <tr className="h-8">
                  <th className="px-3 font-medium">Name</th>
                  <th className="px-3 font-medium">Email</th>
                  <th className="px-3 font-medium">Job title</th>
                  <th className="px-3 font-medium">Teams</th>
                  <th className="px-3 font-medium">Workspace role</th>
                  <th className="px-3 font-medium">Status</th>
                  {manage && <th className="w-10 px-3" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(({ member, user }) => (
                  <MemberRow key={member.id} member={member} user={user} manage={manage} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function MemberRow({ member, user, manage }: { member: WorkspaceMember; user: User; manage: boolean }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false);
  const teams = ws.teamMembers.filter((m) => m.userId === user.id).map((m) => ws.teamById(m.teamId)).filter((t): t is NonNullable<typeof t> => !!t && t.archivedAt === null);
  const isSelf = user.id === ws.currentUser.id;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });

  const changeRole = useMutation({
    mutationFn: (role: WorkspaceRole) => services.workspace.changeMemberRole(member.id, role),
    onSuccess: async () => {
      await invalidate();
      toast.success(`${user.firstName} is now ${ROLE_LABEL[changeRole.variables ?? member.role].toLowerCase()}`);
    },
  });
  const toggleTeam = useMutation({
    mutationFn: async ({ teamId, join }: { teamId: string; join: boolean }) => {
      if (join) await services.workspace.addTeamMember(teamId, user.id);
      else await services.workspace.removeTeamMember(teamId, user.id);
    },
    onSuccess: invalidate,
  });
  const setActive = useMutation({
    mutationFn: (active: boolean) => services.workspace.setMemberActive(member.id, user.id, active),
    onSuccess: async (_r, active) => {
      await invalidate();
      toast.success(active ? `${user.firstName} reactivated` : `${user.firstName} deactivated`);
    },
  });
  const accept = useMutation({
    mutationFn: () => services.workspace.acceptInvite(member.id),
    onSuccess: invalidate,
  });

  return (
    <tr className={cn("h-11 hover:bg-accent/60", member.status === "DEACTIVATED" && "text-muted-foreground")}>
      <td className="px-3">
        <span className="flex items-center gap-2">
          <UserAvatar user={user} size="md" tooltip={false} className={cn(member.status === "DEACTIVATED" && "opacity-50")} />
          <span className="font-medium">
            {user.displayName}
            {isSelf && <span className="ml-1 text-2xs font-normal text-muted-foreground">(you)</span>}
          </span>
        </span>
      </td>
      <td className="px-3 text-muted-foreground">{user.email}</td>
      <td className="px-3">{user.jobTitle ?? "—"}</td>
      <td className="px-3">
        <span className="flex flex-wrap gap-1">
          {teams.length === 0 ? <span className="text-muted-foreground">—</span> : teams.map((t) => <Badge key={t.id} variant="muted">{t.name}</Badge>)}
        </span>
      </td>
      <td className="px-3">{ROLE_LABEL[member.role]}</td>
      <td className="px-3">
        <Badge variant={member.status === "ACTIVE" ? "success" : member.status === "INVITED" ? "warning" : "muted"}>
          {member.status === "ACTIVE" ? "Active" : member.status === "INVITED" ? "Invited" : "Deactivated"}
        </Badge>
      </td>
      {manage && (
        <td className="px-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.displayName}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Workspace role</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={member.role} onValueChange={(v) => changeRole.mutate(v as WorkspaceRole)}>
                {WORKSPACE_ROLES.map((role) => (
                  <DropdownMenuRadioItem key={role} value={role} disabled={isSelf && role !== member.role}>
                    {ROLE_LABEL[role]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Teams</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {ws.teams
                    .filter((t) => t.archivedAt === null)
                    .map((team) => {
                      const inTeam = teams.some((t) => t.id === team.id);
                      return (
                        <DropdownMenuCheckboxItem key={team.id} checked={inTeam} onCheckedChange={(next) => toggleTeam.mutate({ teamId: team.id, join: !!next })}>
                          {team.name}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              {member.status === "INVITED" && <DropdownMenuItem onSelect={() => accept.mutate()}>Mark invitation accepted</DropdownMenuItem>}
              {member.status === "DEACTIVATED" ? (
                <DropdownMenuItem onSelect={() => setActive.mutate(true)}>Reactivate</DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setConfirmDeactivate(true)}>
                  Deactivate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmDialog
            open={confirmDeactivate}
            onOpenChange={setConfirmDeactivate}
            title={`Deactivate ${user.displayName}?`}
            description="They will no longer be able to sign in or be assigned to items. Their history is kept."
            confirmLabel="Deactivate"
            destructive
            onConfirm={() => setActive.mutateAsync(false).then(() => undefined)}
          />
        </td>
      )}
    </tr>
  );
}

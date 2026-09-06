"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Link2, MoreHorizontal, Search, UserPlus, Users } from "lucide-react";
import Link from "next/link";
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
import { WORKSPACE_ROLES, type Team, type User, type WorkspaceInvitation, type WorkspaceMember, type WorkspaceRole } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { InviteLinkDialog } from "@/features/members/components/invite-link-dialog";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { copyToClipboard, invitationUrl, useLiveInvitations, useMemberMutations } from "@/features/members/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageMembers } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" };
const STATUS_LABEL: Record<WorkspaceMember["status"], string> = { ACTIVE: "Active", INVITED: "Pending onboarding", DEACTIVATED: "Deactivated" };
/** Status sort order: active people first, then people still onboarding, then deactivated. */
const STATUS_ORDER: WorkspaceMember["status"][] = ["ACTIVE", "INVITED", "DEACTIVATED"];

/** Beyond this many members the list is split into pages. */
export const MEMBERS_PAGE_SIZE = 100;

type SortKey = "name" | "email" | "jobTitle" | "teams" | "role" | "status";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "jobTitle", label: "Job title" },
  { key: "teams", label: "Teams" },
  { key: "role", label: "Workspace role" },
  { key: "status", label: "Status" },
];

type Row = { member: WorkspaceMember; user: User; teams: Team[] };

function compareRows(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "name":
      return a.user.displayName.localeCompare(b.user.displayName);
    case "email":
      return a.user.email.localeCompare(b.user.email);
    case "jobTitle":
      // Empty titles always sink to the bottom, whichever direction is chosen.
      if (!a.user.jobTitle !== !b.user.jobTitle) return a.user.jobTitle ? -1 : 1;
      return (a.user.jobTitle ?? "").localeCompare(b.user.jobTitle ?? "");
    case "teams":
      if ((a.teams.length === 0) !== (b.teams.length === 0)) return a.teams.length === 0 ? 1 : -1;
      return a.teams.map((t) => t.name).join(", ").localeCompare(b.teams.map((t) => t.name).join(", "));
    case "role":
      return WORKSPACE_ROLES.indexOf(a.member.role) - WORKSPACE_ROLES.indexOf(b.member.role);
    case "status":
      return STATUS_ORDER.indexOf(a.member.status) - STATUS_ORDER.indexOf(b.member.status);
  }
}

export function MembersPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "");
  const [sort, setSort] = React.useState<Sort>({ key: "name", direction: "asc" });
  const [page, setPage] = React.useState(1);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const manage = canManageMembers(ws.permissions);
  const invitations = useLiveInvitations();

  const teamsByUser = React.useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const tm of ws.teamMembers) {
      const team = ws.teamById(tm.teamId);
      if (!team || team.archivedAt !== null) continue;
      const list = map.get(tm.userId) ?? [];
      list.push(team);
      map.set(tm.userId, list);
    }
    return map;
  }, [ws]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = ws.members
      .map((member) => ({ member, user: ws.userById(member.userId), teams: teamsByUser.get(member.userId) ?? [] }))
      .filter((r): r is Row => !!r.user)
      .filter(({ user }) => !q || user.displayName.toLowerCase().includes(q) || user.email.toLowerCase().includes(q) || (user.jobTitle ?? "").toLowerCase().includes(q));
    list.sort((a, b) => {
      const primary = compareRows(a, b, sort.key);
      const signed = sort.direction === "asc" ? primary : -primary;
      // Name breaks ties so the order is stable and predictable.
      return signed || a.user.displayName.localeCompare(b.user.displayName);
    });
    return list;
  }, [ws, teamsByUser, query, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / MEMBERS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * MEMBERS_PAGE_SIZE, currentPage * MEMBERS_PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
    setPage(1);
  };

  const activeCount = ws.members.filter((m) => m.status === "ACTIVE").length;
  const pendingCount = ws.members.filter((m) => m.status === "INVITED").length;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Members"
        description={
          <span data-testid="members-summary">
            {activeCount} active {activeCount === 1 ? "member" : "members"}
            {pendingCount > 0 && ` · ${pendingCount} pending onboarding`}
          </span>
        }
        actions={
          <>
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search members"
                className="w-full pl-7 sm:w-56"
                aria-label="Search members"
              />
            </div>
            {manage && (
              <Button onClick={() => setInviteOpen(true)} data-testid="add-member">
                <UserPlus /> Add member
              </Button>
            )}
          </>
        }
      />
      <div className="scrollbar-thin flex-1 overflow-auto px-4 pb-8 sm:px-7">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No members match" description="Try a different name or email." />
        ) : (
          <div className="inline-block min-w-full align-top">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
              {/* Every cell stays on one line; the table grows as wide as its content and the page scrolls sideways. */}
              <table className="w-max min-w-full whitespace-nowrap text-[13px]">
                <thead className="bg-surface text-left text-2xs font-medium text-muted-foreground">
                  <tr className="h-8">
                    {COLUMNS.map((column) => (
                      <SortableHeader key={column.key} label={column.label} active={sort.key === column.key} direction={sort.direction} onClick={() => toggleSort(column.key)} />
                    ))}
                    {manage && <th className="w-10 px-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageRows.map((row) => (
                    <MemberRow key={row.member.id} row={row} manage={manage} invitation={invitations.data?.get(row.user.id) ?? null} />
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > MEMBERS_PAGE_SIZE && <Pagination page={currentPage} pageCount={pageCount} total={rows.length} onChange={setPage} />}
          </div>
        )}
      </div>
      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}

function SortableHeader({ label, active, direction, onClick }: { label: string; active: boolean; direction: SortDirection; onClick: () => void }) {
  const Icon = !active ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="px-0 font-medium" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "group flex h-8 w-full items-center gap-1 px-3 text-left font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          active && "text-foreground",
        )}
        data-testid={`sort-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {label}
        <Icon className={cn("size-3 shrink-0", active ? "opacity-100" : "opacity-0 group-hover:opacity-60")} aria-hidden />
      </button>
    </th>
  );
}

function Pagination({ page, pageCount, total, onChange }: { page: number; pageCount: number; total: number; onChange: (page: number) => void }) {
  const first = (page - 1) * MEMBERS_PAGE_SIZE + 1;
  const last = Math.min(page * MEMBERS_PAGE_SIZE, total);
  return (
    <nav className="mt-3 flex items-center justify-between gap-3 text-[13px] text-muted-foreground" aria-label="Members pages" data-testid="members-pagination">
      <span>
        Showing {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft />
        </Button>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
          <Button
            key={n}
            variant={n === page ? "secondary" : "ghost"}
            size="sm"
            className="min-w-8 px-2 tabular"
            aria-current={n === page ? "page" : undefined}
            aria-label={`Page ${n}`}
            onClick={() => onChange(n)}
          >
            {n}
          </Button>
        ))}
        <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

function MemberRow({ row: { member, user, teams }, manage, invitation }: { row: Row; manage: boolean; invitation: WorkspaceInvitation | null }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const { cancel, reinitiate } = useMemberMutations();
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [confirmReinitiate, setConfirmReinitiate] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const isSelf = user.id === ws.currentUser.id;
  const pending = member.status === "INVITED";
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

  return (
    <tr className={cn("h-11 hover:bg-accent/60", member.status === "DEACTIVATED" && "text-muted-foreground")} data-testid="member-row" data-member-status={member.status}>
      <td className="px-3">
        <Link href={routes.person(ws.slug, user.id)} className="flex items-center gap-2 hover:underline" data-testid="member-profile-link">
          <UserAvatar user={user} size="md" tooltip={false} className={cn(member.status !== "ACTIVE" && "opacity-50")} />
          <span className="font-medium">
            {user.displayName}
            {isSelf && <span className="ml-1 text-2xs font-normal text-muted-foreground">(you)</span>}
          </span>
        </Link>
      </td>
      <td className="px-3 text-muted-foreground">{user.email}</td>
      <td className="px-3">{user.jobTitle ?? "—"}</td>
      <td className="px-3">
        <span className="flex items-center gap-1">
          {teams.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            teams.map((t) => (
              <Badge key={t.id} variant="muted">
                {t.name}
              </Badge>
            ))
          )}
        </span>
      </td>
      <td className="px-3">{ROLE_LABEL[member.role]}</td>
      <td className="px-3">
        <Badge variant={member.status === "ACTIVE" ? "success" : pending ? "warning" : "muted"} data-testid="member-status">
          {STATUS_LABEL[member.status]}
        </Badge>
      </td>
      {manage && (
        <td className="px-3">
          <div className="flex items-center justify-end gap-1">
            {pending && (
              <Button variant="ghost" size="icon-sm" aria-label={`Invitation link for ${user.displayName}`} onClick={() => setLinkOpen(true)} data-testid="invite-link-button">
                <Link2 />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${user.displayName}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {pending && (
                  <>
                    <DropdownMenuLabel>Invitation</DropdownMenuLabel>
                    <DropdownMenuItem disabled={!invitation} onSelect={() => invitation && void copyToClipboard(invitationUrl(invitation))}>
                      Copy invite link
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setLinkOpen(true)}>Show or renew link</DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
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
                {pending ? (
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmCancel(true)} data-testid="cancel-invitation">
                    Cancel invitation
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem disabled={isSelf} onSelect={() => setConfirmReinitiate(true)} data-testid="reinitiate-member">
                      Reinitiate onboarding
                    </DropdownMenuItem>
                    {member.status === "DEACTIVATED" ? (
                      <DropdownMenuItem onSelect={() => setActive.mutate(true)}>Reactivate</DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem variant="destructive" disabled={isSelf} onSelect={() => setConfirmDeactivate(true)}>
                        Deactivate
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <ConfirmDialog
            open={confirmDeactivate}
            onOpenChange={setConfirmDeactivate}
            title={`Deactivate ${user.displayName}?`}
            description="They will no longer be able to sign in or be assigned to items. Their history is kept."
            confirmLabel="Deactivate"
            destructive
            onConfirm={() => setActive.mutateAsync(false).then(() => undefined)}
          />
          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${user.displayName}'s invitation?`}
            description="They are removed from the member list and their invitation link stops working. Since they never signed in, nothing else is lost; you can add them again later."
            confirmLabel="Cancel invitation"
            destructive
            onConfirm={() =>
              cancel.mutateAsync(user.id).then(() => {
                toast.success(`${user.displayName}'s invitation was cancelled`);
              })
            }
          />
          <ConfirmDialog
            open={confirmReinitiate}
            onOpenChange={setConfirmReinitiate}
            title={`Reinitiate onboarding for ${user.displayName}?`}
            description="They go back to pending: they cannot use the workspace until they open the new link and set a new password. Their boards, items and history are kept. You will get the link to pass on."
            confirmLabel="Reinitiate"
            onConfirm={() =>
              reinitiate.mutateAsync(user.id).then(() => {
                toast.success(`${user.displayName} is pending onboarding again`);
                setLinkOpen(true);
              })
            }
          />
          {(pending || linkOpen) && <InviteLinkDialog user={user} invitation={invitation} open={linkOpen} onOpenChange={setLinkOpen} />}
        </td>
      )}
    </tr>
  );
}

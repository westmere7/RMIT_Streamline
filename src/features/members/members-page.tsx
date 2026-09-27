"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Filter, Link2, MoreHorizontal, Search, UserPlus, Users, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { SimpleTooltip } from "@/components/ui/tooltip";
import { WORKSPACE_ROLES, type Team, type User, type WorkspaceInvitation, type WorkspaceMember, type WorkspaceRole } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { InviteLinkDialog } from "@/features/members/components/invite-link-dialog";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { copyToClipboard, invitationUrl, useLiveInvitations, useMemberMutations } from "@/features/members/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatDateTime, formatShortDate } from "@/lib/dates/dates";
import { canManageMember, canManageMembers, isOwner } from "@/lib/permissions/permissions";
import { useWorkspaceAdmin } from "@/features/workspace/workspaces";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<WorkspaceRole, string> = { OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", GUEST: "Guest" };
/** The roles a workspace hands out. Owner is not one: Owners are made from their own menu entry, and are Owners of every workspace. */
const ASSIGNABLE_ROLES = WORKSPACE_ROLES.filter((role): role is Exclude<WorkspaceRole, "OWNER"> => role !== "OWNER");
const STATUS_LABEL: Record<WorkspaceMember["status"], string> = { ACTIVE: "Active", INVITED: "Pending onboarding", DEACTIVATED: "Deactivated" };
/** Status sort order: active people first, then people still onboarding, then deactivated. */
const STATUS_ORDER: WorkspaceMember["status"][] = ["ACTIVE", "INVITED", "DEACTIVATED"];
const NO_TEAM = "__none__";

/** Beyond this many members the list is split into pages. */
export const MEMBERS_PAGE_SIZE = 100;

type SortKey = "name" | "jobTitle" | "department" | "teams" | "role" | "status" | "joined" | "boards";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "jobTitle", label: "Job title" },
  { key: "department", label: "Department" },
  { key: "teams", label: "Teams" },
  { key: "role", label: "Workspace role" },
  { key: "status", label: "Status" },
  { key: "joined", label: "Joined" },
  { key: "boards", label: "Boards" },
];

type Row = { member: WorkspaceMember; user: User; teams: Team[]; department: string | null; boards: number };

function compareRows(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "name":
      return a.user.displayName.localeCompare(b.user.displayName);
    case "jobTitle":
      // Empty values always sink to the bottom, whichever direction is chosen.
      if (!a.user.jobTitle !== !b.user.jobTitle) return a.user.jobTitle ? -1 : 1;
      return (a.user.jobTitle ?? "").localeCompare(b.user.jobTitle ?? "");
    case "department":
      if (!a.department !== !b.department) return a.department ? -1 : 1;
      return (a.department ?? "").localeCompare(b.department ?? "");
    case "teams":
      if ((a.teams.length === 0) !== (b.teams.length === 0)) return a.teams.length === 0 ? 1 : -1;
      return a.teams.map((t) => t.name).join(", ").localeCompare(b.teams.map((t) => t.name).join(", "));
    case "role":
      return WORKSPACE_ROLES.indexOf(a.member.role) - WORKSPACE_ROLES.indexOf(b.member.role);
    case "status":
      return STATUS_ORDER.indexOf(a.member.status) - STATUS_ORDER.indexOf(b.member.status);
    case "joined":
      return a.member.joinedAt.localeCompare(b.member.joinedAt);
    case "boards":
      return a.boards - b.boards;
  }
}

/** "Joined 3 Sep", or when a pending person was added: their membership starts at the invitation. */
function joinedLabel(member: WorkspaceMember): string {
  return formatShortDate(member.joinedAt.slice(0, 10));
}

/**
 * Everyone in the workspace, and the tools to run it.
 *
 * A search and filters by status, role and team, a table with what an admin asks about a person (their
 * department, when they joined, how many boards they are on), and for admins a
 * selection that changes many people at once. Every change still goes through
 * the same service call the row's own menu makes, one person at a time, so the
 * rules that refuse a change (a workspace keeps an owner; you cannot demote or
 * deactivate yourself) hold for a batch too.
 */
export function MembersPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(searchParams.get("q") ?? "");
  const [statuses, setStatuses] = React.useState<Set<WorkspaceMember["status"]>>(new Set());
  const [roles, setRoles] = React.useState<Set<WorkspaceRole>>(new Set());
  const [teamFilter, setTeamFilter] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<Sort>({ key: "name", direction: "asc" });
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const manage = canManageMembers(ws.permissions);
  const isMobile = useIsMobile();
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

  const boardsByUser = React.useMemo(() => {
    const live = new Set(ws.boards.filter((b) => b.archivedAt === null).map((b) => b.id));
    const map = new Map<string, number>();
    for (const bm of ws.boardMembers) if (live.has(bm.boardId)) map.set(bm.userId, (map.get(bm.userId) ?? 0) + 1);
    return map;
  }, [ws.boards, ws.boardMembers]);

  const allRows = React.useMemo(
    () =>
      ws.members
        .map((member) => {
          const user = ws.userById(member.userId);
          return user ? { member, user, teams: teamsByUser.get(member.userId) ?? [], department: user.stakeholderGroup?.trim() || user.department?.trim() || null, boards: boardsByUser.get(member.userId) ?? 0 } : null;
        })
        .filter((r): r is Row => !!r),
    [ws, teamsByUser, boardsByUser],
  );

  const filtered = statuses.size > 0 || roles.size > 0 || teamFilter !== null;
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allRows.filter(({ member, user, teams, department }) => {
      if (statuses.size && !statuses.has(member.status)) return false;
      if (roles.size && !roles.has(member.role)) return false;
      if (teamFilter === NO_TEAM && teams.length > 0) return false;
      if (teamFilter && teamFilter !== NO_TEAM && !teams.some((t) => t.id === teamFilter)) return false;
      if (!q) return true;
      return [user.displayName, user.email, user.jobTitle ?? "", department ?? ""].some((v) => v.toLowerCase().includes(q));
    });
    list.sort((a, b) => {
      const primary = compareRows(a, b, sort.key);
      const signed = sort.direction === "asc" ? primary : -primary;
      // Name breaks ties so the order is stable and predictable.
      return signed || a.user.displayName.localeCompare(b.user.displayName);
    });
    return list;
  }, [allRows, query, statuses, roles, teamFilter, sort]);

  // A batch acts on who is selected and still listed: filtering someone away takes them out of it.
  const selectedRows = rows.filter((r) => selected.has(r.member.id));

  const pageCount = Math.max(1, Math.ceil(rows.length / MEMBERS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * MEMBERS_PAGE_SIZE, currentPage * MEMBERS_PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "joined" || key === "boards" ? "desc" : "asc" }));
    setPage(1);
  };
  const toggleIn = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };
  const clearFilters = () => {
    setStatuses(new Set());
    setRoles(new Set());
    setTeamFilter(null);
    setQuery("");
    setPage(1);
  };

  const activeCount = ws.members.filter((m) => m.status === "ACTIVE").length;
  const pendingCount = ws.members.filter((m) => m.status === "INVITED").length;
  const liveTeams = ws.teams.filter((t) => t.archivedAt === null).sort((a, b) => a.name.localeCompare(b.name));
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.member.id));
  const someOnPageSelected = pageRows.some((r) => selected.has(r.member.id));

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
          manage && (
            <Button onClick={() => setInviteOpen(true)} data-testid="add-member">
              <UserPlus /> Add member
            </Button>
          )
        }
      />
      <div className="scrollbar-thin flex-1 overflow-auto px-4 pb-8 sm:px-7">
        <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="members-filters">
          <div className="relative min-w-0 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute top-2 left-2 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search name, email, title or department"
              className="w-full pl-7"
              aria-label="Search members"
            />
          </div>
          <FilterMenu label="Status" count={statuses.size} testId="members-filter-status">
            {STATUS_ORDER.map((status) => (
              <DropdownMenuCheckboxItem key={status} checked={statuses.has(status)} onCheckedChange={() => (setStatuses(toggleIn(statuses, status)), setPage(1))} onSelect={(e) => e.preventDefault()}>
                {STATUS_LABEL[status]}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>
          <FilterMenu label="Role" count={roles.size} testId="members-filter-role">
            {WORKSPACE_ROLES.map((role) => (
              <DropdownMenuCheckboxItem key={role} checked={roles.has(role)} onCheckedChange={() => (setRoles(toggleIn(roles, role)), setPage(1))} onSelect={(e) => e.preventDefault()}>
                {ROLE_LABEL[role]}
              </DropdownMenuCheckboxItem>
            ))}
          </FilterMenu>
          <FilterMenu label={teamFilter === null ? "Team" : teamFilter === NO_TEAM ? "No team" : (ws.teamById(teamFilter)?.name ?? "Team")} count={teamFilter === null ? 0 : 1} testId="members-filter-team">
            <DropdownMenuRadioGroup value={teamFilter ?? ""} onValueChange={(v) => (setTeamFilter(v || null), setPage(1))}>
              <DropdownMenuRadioItem value="">Any team</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value={NO_TEAM}>No team</DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              {liveTeams.map((team) => (
                <DropdownMenuRadioItem key={team.id} value={team.id}>
                  {team.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </FilterMenu>
          {(filtered || query) && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="members-clear-filters">
              <X /> Clear
            </Button>
          )}
          <span className="ml-auto flex items-center gap-2">
            <span className="text-2xs text-muted-foreground tabular" data-testid="members-count">
              {rows.length === allRows.length ? `${rows.length} people` : `${rows.length} of ${allRows.length}`}
            </span>
            {manage && (
              <SimpleTooltip label="Download what is listed as a spreadsheet (.csv)">
                <Button variant="outline" size="sm" onClick={() => exportCsv(rows, ws.workspace.name)} data-testid="members-export">
                  <Download /> Export
                </Button>
              </SimpleTooltip>
            )}
          </span>
        </div>

        {manage && selectedRows.length > 0 && <BulkBar rows={selectedRows} invitations={invitations.data ?? null} onClear={() => setSelected(new Set())} />}

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No members match" description="Try a different name, or clear the filters." />
        ) : isMobile ? (
          <>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
              {pageRows.map((row) => (
                <MobileMemberCard key={row.member.id} row={row} manage={manage} invitation={invitations.data?.get(row.user.id) ?? null} />
              ))}
            </ul>
            {rows.length > MEMBERS_PAGE_SIZE && <Pagination page={currentPage} pageCount={pageCount} total={rows.length} onChange={setPage} />}
          </>
        ) : (
          <div className="inline-block min-w-full align-top">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
              {/* Every cell stays on one line; the table grows as wide as its content and the page scrolls sideways. */}
              <table className="w-max min-w-full whitespace-nowrap text-[13px]">
                <thead className="bg-surface text-left text-2xs font-medium text-muted-foreground">
                  <tr className="h-8">
                    {manage && (
                      <th className="w-9 pl-3">
                        <Checkbox
                          aria-label="Select everyone listed"
                          checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                          onCheckedChange={(next) => setSelected((now) => {
                            const out = new Set(now);
                            for (const r of pageRows) {
                              if (next === true) out.add(r.member.id);
                              else out.delete(r.member.id);
                            }
                            return out;
                          })}
                          data-testid="members-select-all"
                        />
                      </th>
                    )}
                    {COLUMNS.map((column) => (
                      <SortableHeader key={column.key} label={column.label} active={sort.key === column.key} direction={sort.direction} onClick={() => toggleSort(column.key)} />
                    ))}
                    {manage && <th className="w-10 px-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageRows.map((row) => (
                    <MemberRow
                      key={row.member.id}
                      row={row}
                      manage={manage}
                      invitation={invitations.data?.get(row.user.id) ?? null}
                      selected={selected.has(row.member.id)}
                      onSelect={(on) =>
                        setSelected((now) => {
                          const next = new Set(now);
                          if (on) next.add(row.member.id);
                          else next.delete(row.member.id);
                          return next;
                        })
                      }
                    />
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

function FilterMenu({ label, count, testId, children }: { label: string; count: number; testId: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={count ? "secondary" : "outline"} size="sm" data-testid={testId}>
          <Filter /> {label}
          {count > 0 && <span className="rounded-full bg-background/70 px-1.5 text-2xs tabular">{count}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** What is listed, as a spreadsheet: one row a person, the columns the table shows plus their email. */
function exportCsv(rows: Row[], workspaceName: string) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ["Name", "Email", "Job title", "Department", "Teams", "Workspace role", "Status", "Joined", "Boards"];
  const lines = rows.map(({ user, member, teams, department, boards }) =>
    [user.displayName, user.email, user.jobTitle ?? "", department ?? "", teams.map((t) => t.name).join("; "), ROLE_LABEL[member.role], STATUS_LABEL[member.status], member.joinedAt.slice(0, 10), boards].map(cell).join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${workspaceName.replace(/[^\w-]+/g, "-").toLowerCase()}-members-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Changes for everyone selected, one person at a time through the same calls
 * the row menu makes. A change the rules refuse for somebody (your own role,
 * the last owner) is skipped for them and said so; the rest go through.
 */
function BulkBar({ rows, invitations, onClear }: { rows: Row[]; invitations: Map<string, WorkspaceInvitation> | null; onClear: () => void }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<null | "deactivate" | "cancel">(null);
  // Yourself, and Owners (whose seat only the Owner rules change), are left out of role and access changes.
  const others = rows.filter((r) => r.user.id !== ws.currentUser.id && r.member.role !== "OWNER");
  const pending = rows.filter((r) => r.member.status === "INVITED");
  const active = others.filter((r) => r.member.status === "ACTIVE");
  const deactivated = rows.filter((r) => r.member.status === "DEACTIVATED");
  const liveTeams = ws.teams.filter((t) => t.archivedAt === null).sort((a, b) => a.name.localeCompare(b.name));
  const skippedSelf = rows.length !== others.length;
  const skippedOwners = rows.some((r) => r.member.role === "OWNER" && r.user.id !== ws.currentUser.id);

  const run = async (label: string, targets: Row[], action: (row: Row) => Promise<unknown>) => {
    if (targets.length === 0) return;
    setBusy(true);
    const refused: string[] = [];
    for (const row of targets) {
      try {
        await action(row);
      } catch (error) {
        refused.push(`${row.user.firstName}: ${error instanceof Error ? error.message : "refused"}`);
      }
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvitations(ws.workspace.id) }),
    ]);
    publishDataChange({ kinds: ["workspace"] });
    setBusy(false);
    const done = targets.length - refused.length;
    if (refused.length === 0) toast.success(`${label}: ${done} ${done === 1 ? "person" : "people"}`);
    else toast.error(`${label}: ${done} done, ${refused.length} refused`, { description: refused.slice(0, 4).join(" · ") });
  };

  const copyLinks = () => {
    const lines = pending.map((r) => {
      const invitation = invitations?.get(r.user.id);
      return invitation ? `${r.user.displayName}: ${invitationUrl(invitation)}` : null;
    }).filter(Boolean);
    if (lines.length) void copyToClipboard(lines.join("\n"), `${lines.length} invite ${lines.length === 1 ? "link" : "links"} copied`);
  };

  return (
    <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-ring/40 bg-card px-3 py-2 shadow-sm" data-testid="members-bulk-bar">
      <span className="text-[13px] font-medium tabular">{rows.length} selected</span>
      {skippedSelf && <span className="text-2xs text-muted-foreground">{skippedOwners ? "You and Owners are left out of role and access changes." : "You are left out of role and access changes."}</span>}
      <span className="mx-1 h-4 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy || others.length === 0} data-testid="bulk-role">
            Role
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel>Make them</DropdownMenuLabel>
          {ASSIGNABLE_ROLES.map((role) => (
            <DropdownMenuItem key={role} onSelect={() => void run(`Made ${ROLE_LABEL[role].toLowerCase()}`, others.filter((r) => r.member.role !== role), (r) => services.workspace.changeMemberRole(r.member.id, role))}>
              {ROLE_LABEL[role]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy} data-testid="bulk-teams">
            Teams
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Add to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {liveTeams.map((team) => (
                <DropdownMenuItem key={team.id} onSelect={() => void run(`Added to ${team.name}`, rows.filter((r) => !r.teams.some((t) => t.id === team.id)), (r) => services.workspace.addTeamMember(team.id, r.user.id))}>
                  {team.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Remove from</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {liveTeams.map((team) => (
                <DropdownMenuItem key={team.id} onSelect={() => void run(`Removed from ${team.name}`, rows.filter((r) => r.teams.some((t) => t.id === team.id)), (r) => services.workspace.removeTeamMember(team.id, r.user.id))}>
                  {team.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      {pending.length > 0 && (
        <Button variant="outline" size="sm" disabled={busy} onClick={copyLinks} data-testid="bulk-copy-links">
          <Link2 /> Copy invite links
        </Button>
      )}
      {deactivated.length > 0 && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void run("Reactivated", deactivated, (r) => services.workspace.setMemberActive(r.member.id, r.user.id, true))} data-testid="bulk-reactivate">
          Reactivate
        </Button>
      )}
      {active.length > 0 && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm("deactivate")} className="text-destructive" data-testid="bulk-deactivate">
          Deactivate
        </Button>
      )}
      {pending.length > 0 && (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirm("cancel")} className="text-destructive" data-testid="bulk-cancel">
          Cancel invitations
        </Button>
      )}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear} data-testid="bulk-clear">
        <X /> Clear selection
      </Button>
      <ConfirmDialog
        open={confirm === "deactivate"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Deactivate ${active.length} ${active.length === 1 ? "person" : "people"}?`}
        description="They will no longer be able to sign in or be assigned to items. Their history is kept, and each can be reactivated."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => run("Deactivated", active, (r) => services.workspace.setMemberActive(r.member.id, r.user.id, false))}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Cancel ${pending.length} ${pending.length === 1 ? "invitation" : "invitations"}?`}
        description="They are removed from the member list and their links stop working. They never signed in, so nothing else is lost."
        confirmLabel="Cancel invitations"
        destructive
        onConfirm={() => run("Invitations cancelled", pending, (r) => services.workspace.cancelInvitation(ws.workspace.id, r.user.id))}
      />
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

function MemberRow({ row, manage, invitation, selected, onSelect }: { row: Row; manage: boolean; invitation: WorkspaceInvitation | null; selected: boolean; onSelect: (on: boolean) => void }) {
  const ws = useWorkspace();
  const { member, user, teams, department, boards } = row;
  const isSelf = user.id === ws.currentUser.id;
  const pending = member.status === "INVITED";

  return (
    <tr className={cn("h-12 hover:bg-accent/60", member.status === "DEACTIVATED" && "text-muted-foreground", selected && "bg-accent/50")} data-testid="member-row" data-member-status={member.status}>
      {manage && (
        <td className="pl-3">
          <Checkbox aria-label={`Select ${user.displayName}`} checked={selected} onCheckedChange={(next) => onSelect(next === true)} data-testid="member-select" />
        </td>
      )}
      <td className="px-3">
        <Link href={routes.person(ws.slug, user.id)} className="group flex items-center gap-2.5" data-testid="member-profile-link">
          <UserAvatar user={user} size="md" tooltip={false} className={cn(member.status !== "ACTIVE" && "opacity-50")} />
          <span className="min-w-0 leading-tight">
            <span className="block font-medium group-hover:underline">
              {user.displayName}
              {isSelf && <span className="ml-1 text-2xs font-normal text-muted-foreground">(you)</span>}
            </span>
            <span className="block text-2xs text-muted-foreground">{user.email}</span>
          </span>
        </Link>
      </td>
      <td className="px-3">{user.jobTitle ?? <span className="text-muted-foreground">&mdash;</span>}</td>
      <td className="px-3">{department ?? <span className="text-muted-foreground">&mdash;</span>}</td>
      <td className="px-3">
        <span className="flex items-center gap-1">
          {teams.length === 0 ? (
            <span className="text-muted-foreground">&mdash;</span>
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
        <span className="flex items-center gap-1.5">
          <Badge variant={member.status === "ACTIVE" ? "success" : pending ? "warning" : "muted"} data-testid="member-status">
            {STATUS_LABEL[member.status]}
          </Badge>
          {pending && invitation && (
            <SimpleTooltip label={`Link expires ${formatDateTime(invitation.expiresAt)}`}>
              <span className="text-2xs text-muted-foreground" data-testid="member-invite-expiry">
                link to {formatShortDate(invitation.expiresAt.slice(0, 10))}
              </span>
            </SimpleTooltip>
          )}
        </span>
      </td>
      <td className="px-3 tabular">
        <SimpleTooltip label={`${pending ? "Invited" : "Joined"} ${formatDateTime(member.joinedAt)}`}>
          <span data-testid="member-joined">
            {pending && <span className="text-muted-foreground">Invited </span>}
            {joinedLabel(member)}
          </span>
        </SimpleTooltip>
      </td>
      <td className="px-3 text-right tabular" data-testid="member-boards">
        {boards || <span className="text-muted-foreground">0</span>}
      </td>
      {manage && (
        <td className="px-3">
          <div className="flex items-center justify-end gap-1">
            <MemberActions row={row} invitation={invitation} />
          </div>
        </td>
      )}
    </tr>
  );
}

/**
 * One member as a phone shows it.
 *
 * The desktop table's columns become a stacked card, with the same actions
 * behind the same menu — MemberActions is shared, so a role change or a
 * cancelled invitation goes through exactly one code path.
 */
function MobileMemberCard({ row, manage, invitation }: { row: Row; manage: boolean; invitation: WorkspaceInvitation | null }) {
  const ws = useWorkspace();
  const { member, user, teams, department } = row;
  const isSelf = user.id === ws.currentUser.id;
  const pending = member.status === "INVITED";

  return (
    <li className="flex items-start gap-3 px-3 py-2.5" data-testid="member-row" data-member-status={member.status}>
      <Link href={routes.person(ws.slug, user.id)} className="flex min-w-0 flex-1 items-start gap-3" data-testid="member-profile-link">
        <UserAvatar user={user} size="lg" tooltip={false} className={cn(member.status !== "ACTIVE" && "opacity-50")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {user.displayName}
            {isSelf && <span className="ml-1 text-2xs font-normal text-muted-foreground">(you)</span>}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">{[user.jobTitle ?? user.email, department].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={member.status === "ACTIVE" ? "success" : pending ? "warning" : "muted"} data-testid="member-status">
              {STATUS_LABEL[member.status]}
            </Badge>
            <Badge variant="outline">{ROLE_LABEL[member.role]}</Badge>
            {teams.map((t) => (
              <Badge key={t.id} variant="muted">
                {t.name}
              </Badge>
            ))}
            <span className="text-2xs text-muted-foreground">
              {pending ? "Invited" : "Joined"} {joinedLabel(member)}
            </span>
          </span>
        </span>
      </Link>
      {manage && (
        <span className="flex shrink-0 items-center">
          <MemberActions row={row} invitation={invitation} />
        </span>
      )}
    </li>
  );
}

/** A member's mutations, menu and confirmations. Shared by the table row and the phone card. */
function MemberActions({ row: { member, user, teams }, invitation }: { row: Row; invitation: WorkspaceInvitation | null }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const { cancel, reinitiate } = useMemberMutations();
  const [confirmDeactivate, setConfirmDeactivate] = React.useState(false);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [confirmReinitiate, setConfirmReinitiate] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [confirmOwner, setConfirmOwner] = React.useState<null | "make" | "remove">(null);
  const { setOwner } = useWorkspaceAdmin();
  const isSelf = user.id === ws.currentUser.id;
  const pending = member.status === "INVITED";
  const ownerRow = member.role === "OWNER";
  const iAmOwner = isOwner(ws.permissions);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });

  /**
   * Say so when a change is refused.
   *
   * These three ask the database to do something the database is entitled to
   * say no to — a policy, or the rule that a workspace keeps an owner
   * (migrations/0043). Without this the menu simply closed and the row stayed
   * as it was, which reads as the app ignoring the click.
   */
  const refused = (fallback: string) => (error: unknown) => {
    toast.error(error instanceof Error && error.message ? error.message : fallback);
    void invalidate();
  };

  const changeRole = useMutation({
    mutationFn: (role: WorkspaceRole) => services.workspace.changeMemberRole(member.id, role),
    onSuccess: async () => {
      await invalidate();
      toast.success(`${user.firstName} is now ${ROLE_LABEL[changeRole.variables ?? member.role].toLowerCase()}`);
    },
    onError: refused(`Could not change ${user.firstName}'s role`),
  });
  const toggleTeam = useMutation({
    mutationFn: async ({ teamId, join }: { teamId: string; join: boolean }) => {
      if (join) await services.workspace.addTeamMember(teamId, user.id);
      else await services.workspace.removeTeamMember(teamId, user.id);
    },
    onSuccess: invalidate,
    onError: refused(`Could not change ${user.firstName}'s teams`),
  });
  const setActive = useMutation({
    mutationFn: (active: boolean) => services.workspace.setMemberActive(member.id, user.id, active),
    onSuccess: async (_r, active) => {
      await invalidate();
      toast.success(active ? `${user.firstName} reactivated` : `${user.firstName} deactivated`);
    },
    onError: refused(`Could not change ${user.firstName}'s access`),
  });

  // An Owner's seat is the Owners' business: an admin sees them, and that is all.
  if (!canManageMember(ws.permissions, member)) return null;

  return (
    <>
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
          <DropdownMenuItem asChild>
            <Link href={routes.person(ws.slug, user.id)}>Open profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyToClipboard(user.email, "Email copied")}>Copy email</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Workspace role</DropdownMenuLabel>
          {ownerRow ? (
            <DropdownMenuItem disabled data-testid="member-owner-note">
              Owner of every workspace
            </DropdownMenuItem>
          ) : (
            <DropdownMenuRadioGroup value={member.role} onValueChange={(v) => changeRole.mutate(v as WorkspaceRole)}>
              {ASSIGNABLE_ROLES.map((role) => (
                <DropdownMenuRadioItem key={role} value={role} disabled={isSelf && role !== member.role}>
                  {ROLE_LABEL[role]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
          {iAmOwner && member.status === "ACTIVE" && (
            <DropdownMenuItem onSelect={() => setConfirmOwner(ownerRow ? "remove" : "make")} data-testid={ownerRow ? "member-remove-owner" : "member-make-owner"}>
              {ownerRow ? "Remove as Owner" : "Make Owner"}
            </DropdownMenuItem>
          )}
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
              <DropdownMenuItem disabled={isSelf || ownerRow} onSelect={() => setConfirmReinitiate(true)} data-testid="reinitiate-member">
                Reinitiate onboarding
              </DropdownMenuItem>
              {member.status === "DEACTIVATED" ? (
                <DropdownMenuItem onSelect={() => setActive.mutate(true)}>Reactivate</DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" disabled={isSelf || ownerRow} onSelect={() => setConfirmDeactivate(true)}>
                  Deactivate
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOwner !== null}
        onOpenChange={(open) => !open && setConfirmOwner(null)}
        title={confirmOwner === "make" ? `Make ${user.displayName} an Owner?` : `Remove ${user.displayName} as an Owner?`}
        description={
          confirmOwner === "make"
            ? "Owners are in every workspace, can create and delete workspaces, and restore snapshots of everything."
            : "They stay in every workspace as a member."
        }
        confirmLabel={confirmOwner === "make" ? "Make Owner" : "Remove"}
        destructive={confirmOwner === "remove"}
        onConfirm={() =>
          setOwner.mutateAsync({ userId: user.id, owner: confirmOwner === "make" }).then(() => {
            toast.success(confirmOwner === "make" ? `${user.firstName} is now an Owner` : `${user.firstName} is no longer an Owner`);
            setConfirmOwner(null);
          })
        }
      />
      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate ${user.displayName}?`}
        description="They lose access to this workspace and can no longer be assigned here. Their other workspaces are not affected. Their history is kept."
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
    </>
  );
}

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
import { DEFAULT_WEEKLY_HOURS, WORKSPACE_ROLES, weeklyHoursOf, type Team, type User, type WorkspaceInvitation, type WorkspaceMember, type WorkspaceRole } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { InviteLinkDialog } from "@/features/members/components/invite-link-dialog";
import { AddToWorkspaceDialog } from "@/features/members/components/add-to-workspace-dialog";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { copyToClipboard, invitationUrl, useLiveInvitations, useMemberMutations, usePeoplePool, type PoolWorkspace } from "@/features/members/hooks";
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

type SortKey = "name" | "email" | "jobTitle" | "department" | "teams" | "workspaces" | "role" | "hours" | "status" | "joined" | "boards";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

type Column = { sorts: Array<{ key: SortKey; label: string }>; width?: string; align?: "right" };

/** One line per person: fixed widths so nothing drifts apart; email and title share what is left. */
const COLUMNS: Column[] = [
  { sorts: [{ key: "name", label: "Name" }], width: "w-52" },
  { sorts: [{ key: "email", label: "Email" }] },
  { sorts: [{ key: "department", label: "Department" }], width: "w-28" },
  { sorts: [{ key: "jobTitle", label: "Title" }] },
  { sorts: [{ key: "teams", label: "Teams" }], width: "w-60" },
  // The other workspaces somebody is in: people are one pool, and a seat is per workspace.
  { sorts: [{ key: "workspaces", label: "Other workspaces" }], width: "w-40" },
  { sorts: [{ key: "role", label: "Role" }], width: "w-20" },
  // Hours a week here, for capacity on the Workload view.
  { sorts: [{ key: "hours", label: "Hours" }], width: "w-20", align: "right" },
  { sorts: [{ key: "status", label: "Status" }], width: "w-24" },
  { sorts: [{ key: "joined", label: "Joined" }], width: "w-20" },
  { sorts: [{ key: "boards", label: "Boards" }], width: "w-20", align: "right" },
];

/** Team chips a row shows before the rest fold into "+N". */
const TEAM_CHIPS = 2;

type Row = { member: WorkspaceMember; user: User; teams: Team[]; department: string | null; boards: number; workspaces: PoolWorkspace[] };
/** Somebody from the pool who has no seat in this workspace. */
type Outsider = { user: User; department: string | null; workspaces: PoolWorkspace[] };

function compareRows(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case "name":
      return a.user.displayName.localeCompare(b.user.displayName);
    case "email":
      return a.user.email.localeCompare(b.user.email);
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
    case "workspaces":
      if ((a.workspaces.length === 0) !== (b.workspaces.length === 0)) return a.workspaces.length === 0 ? 1 : -1;
      return a.workspaces.map((w) => w.name).join(", ").localeCompare(b.workspaces.map((w) => w.name).join(", "));
    case "role":
      return WORKSPACE_ROLES.indexOf(a.member.role) - WORKSPACE_ROLES.indexOf(b.member.role);
    case "hours":
      return weeklyHoursOf(a.member) - weeklyHoursOf(b.member);
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
 * Only the exceptions get a chip. Nearly everyone is active, so a green chip on
 * every row said nothing; pending and deactivated people stand out instead.
 */
function StatusChip({ member, invitation }: { member: WorkspaceMember; invitation: WorkspaceInvitation | null }) {
  if (member.status === "ACTIVE") return null;
  if (member.status === "DEACTIVATED") {
    return (
      <Badge variant="muted" data-testid="member-status">
        Deactivated
      </Badge>
    );
  }
  const chip = (
    <Badge variant="warning" data-testid="member-status">
      Pending
    </Badge>
  );
  return invitation ? <SimpleTooltip label={`Invite link valid to ${formatShortDate(invitation.expiresAt.slice(0, 10))}`}>{chip}</SimpleTooltip> : chip;
}

/**
 * Everyone in the app, and the tools to run this workspace's seats.
 *
 * People are one pool: an account is one person across every workspace, and a
 * workspace is who of them has a seat in it, each seat with its own role. So
 * the page lists this workspace's members first and, under them, everybody
 * else — with the workspaces they are in — for an admin to give a seat here.
 * "This workspace" narrows it to the members alone.
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
  const [scope, setScope] = React.useState<"everyone" | "workspace">("everyone");
  const [adding, setAdding] = React.useState<User | null>(null);
  const manage = canManageMembers(ws.permissions);
  const isMobile = useIsMobile();
  const invitations = useLiveInvitations();
  const pool = usePeoplePool();
  /** The other workspaces a person is in; this one goes without saying. */
  const otherWorkspaces = React.useCallback((userId: string) => (pool.data?.workspacesOf.get(userId) ?? []).filter((w) => w.id !== ws.workspace.id), [pool.data, ws.workspace.id]);

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
          return user
            ? { member, user, teams: teamsByUser.get(member.userId) ?? [], department: user.stakeholderGroup?.trim() || user.department?.trim() || null, boards: boardsByUser.get(member.userId) ?? 0, workspaces: otherWorkspaces(member.userId) }
            : null;
        })
        .filter((r): r is Row => !!r),
    [ws, teamsByUser, boardsByUser, otherWorkspaces],
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

  // Everybody without a seat here. They have no status, role or team in this
  // workspace, so any of those filters leaves them out; the search still finds them.
  const seated = React.useMemo(() => new Set(ws.members.map((m) => m.userId)), [ws.members]);
  const allOutsiders = React.useMemo<Outsider[]>(
    () =>
      (pool.data?.people ?? [])
        .filter((user) => !seated.has(user.id))
        .map((user) => ({ user, department: user.stakeholderGroup?.trim() || user.department?.trim() || null, workspaces: otherWorkspaces(user.id) }))
        .sort((a, b) => a.user.displayName.localeCompare(b.user.displayName)),
    [pool.data, seated, otherWorkspaces],
  );
  const outsiders = React.useMemo(() => {
    if (scope === "workspace" || filtered) return [];
    const q = query.trim().toLowerCase();
    if (!q) return allOutsiders;
    return allOutsiders.filter(({ user, department }) => [user.displayName, user.email, user.jobTitle ?? "", department ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [allOutsiders, scope, filtered, query]);

  // A batch acts on who is selected and still listed: filtering someone away takes them out of it.
  const selectedRows = rows.filter((r) => selected.has(r.member.id));

  const pageCount = Math.max(1, Math.ceil(rows.length / MEMBERS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * MEMBERS_PAGE_SIZE, currentPage * MEMBERS_PAGE_SIZE);
  // The rest of the pool follows the members, on the last page.
  const pageOutsiders = currentPage === pageCount ? outsiders : [];

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
      {/* Header and list share one capped width, so on a wide screen the columns stay close together. */}
      <PageHeader
        className="mx-auto w-full max-w-[108rem]"
        title="Members"
        description={
          <span data-testid="members-summary">
            {activeCount} active {activeCount === 1 ? "member" : "members"}
            {pendingCount > 0 && ` · ${pendingCount} pending onboarding`}
            {allOutsiders.length > 0 && ` · ${allOutsiders.length} more in other workspaces`}
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
      <div className="scrollbar-thin flex-1 overflow-auto pb-8">
        <div className="mx-auto w-full max-w-[108rem] px-4 sm:px-7">
          <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="members-filters">
            <div role="radiogroup" aria-label="Who to list" className="inline-flex items-center rounded-full border border-border/70 p-0.5">
              {(
                [
                  ["everyone", "Everyone"],
                  ["workspace", "This workspace"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={scope === value}
                  onClick={() => (setScope(value), setPage(1))}
                  className={cn("h-8 rounded-full px-3 text-xs font-medium transition-colors", scope === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  data-testid={`members-scope-${value}`}
                >
                  {label}
                </button>
              ))}
            </div>
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
                {rows.length + outsiders.length === allRows.length + (scope === "everyone" ? allOutsiders.length : 0)
                  ? `${rows.length + outsiders.length} people`
                  : `${rows.length + outsiders.length} of ${allRows.length + (scope === "everyone" ? allOutsiders.length : 0)}`}
              </span>
              {manage && (
                <SimpleTooltip label="Download what is listed as a spreadsheet (.csv)">
                  <Button variant="outline" size="sm" onClick={() => exportCsv(rows, outsiders, ws.workspace.name)} data-testid="members-export">
                    <Download /> Export
                  </Button>
                </SimpleTooltip>
              )}
            </span>
          </div>

          {manage && selectedRows.length > 0 && <BulkBar rows={selectedRows} invitations={invitations.data ?? null} onClear={() => setSelected(new Set())} />}

          {rows.length === 0 && outsiders.length === 0 ? (
            <EmptyState icon={Users} title="No one matches" description="Try a different name, or clear the filters." />
          ) : isMobile ? (
            <>
              <ul className="space-y-1.5">
                {pageRows.map((row) => (
                  <MobileMemberCard key={row.member.id} row={row} manage={manage} invitation={invitations.data?.get(row.user.id) ?? null} />
                ))}
                {pageOutsiders.length > 0 && (
                  <li className="px-1 pt-2.5 pb-0.5 text-2xs font-medium text-muted-foreground" data-testid="members-outsiders-heading">
                    Not in {ws.workspace.name} · {pageOutsiders.length}
                  </li>
                )}
                {pageOutsiders.map((person) => (
                  <MobileOutsiderCard key={person.user.id} person={person} manage={manage} onAdd={() => setAdding(person.user)} />
                ))}
              </ul>
              {rows.length > MEMBERS_PAGE_SIZE && <Pagination page={currentPage} pageCount={pageCount} total={rows.length} onChange={setPage} />}
            </>
          ) : (
            // Below this width the page scrolls sideways rather than squeezing names to nothing.
            <div className="min-w-[94rem]">
              <div className="-my-1.5">
                {/* Fixed layout: the widths come from the colgroup, and long text truncates instead of pushing columns apart.
                    Separate borders so each person reads as a card of their own. */}
                <table className="w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-1.5 whitespace-nowrap text-[13px]">
                  <colgroup>
                    {manage && <col className="w-10" />}
                    {COLUMNS.map((column, i) => (
                      <col key={i} className={column.width} />
                    ))}
                    {manage && <col className="w-12" />}
                  </colgroup>
                  <thead className="text-left text-2xs font-medium text-muted-foreground">
                    <tr className="h-8">
                      {manage && (
                        <th className="pl-3">
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
                      {COLUMNS.map((column, i) => (
                        <SortableHeader key={i} column={column} sort={sort} onSort={toggleSort} />
                      ))}
                      {manage && <th />}
                    </tr>
                  </thead>
                  <tbody>
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
                    {pageOutsiders.length > 0 && (
                      <tr className="h-8" data-testid="members-outsiders-heading">
                        <td colSpan={COLUMNS.length + (manage ? 2 : 0)} className="px-3 text-2xs font-medium text-muted-foreground">
                          Not in {ws.workspace.name} · {pageOutsiders.length} {pageOutsiders.length === 1 ? "person" : "people"} in other workspaces
                        </td>
                      </tr>
                    )}
                    {pageOutsiders.map((person) => (
                      <OutsiderRow key={person.user.id} person={person} manage={manage} onAdd={() => setAdding(person.user)} />
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > MEMBERS_PAGE_SIZE && <Pagination page={currentPage} pageCount={pageCount} total={rows.length} onChange={setPage} />}
            </div>
          )}
        </div>
      </div>
      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AddToWorkspaceDialog key={adding?.id ?? "none"} user={adding} onOpenChange={(open) => !open && setAdding(null)} />
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
function exportCsv(rows: Row[], outsiders: Outsider[], workspaceName: string) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ["Name", "Email", "Job title", "Department", "Teams", "Other workspaces", "Workspace role", "Hours a week", "Status", "Joined", "Boards"];
  const lines = [
    ...rows.map(({ user, member, teams, department, boards, workspaces }) =>
      [user.displayName, user.email, user.jobTitle ?? "", department ?? "", teams.map((t) => t.name).join("; "), workspaces.map((w) => w.name).join("; "), ROLE_LABEL[member.role], weeklyHoursOf(member), STATUS_LABEL[member.status], member.joinedAt.slice(0, 10), boards]
        .map(cell)
        .join(","),
    ),
    ...outsiders.map(({ user, department, workspaces }) =>
      [user.displayName, user.email, user.jobTitle ?? "", department ?? "", "", workspaces.map((w) => w.name).join("; "), "", "", "Not in this workspace", "", 0].map(cell).join(","),
    ),
  ];
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

/** A column's header: one sort button, or one for each field when two share the column. */
function SortableHeader({ column, sort, onSort }: { column: Column; sort: Sort; onSort: (key: SortKey) => void }) {
  const right = column.align === "right";
  const active = column.sorts.some((s) => s.key === sort.key);
  return (
    <th className="px-0 font-medium" aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <span className="flex h-8 items-center px-1.5">
        {column.sorts.map(({ key, label }, i) => {
          const on = sort.key === key;
          const Icon = !on ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
          return (
            <React.Fragment key={key}>
              {i > 0 && <span aria-hidden className="text-muted-foreground/60">·</span>}
              <button
                type="button"
                onClick={() => onSort(key)}
                className={cn(
                  "group flex h-full min-w-0 items-center gap-1 px-1.5 font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  column.sorts.length === 1 && "flex-1",
                  // The icon goes on the inside, so a right-aligned label lines up with the numbers under it.
                  right && "flex-row-reverse",
                  on && "text-foreground",
                )}
                data-testid={`sort-${label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <span className="truncate">{label}</span>
                <Icon className={cn("size-3 shrink-0", on ? "opacity-100" : "opacity-0 group-hover:opacity-60")} aria-hidden />
              </button>
            </React.Fragment>
          );
        })}
      </span>
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
    <tr className={cn("h-11", CARD_ROW, "hover:[&>td]:bg-accent/60", member.status === "DEACTIVATED" && "text-muted-foreground", selected && "[&>td]:border-ring/40 [&>td]:bg-accent/50")} data-testid="member-row" data-member-status={member.status}>
      {manage && (
        <td className="pl-3">
          <Checkbox aria-label={`Select ${user.displayName}`} checked={selected} onCheckedChange={(next) => onSelect(next === true)} data-testid="member-select" />
        </td>
      )}
      <td className="px-3">
        <Link href={routes.person(ws.slug, user.id)} className="group flex min-w-0 items-center gap-2.5" data-testid="member-profile-link">
          <UserAvatar user={user} size="sm" tooltip={false} className={cn(member.status !== "ACTIVE" && "opacity-50")} />
          <span className="min-w-0 truncate font-semibold group-hover:underline">
            {user.displayName}
            {isSelf && <span className="ml-1 text-2xs font-normal text-muted-foreground">(you)</span>}
          </span>
        </Link>
      </td>
      <OneLineCell value={user.email} muted />
      <OneLineCell value={department} />
      <OneLineCell value={user.jobTitle} />
      <td className="px-3">
        {teams.length === 0 ? (
          <span className="text-muted-foreground">&mdash;</span>
        ) : (
          <span className="flex items-center gap-1">
            {teams.slice(0, TEAM_CHIPS).map((t) => (
              <Badge key={t.id} variant="muted" className="inline-block min-w-0 truncate" title={t.name}>
                {t.name}
              </Badge>
            ))}
            {teams.length > TEAM_CHIPS && (
              <SimpleTooltip label={teams.slice(TEAM_CHIPS).map((t) => t.name).join(", ")}>
                <Badge variant="muted" className="shrink-0 tabular" data-testid="member-more-teams">
                  +{teams.length - TEAM_CHIPS}
                </Badge>
              </SimpleTooltip>
            )}
          </span>
        )}
      </td>
      <td className="px-3">
        <WorkspaceChips workspaces={row.workspaces} />
      </td>
      <td className="truncate px-3">{ROLE_LABEL[member.role]}</td>
      <td className="px-3 text-right tabular" data-testid="member-hours">
        <HoursCell member={member} name={user.firstName || user.displayName} editable={manage && member.status !== "DEACTIVATED"} />
      </td>
      <td className="px-3">
        <StatusChip member={member} invitation={invitation} />
      </td>
      <td className="truncate px-3 tabular">
        {/* The Pending chip already says it is an invitation, so the date alone, muted. */}
        <SimpleTooltip label={`${pending ? "Invited" : "Joined"} ${formatDateTime(member.joinedAt)}`}>
          <span className={cn(pending && "text-muted-foreground")} data-testid="member-joined">
            {joinedLabel(member)}
          </span>
        </SimpleTooltip>
      </td>
      <td className="px-3 text-right tabular" data-testid="member-boards">
        {boards || <span className="text-muted-foreground">0</span>}
      </td>
      {manage && (
        <td className="px-2 text-right">
          <MemberActions row={row} invitation={invitation} />
        </td>
      )}
    </tr>
  );
}

/**
 * Hours a week here, typed straight into the row by whoever manages members.
 * Empty is the usual week; saved on Enter or when the field is left.
 */
function HoursCell({ member, name, editable }: { member: WorkspaceMember; name: string; editable: boolean }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const ws = useWorkspace();
  const stored = member.weeklyHours ?? null;
  const [draft, setDraft] = React.useState(stored === null ? "" : String(stored));
  const [seen, setSeen] = React.useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setDraft(stored === null ? "" : String(stored));
  }
  const save = useMutation({
    mutationFn: (hours: number | null) => services.workspace.setMemberWeeklyHours(member.id, hours),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) }),
    onError: (error) => {
      toast.error(error instanceof Error && error.message ? error.message : `Could not change ${name}'s hours`);
      setDraft(stored === null ? "" : String(stored));
    },
  });
  if (!editable) return <span className={cn(stored === null && "text-muted-foreground")}>{weeklyHoursOf(member)}</span>;
  const commit = () => {
    const text = draft.trim();
    const next = text === "" ? null : Number(text);
    if (next !== null && !Number.isFinite(next)) return setDraft(stored === null ? "" : String(stored));
    if (next !== stored) save.mutate(next);
  };
  return (
    <input
      type="number"
      inputMode="decimal"
      min={0}
      max={80}
      step={0.5}
      value={draft}
      placeholder={String(DEFAULT_WEEKLY_HOURS)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      aria-label={`${name}'s hours a week`}
      title="Hours a week in this workspace, for capacity. Empty is a full week."
      className="h-7 w-14 rounded-md border border-transparent bg-transparent px-1.5 text-right tabular outline-none placeholder:text-muted-foreground hover:border-border focus:border-ring focus:bg-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      data-testid="member-hours-input"
    />
  );
}

/** A single-line cell: the value truncated with the whole of it on hover, or a dash. */
function OneLineCell({ value, muted = false }: { value: string | null | undefined; muted?: boolean }) {
  return (
    <td className={cn("truncate px-3", muted && "text-muted-foreground")} title={value || undefined}>
      {value || <span className="text-muted-foreground">&mdash;</span>}
    </td>
  );
}

/** A table row drawn as a card: each cell carries the fill and its share of the border, the ends round it off. */
const CARD_ROW =
  "[&>td]:border-y [&>td]:border-border [&>td]:bg-card [&>td]:transition-colors [&>td:first-child]:rounded-l-lg [&>td:first-child]:border-l [&>td:last-child]:rounded-r-lg [&>td:last-child]:border-r";

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
    <li className="flex items-start gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 shadow-xs" data-testid="member-row" data-member-status={member.status}>
      <Link href={routes.person(ws.slug, user.id)} className="flex min-w-0 flex-1 items-start gap-3" data-testid="member-profile-link">
        <UserAvatar user={user} size="lg" tooltip={false} className={cn(member.status !== "ACTIVE" && "opacity-50")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">
            {user.displayName}
            {isSelf && <span className="ml-1 text-2xs font-normal text-muted-foreground">(you)</span>}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">{[user.jobTitle ?? user.email, department].filter(Boolean).join(" · ")}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusChip member={member} invitation={invitation} />
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
          {row.workspaces.length > 0 && <span className="mt-1 block truncate text-2xs text-muted-foreground">Also in {row.workspaces.map((w) => w.name).join(", ")}</span>}
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

/** Workspace names as chips: two, then a count with the rest in its tooltip. */
function WorkspaceChips({ workspaces }: { workspaces: PoolWorkspace[] }) {
  if (workspaces.length === 0) return <span className="text-muted-foreground">&mdash;</span>;
  return (
    <span className="flex items-center gap-1" data-testid="member-workspaces">
      {workspaces.slice(0, 2).map((w) => (
        <Badge key={w.id} variant="outline" className="inline-block min-w-0 truncate" title={w.name}>
          {w.name}
        </Badge>
      ))}
      {workspaces.length > 2 && (
        <SimpleTooltip label={workspaces.slice(2).map((w) => w.name).join(", ")}>
          <Badge variant="outline" className="shrink-0 tabular">
            +{workspaces.length - 2}
          </Badge>
        </SimpleTooltip>
      )}
    </span>
  );
}

/**
 * Somebody from the pool with no seat here: who they are, where they are, and
 * for an admin the way to give them one. No profile link — their profile is
 * read inside a workspace they belong to — and nothing about this workspace to
 * show, since they are not in it.
 */
function OutsiderRow({ person, manage, onAdd }: { person: Outsider; manage: boolean; onAdd: () => void }) {
  const ws = useWorkspace();
  const { user, department, workspaces } = person;
  return (
    <tr className={cn("h-11 text-muted-foreground", CARD_ROW, "[&>td]:border-dashed [&>td]:bg-card/50 hover:[&>td]:bg-accent/40")} data-testid="member-outsider-row">
      {manage && <td className="pl-3" />}
      <td className="px-3">
        <span className="flex min-w-0 items-center gap-2.5">
          <UserAvatar user={user} size="sm" tooltip={false} className="opacity-70" />
          <span className="min-w-0 truncate font-medium text-foreground/85">{user.displayName}</span>
        </span>
      </td>
      <OneLineCell value={user.email} />
      <OneLineCell value={department} />
      <OneLineCell value={user.jobTitle} />
      <td className="px-3">&mdash;</td>
      <td className="px-3">
        <WorkspaceChips workspaces={workspaces} />
      </td>
      <td className="px-3" colSpan={5}>
        {manage ? (
          <Button variant="outline" size="sm" onClick={onAdd} aria-label={`Add ${user.displayName} to ${ws.workspace.name}`} data-testid="member-add-to-workspace">
            <UserPlus /> Add to {ws.workspace.name}
          </Button>
        ) : (
          <span className="text-2xs">Not in this workspace</span>
        )}
      </td>
      {manage && <td />}
    </tr>
  );
}

function MobileOutsiderCard({ person, manage, onAdd }: { person: Outsider; manage: boolean; onAdd: () => void }) {
  const { user, department, workspaces } = person;
  return (
    <li className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 bg-card/50 px-3 py-2.5" data-testid="member-outsider-row">
      <UserAvatar user={user} size="lg" tooltip={false} className="opacity-70" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-foreground/85">{user.displayName}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{[user.jobTitle ?? user.email, department].filter(Boolean).join(" · ")}</span>
        {workspaces.length > 0 && <span className="mt-0.5 block truncate text-2xs text-muted-foreground">In {workspaces.map((w) => w.name).join(", ")}</span>}
      </span>
      {manage && (
        <Button variant="outline" size="sm" onClick={onAdd} aria-label={`Add ${user.displayName} to this workspace`} data-testid="member-add-to-workspace">
          <UserPlus /> Add
        </Button>
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
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const [typedName, setTypedName] = React.useState("");
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
  const removePerson = useMutation({
    mutationFn: () => services.workspace.removePerson(ws.workspace.id, user.id, ws.currentUser.id, typedName),
    onSuccess: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvitations(ws.workspace.id) });
      toast.success(`${user.displayName} was removed`);
    },
    onError: refused(`Could not remove ${user.firstName}`),
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
              <DropdownMenuItem onSelect={() => setLinkOpen(true)} data-testid="invite-link-button">
                Show or renew link
              </DropdownMenuItem>
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
          <DropdownMenuItem variant="destructive" disabled={isSelf || ownerRow} onSelect={() => setConfirmRemove(true)} data-testid="member-remove-completely">
            Remove completely
          </DropdownMenuItem>
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
        open={confirmRemove}
        onOpenChange={(open) => {
          setConfirmRemove(open);
          if (!open) setTypedName("");
        }}
        title={`Remove ${user.displayName} completely?`}
        description="Their account goes, in every workspace, with their updates (and the replies under them), activity, messages and notifications. Their tasks, boards and deliverables stay, handed to you. A snapshot is taken first."
        confirmLabel="Remove"
        destructive
        confirmDisabled={typedName.trim() !== user.displayName.trim() || removePerson.isPending}
        onConfirm={() => removePerson.mutateAsync().then(() => setTypedName(""))}
      >
        <div className="grid gap-1.5">
          <p className="text-[13px] text-muted-foreground">
            Type <span className="font-medium text-foreground">{user.displayName}</span> to confirm.
          </p>
          <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} aria-label="Name to confirm" data-testid="member-remove-confirm" />
        </div>
      </ConfirmDialog>
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

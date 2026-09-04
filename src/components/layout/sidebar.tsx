"use client";

import {
  ChevronDown,
  ChevronRight,
  Home,
  Inbox,
  LayoutGrid,
  ListTodo,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Star,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { UserMenu } from "@/components/layout/user-menu";
import type { Board, Team } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { CreateBoardDialog } from "@/features/boards/components/create-board-dialog";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { useUnreadCount } from "@/features/notifications/hooks";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canCreateBoard, canCreateTeam, canManageMembers, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

export function Sidebar() {
  const ws = useWorkspace();
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const unread = useUnreadCount(user?.id ?? "");
  const [createBoardOpen, setCreateBoardOpen] = React.useState(false);
  const [createTeamOpen, setCreateTeamOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const visibleBoards = ws.boards.filter((b) => b.archivedAt === null && canViewBoard(ws.permissions, b));
  const favouriteBoards = visibleBoards.filter((b) => ws.isFavourite(b.id));
  const teams = ws.teams.filter((t) => t.archivedAt === null);
  const boardsWithoutTeam = visibleBoards.filter((b) => !b.teamId || !teams.some((t) => t.id === b.teamId));
  const activeBoardSlug = pathname.includes("/boards/") ? pathname.split("/boards/")[1]?.split("/")[0] : null;
  const activeTeamId = pathname.includes("/teams/") ? pathname.split("/teams/")[1]?.split("/")[0] : null;
  const isActivePath = (path: string) => pathname === path;

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div className={cn("flex h-12 items-center gap-2 border-b border-sidebar-border px-3", collapsed && "justify-center px-0")}>
        <Link href={routes.workspace(ws.slug)} className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
          <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">
            R
          </span>
          {!collapsed && <span className="truncate text-[13px] font-semibold">{ws.workspace.name}</span>}
        </Link>
        {!collapsed && (
          <SimpleTooltip label="Collapse sidebar" side="right">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </SimpleTooltip>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 py-2" aria-label="Workspace navigation">
        {collapsed && (
          <SimpleTooltip label="Expand sidebar" side="right">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              className="mb-1 flex size-9 w-full items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeft className="size-4" />
            </button>
          </SimpleTooltip>
        )}
        <ul className="space-y-0.5">
          <NavItem href={routes.workspace(ws.slug)} icon={Home} label="Home" active={isActivePath(routes.workspace(ws.slug))} collapsed={collapsed} />
          <NavItem href={routes.myWork(ws.slug)} icon={ListTodo} label="My Work" active={isActivePath(routes.myWork(ws.slug))} collapsed={collapsed} />
          <NavItem
            href={routes.inbox(ws.slug)}
            icon={Inbox}
            label="Inbox"
            active={isActivePath(routes.inbox(ws.slug))}
            collapsed={collapsed}
            badge={unread > 0 ? unread : undefined}
          />
        </ul>

        <Section title="Favourites" icon={Star} collapsed={collapsed} storeKey="favourites">
          {favouriteBoards.length === 0 ? (
            !collapsed && <p className="px-2 py-1 text-2xs text-muted-foreground">Star a board to pin it here.</p>
          ) : (
            favouriteBoards.map((board) => (
              <BoardLink key={board.id} board={board} href={ws.boardPath(board)} active={activeBoardSlug === board.slug} collapsed={collapsed} />
            ))
          )}
        </Section>

        <div className="mt-3">
          {!collapsed && <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Teams</p>}
          <ul className="space-y-0.5">
            {teams.map((team) => (
              <TeamNode
                key={team.id}
                team={team}
                boards={ws.boardsForTeam(team.id).filter((b) => canViewBoard(ws.permissions, b))}
                collapsed={collapsed}
                activeBoardSlug={activeBoardSlug}
                activeTeam={activeTeamId === team.id}
                searchView={searchParams.get("view")}
              />
            ))}
          </ul>
          {boardsWithoutTeam.length > 0 && (
            <div className="mt-2">
              {!collapsed && <p className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Other boards</p>}
              <ul className="space-y-0.5">
                {boardsWithoutTeam.map((board) => (
                  <BoardLink key={board.id} board={board} href={ws.boardPath(board)} active={activeBoardSlug === board.slug} collapsed={collapsed} />
                ))}
              </ul>
            </div>
          )}
          {!collapsed && (
            <div className="mt-2 space-y-0.5">
              {canCreateTeam(ws.permissions) && (
                <button type="button" onClick={() => setCreateTeamOpen(true)} className={subtleButtonClasses}>
                  <Plus className="size-3.5" /> Add Team
                </button>
              )}
              {canCreateBoard(ws.permissions) && (
                <button type="button" onClick={() => setCreateBoardOpen(true)} className={subtleButtonClasses} data-testid="sidebar-add-board">
                  <Plus className="size-3.5" /> Add Board
                </button>
              )}
            </div>
          )}
        </div>
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <ul className="space-y-0.5">
          <li>
            <SimpleTooltip label="Search (Ctrl/⌘ K)" side="right" disabled={!collapsed}>
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className={cn(navItemClasses(false), collapsed && "justify-center px-0")}
              >
                <Search className="size-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Search</span>
                    <kbd className="rounded border bg-background px-1 text-2xs text-muted-foreground">⌘K</kbd>
                  </>
                )}
              </button>
            </SimpleTooltip>
          </li>
          {canManageMembers(ws.permissions) && (
            <li>
              <SimpleTooltip label="Invite members" side="right" disabled={!collapsed}>
                <button type="button" onClick={() => setInviteOpen(true)} className={cn(navItemClasses(false), collapsed && "justify-center px-0")}>
                  <UserPlus className="size-4 shrink-0" />
                  {!collapsed && <span>Invite Members</span>}
                </button>
              </SimpleTooltip>
            </li>
          )}
          <NavItem href={routes.settings(ws.slug)} icon={Settings} label="Settings" active={pathname.startsWith(routes.settings(ws.slug))} collapsed={collapsed} />
        </ul>
        <div className="mt-1">
          <UserMenu collapsed={collapsed} />
        </div>
      </div>

      <CreateBoardDialog open={createBoardOpen} onOpenChange={setCreateBoardOpen} />
      <CreateTeamDialog open={createTeamOpen} onOpenChange={setCreateTeamOpen} />
      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </aside>
  );
}

const subtleButtonClasses =
  "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-[13px] text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

function navItemClasses(active: boolean): string {
  return cn(
    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
    active ? "bg-sidebar-accent text-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  collapsed,
  badge,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  return (
    <li>
      <SimpleTooltip label={label} side="right" disabled={!collapsed}>
        <Link href={href} aria-current={active ? "page" : undefined} className={cn(navItemClasses(active), collapsed && "justify-center px-0")}>
          <span className="relative">
            <Icon className="size-4 shrink-0" />
            {collapsed && badge ? <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" /> : null}
          </span>
          {!collapsed && <span className="flex-1 truncate">{label}</span>}
          {!collapsed && badge ? (
            <span className="rounded-full bg-primary px-1.5 py-px text-2xs font-semibold text-white tabular">{badge}</span>
          ) : null}
        </Link>
      </SimpleTooltip>
    </li>
  );
}

function Section({
  title,
  icon: Icon,
  collapsed,
  children,
  storeKey,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  children: React.ReactNode;
  storeKey: "favourites";
}) {
  const expanded = useUiStore((s) => (storeKey === "favourites" ? s.favouritesExpanded : true));
  const toggle = useUiStore((s) => s.toggleFavourites);
  if (collapsed) {
    return (
      <div className="mt-3 border-t border-sidebar-border pt-2">
        <ul className="space-y-0.5">{children}</ul>
      </div>
    );
  }
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-sidebar-accent/70"
      >
        <Icon className="size-3.5" />
        <span className="flex-1 text-left">{title}</span>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {expanded && <ul className="mt-0.5 space-y-0.5">{children}</ul>}
    </div>
  );
}

function BoardLink({ board, href, active, collapsed, nested }: { board: Board; href: string; active: boolean; collapsed: boolean; nested?: boolean }) {
  return (
    <li>
      <SimpleTooltip label={board.name} side="right" disabled={!collapsed}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(navItemClasses(active), "h-7 font-normal", collapsed && "justify-center px-0", nested && !collapsed && "pl-2")}
        >
          <LayoutGrid className={cn("size-3.5 shrink-0", active ? "text-foreground" : "text-muted-foreground/70")} />
          {!collapsed && <span className="truncate">{board.name}</span>}
        </Link>
      </SimpleTooltip>
    </li>
  );
}

function TeamNode({
  team,
  boards,
  collapsed,
  activeBoardSlug,
  activeTeam,
  searchView,
}: {
  team: Team;
  boards: Board[];
  collapsed: boolean;
  activeBoardSlug: string | null | undefined;
  activeTeam: boolean;
  searchView: string | null;
}) {
  const ws = useWorkspace();
  const expandedIds = useUiStore((s) => s.expandedTeamIds);
  const toggleTeam = useUiStore((s) => s.toggleTeam);
  const containsActive = boards.some((b) => b.slug === activeBoardSlug);
  const expanded = expandedIds.includes(team.id) || containsActive;
  const colors = colorClasses(team.color);

  if (collapsed) {
    return (
      <li>
        <SimpleTooltip label={team.name} side="right">
          <Link href={routes.team(ws.slug, team.id)} className={cn(navItemClasses(activeTeam), "justify-center px-0")}>
            <DynamicIcon name={team.icon} className={cn("size-4", colors.text)} />
          </Link>
        </SimpleTooltip>
      </li>
    );
  }

  return (
    <li>
      <div className={cn("flex h-8 items-center rounded-md pr-1", activeTeam ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70")}>
        <button
          type="button"
          onClick={() => toggleTeam(team.id)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${team.name}`}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <Link href={routes.team(ws.slug, team.id)} className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-medium">
          <DynamicIcon name={team.icon} className={cn("size-3.5 shrink-0", colors.text)} />
          <span className="truncate">{team.name}</span>
        </Link>
        <span className="text-2xs text-muted-foreground tabular">{boards.length}</span>
      </div>
      {expanded && (
        <ul className="mt-0.5 ml-[15px] space-y-0.5 border-l border-sidebar-border pl-2">
          {boards.length === 0 && <li className="py-1 pl-2 text-2xs text-muted-foreground">No boards yet</li>}
          {boards.map((board) => (
            <BoardLink
              key={board.id}
              board={board}
              href={ws.boardPath(board, activeBoardSlug === board.slug && searchView ? { view: searchView as never } : undefined)}
              active={activeBoardSlug === board.slug}
              collapsed={false}
              nested
            />
          ))}
        </ul>
      )}
    </li>
  );
}

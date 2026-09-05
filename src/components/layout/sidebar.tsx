"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  Home,
  Inbox,
  Kanban,
  LayoutGrid,
  ListTodo,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { RowMenu, type MenuAction } from "@/components/layout/row-menu";
import { UserMenu } from "@/components/layout/user-menu";
import type { Board, Team, Tracker } from "@/domain";
import { useAuth } from "@/features/auth/auth-context";
import { CreateBoardDialog } from "@/features/boards/components/create-board-dialog";
import { BoardSettingsDialog, type BoardSettingsSection } from "@/features/boards/components/dialogs/board-settings-dialog";
import { DeleteBoardDialog } from "@/features/boards/components/dialogs/delete-board-dialog";
import { useBoardActions } from "@/features/boards/hooks/use-board-actions";
import { useServices } from "@/features/data/data-context";
import { InviteMemberDialog } from "@/features/members/components/invite-member-dialog";
import { useUnreadMessages } from "@/features/messages/hooks";
import { useUnreadCount } from "@/features/notifications/hooks";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { CreateTrackerDialog } from "@/features/trackers/create-tracker-dialog";
import { useTrackerMutations, useTrackers } from "@/features/trackers/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canCreateBoard, canCreateTeam, canDeleteBoard, canEditTrackers, canManageBoard, canManageMembers, canManageTeam, canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { SIDEBAR_MIN_WIDTH, useUiStore } from "@/stores/ui-store";

/** Actions rows can trigger that need dialogs owned by the sidebar itself. */
interface SidebarActions {
  openBoardSettings: (board: Board, section: BoardSettingsSection) => void;
  requestDeleteBoard: (board: Board) => void;
  newBoardInTeam: (teamId: string) => void;
  newTrackerInTeam: (teamId: string) => void;
  requestDeleteTracker: (tracker: Tracker) => void;
  editTeam: (team: Team) => void;
  archiveTeam: (team: Team) => void;
}

const SidebarActionsContext = React.createContext<SidebarActions | null>(null);

function useSidebarActions(): SidebarActions {
  const ctx = React.useContext(SidebarActionsContext);
  if (!ctx) throw new Error("useSidebarActions must be used inside Sidebar");
  return ctx;
}

export function Sidebar() {
  const ws = useWorkspace();
  const { user } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const services = useServices();
  const queryClient = useQueryClient();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const unread = useUnreadCount(user?.id ?? "");
  const unreadMessages = useUnreadMessages().data ?? 0;
  const [createBoardOpen, setCreateBoardOpen] = React.useState(false);
  const [createBoardTeamId, setCreateBoardTeamId] = React.useState<string | null>(null);
  const [createTeamOpen, setCreateTeamOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [boardSettings, setBoardSettings] = React.useState<{ board: Board; section: BoardSettingsSection } | null>(null);
  const [createTrackerTeamId, setCreateTrackerTeamId] = React.useState<string | null>(null);
  const [createTrackerOpen, setCreateTrackerOpen] = React.useState(false);
  const [deletingTracker, setDeletingTracker] = React.useState<Tracker | null>(null);
  const trackers = useTrackers();
  const trackerMutations = useTrackerMutations();
  const [deletingBoard, setDeletingBoard] = React.useState<Board | null>(null);
  const [editingTeam, setEditingTeam] = React.useState<Team | null>(null);
  const [archivingTeam, setArchivingTeam] = React.useState<Team | null>(null);

  const archiveTeam = useMutation({
    mutationFn: (team: Team) => services.workspace.archiveTeam(team.id, true),
    onSuccess: async (team) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      toast.success(`${team.name} archived`, { description: "Restore it from Settings → Teams." });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not archive team"),
  });

  const sidebarActions = React.useMemo<SidebarActions>(
    () => ({
      openBoardSettings: (board, section) => setBoardSettings({ board, section }),
      requestDeleteBoard: (board) => setDeletingBoard(board),
      newBoardInTeam: (teamId) => {
        setCreateBoardTeamId(teamId);
        setCreateBoardOpen(true);
      },
      newTrackerInTeam: (teamId) => {
        setCreateTrackerTeamId(teamId);
        setCreateTrackerOpen(true);
      },
      requestDeleteTracker: (tracker) => setDeletingTracker(tracker),
      editTeam: (team) => setEditingTeam(team),
      archiveTeam: (team) => setArchivingTeam(team),
    }),
    [],
  );
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const [resizing, setResizing] = React.useState(false);
  // Keep the settings dialog's board fresh after renames/moves.
  const settingsBoard = boardSettings ? (ws.boardById(boardSettings.board.id) ?? null) : null;

  const accessibleBoards = ws.boards.filter((b) => canViewBoard(ws.permissions, b));
  const visibleBoards = accessibleBoards.filter((b) => b.archivedAt === null);
  const favouriteBoards = visibleBoards.filter((b) => ws.isFavourite(b.id));
  const teams = ws.teams.filter((t) => t.archivedAt === null);
  const hasTeam = (b: Board) => !!b.teamId && teams.some((t) => t.id === b.teamId);
  const boardsWithoutTeam = visibleBoards.filter((b) => !hasTeam(b));
  const archivedWithoutTeam = accessibleBoards.filter((b) => b.archivedAt !== null && !hasTeam(b));
  const activeBoardSlug = pathname.includes("/boards/") ? pathname.split("/boards/")[1]?.split("/")[0] : null;
  const activeTrackerId = pathname.includes("/trackers/") ? pathname.split("/trackers/")[1]?.split("/")[0] : null;
  const trackersForTeam = (teamId: string) => (trackers.data ?? []).filter((t) => t.teamId === teamId);
  const activeTeamId = pathname.includes("/teams/") ? pathname.split("/teams/")[1]?.split("/")[0] : null;
  const isActivePath = (path: string) => pathname === path;

  return (
    <SidebarActionsContext.Provider value={sidebarActions}>
    <aside
      data-collapsed={collapsed}
      style={collapsed ? undefined : { width: sidebarWidth }}
      className={cn(
        "relative flex h-full shrink-0 flex-col overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground shadow-sm",
        !resizing && "transition-[width] duration-150",
        collapsed && "w-14",
      )}
    >
      {!collapsed && <SidebarResizeHandle onResizing={setResizing} />}
      <div className={cn("flex h-14 shrink-0 items-center gap-2.5 px-3", collapsed && "justify-center px-0")}>
        <Link href={routes.workspace(ws.slug)} className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-white shadow-xs">
            R
          </span>
          {!collapsed && <span className="truncate text-sm font-semibold tracking-tight">{ws.workspace.name}</span>}
        </Link>
        {!collapsed && (
          <SimpleTooltip label="Collapse sidebar" side="right">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </SimpleTooltip>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pt-1 pb-3" aria-label="Workspace navigation">
        {collapsed && (
          <SimpleTooltip label="Expand sidebar" side="right">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expand sidebar"
              className="mb-1 flex size-9 w-full items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <PanelLeft className="size-4" />
            </button>
          </SimpleTooltip>
        )}
        <ul className="space-y-1">
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
          <NavItem
            href={routes.messages(ws.slug)}
            icon={MessageSquare}
            label="Messages"
            active={isActivePath(routes.messages(ws.slug))}
            collapsed={collapsed}
            badge={unreadMessages > 0 ? unreadMessages : undefined}
          />
          <li>
            <SimpleTooltip label="Search (Ctrl/⌘ F)" side="right" disabled={!collapsed}>
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className={cn(navItemClasses(false), collapsed && "justify-center px-0")}
              >
                <Search className="size-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">Search</span>
                    <kbd className="rounded-md border border-border/70 bg-card px-1.5 py-0.5 text-2xs text-muted-foreground">⌘F</kbd>
                  </>
                )}
              </button>
            </SimpleTooltip>
          </li>
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
          {!collapsed && <p className="label-quiet px-2.5 pt-2 pb-1">Teams</p>}
          <ul className="space-y-1">
            {teams.map((team) => (
              <TeamNode
                key={team.id}
                team={team}
                boards={ws.boardsForTeam(team.id).filter((b) => canViewBoard(ws.permissions, b))}
                trackers={trackersForTeam(team.id)}
                archivedBoards={accessibleBoards.filter((b) => b.archivedAt !== null && b.teamId === team.id)}
                collapsed={collapsed}
                activeBoardSlug={activeBoardSlug}
                activeTrackerId={activeTrackerId}
                activeTeam={activeTeamId === team.id}
                searchView={searchParams.get("view")}
              />
            ))}
          </ul>
          {(boardsWithoutTeam.length > 0 || archivedWithoutTeam.length > 0) && (
            <div className="mt-2">
              {!collapsed && <p className="label-quiet px-2.5 pt-2 pb-1">Other boards</p>}
              <ul className="space-y-0.5">
                {boardsWithoutTeam.map((board) => (
                  <BoardLink key={board.id} board={board} href={ws.boardPath(board)} active={activeBoardSlug === board.slug} collapsed={collapsed} />
                ))}
                {!collapsed && <ArchivedFolder boards={archivedWithoutTeam} activeBoardSlug={activeBoardSlug} />}
              </ul>
            </div>
          )}
          {!collapsed && (canCreateTeam(ws.permissions) || canCreateBoard(ws.permissions) || canEditTrackers(ws.permissions)) && (
            <div className="mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={subtleButtonClasses} data-testid="sidebar-add-new">
                    <Plus className="size-3.5" /> Add new
                    <ChevronRight className="ml-auto size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="right" className="w-44">
                  {canCreateTeam(ws.permissions) && (
                    <DropdownMenuItem onSelect={() => setCreateTeamOpen(true)} data-testid="sidebar-add-team">
                      <Users /> Team
                    </DropdownMenuItem>
                  )}
                  {canCreateBoard(ws.permissions) && (
                    <DropdownMenuItem onSelect={() => setCreateBoardOpen(true)} data-testid="sidebar-add-board">
                      <LayoutGrid /> Board
                    </DropdownMenuItem>
                  )}
                  {canEditTrackers(ws.permissions) && (
                    <DropdownMenuItem
                      onSelect={() => {
                        setCreateTrackerTeamId(null);
                        setCreateTrackerOpen(true);
                      }}
                      data-testid="sidebar-add-tracker"
                    >
                      <FileSpreadsheet /> Tracker
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border/70 p-2">
        <ul className="space-y-1">
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
        </ul>
        <div className="mt-1">
          <UserMenu collapsed={collapsed} />
        </div>
      </div>

      <CreateBoardDialog
        open={createBoardOpen}
        onOpenChange={(open) => {
          setCreateBoardOpen(open);
          if (!open) setCreateBoardTeamId(null);
        }}
        defaultTeamId={createBoardTeamId}
      />
      <CreateTrackerDialog open={createTrackerOpen} onOpenChange={setCreateTrackerOpen} defaultTeamId={createTrackerTeamId} />
      <ConfirmDialog
        open={deletingTracker !== null}
        onOpenChange={(open) => !open && setDeletingTracker(null)}
        title={`Delete “${deletingTracker?.name}”?`}
        description="This permanently deletes the tracker and every sheet in it. Export it first if you want a copy."
        confirmLabel="Delete tracker"
        destructive
        onConfirm={async () => {
          if (deletingTracker) await trackerMutations.remove.mutateAsync(deletingTracker.id);
        }}
      />
      <CreateTeamDialog open={createTeamOpen} onOpenChange={setCreateTeamOpen} />
      <CreateTeamDialog open={editingTeam !== null} onOpenChange={(open) => !open && setEditingTeam(null)} team={editingTeam} />
      <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {settingsBoard && boardSettings && (
        <BoardSettingsDialog
          board={settingsBoard}
          section={boardSettings.section}
          onSectionChange={(section) => setBoardSettings(section ? { board: settingsBoard, section } : null)}
          onRequestDelete={() => {
            setBoardSettings(null);
            setDeletingBoard(settingsBoard);
          }}
        />
      )}
      {deletingBoard && <SidebarDeleteBoard board={deletingBoard} onClose={() => setDeletingBoard(null)} />}
      <ConfirmDialog
        open={archivingTeam !== null}
        onOpenChange={(open) => !open && setArchivingTeam(null)}
        title={`Archive ${archivingTeam?.name ?? "team"}?`}
        description="The team is hidden from the sidebar. Its boards stay available and can be reassigned. You can restore it from Settings → Teams."
        confirmLabel="Archive team"
        onConfirm={async () => {
          if (archivingTeam) await archiveTeam.mutateAsync(archivingTeam);
        }}
      />
    </aside>
    </SidebarActionsContext.Provider>
  );
}

/** Owns the delete flow for a board chosen from a sidebar row. */
function SidebarDeleteBoard({ board, onClose }: { board: Board; onClose: () => void }) {
  const actions = useBoardActions(board);
  return <DeleteBoardDialog board={board} open onOpenChange={(open) => !open && onClose()} onConfirm={() => actions.deleteBoard.mutateAsync().then(() => undefined)} />;
}

/** Context/hover menu actions for a board row. */
function useBoardRowActions(board: Board): MenuAction[] {
  const ws = useWorkspace();
  const router = useRouter();
  const actions = useBoardActions(board);
  const sidebar = useSidebarActions();
  const manage = canManageBoard(ws.permissions, board);
  const favourite = ws.isFavourite(board.id);
  const teams = ws.teams.filter((t) => t.archivedAt === null);

  const list: MenuAction[] = [
    { type: "item", label: "Open", icon: <LayoutGrid />, onSelect: () => router.push(ws.boardPath(board)) },
    { type: "item", label: "Open as Kanban", icon: <Kanban />, onSelect: () => router.push(ws.boardPath(board, { view: "kanban" })) },
    { type: "item", label: favourite ? "Remove from favourites" : "Add to favourites", icon: <Star />, onSelect: () => actions.toggleFavourite.mutate(!favourite) },
    { type: "separator" },
    { type: "item", label: "Board settings", icon: <Settings2 />, onSelect: () => sidebar.openBoardSettings(board, "general") },
    { type: "item", label: "Manage members", icon: <Users />, onSelect: () => sidebar.openBoardSettings(board, "members") },
    {
      type: "sub",
      label: "Move to team",
      icon: <ArrowRight />,
      disabled: !manage,
      items: [
        { type: "item", label: "No team", disabled: board.teamId === null, onSelect: () => actions.updateBoard.mutate({ teamId: null }) },
        { type: "separator" },
        ...teams.map<MenuAction>((t) => ({
          type: "item",
          label: t.name,
          icon: <DynamicIcon name={t.icon} className={colorClasses(t.color).text} />,
          disabled: t.id === board.teamId,
          onSelect: () => actions.updateBoard.mutate({ teamId: t.id }),
        })),
      ],
    },
    { type: "item", label: "Duplicate board", icon: <Copy />, onSelect: () => actions.duplicateBoard.mutate() },
  ];
  if (manage) {
    list.push({ type: "separator" });
    list.push(
      board.archivedAt
        ? { type: "item", label: "Restore board", icon: <ArchiveRestore />, onSelect: () => actions.restoreBoard.mutate() }
        : { type: "item", label: "Archive board", icon: <Archive />, onSelect: () => actions.archiveBoard.mutate() },
    );
  }
  if (canDeleteBoard(ws.permissions, board)) {
    list.push({ type: "item", label: "Delete board", icon: <Trash2 />, destructive: true, onSelect: () => sidebar.requestDeleteBoard(board) });
  }
  return list;
}

const subtleButtonClasses =
  "flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";

function navItemClasses(active: boolean): string {
  return cn(
    "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring",
    active ? "bg-sidebar-accent font-semibold text-foreground" : "font-medium text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
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
            <span className="rounded-full bg-primary px-2 py-0.5 text-2xs font-semibold text-white tabular">{badge}</span>
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
        className="label-quiet flex h-8 w-full items-center gap-2 rounded-xl px-2.5 transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
      >
        <Icon className="size-3.5" />
        <span className="flex-1 text-left">{title}</span>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {expanded && <ul className="mt-0.5 space-y-0.5">{children}</ul>}
    </div>
  );
}

function BoardLink({
  board,
  href,
  active,
  collapsed,
  nested,
  archived,
}: {
  board: Board;
  href: string;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  archived?: boolean;
}) {
  const actions = useBoardRowActions(board);
  const link = (
      <SimpleTooltip label={archived ? `${board.name} (archived)` : board.name} side="right" disabled={!collapsed}>
        <Link
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            navItemClasses(active),
            "h-8 font-normal",
            collapsed ? "justify-center px-0" : "pr-7",
            nested && !collapsed && "pl-2",
            archived && "text-muted-foreground italic",
          )}
        >
          {archived ? (
            <Archive className="size-3.5 shrink-0 text-muted-foreground/60" />
          ) : (
            <LayoutGrid className={cn("size-3.5 shrink-0", active ? "text-foreground" : "text-muted-foreground/70")} />
          )}
          {!collapsed && <span className="truncate">{board.name}</span>}
        </Link>
      </SimpleTooltip>
  );
  return (
    <li>
      {collapsed ? (
        link
      ) : (
        <RowMenu label={`Options for ${board.name}`} actions={actions}>
          {link}
        </RowMenu>
      )}
    </li>
  );
}

/** Collapsed-by-default folder listing archived boards; they open read-only with a Restore action. */
function ArchivedFolder({ boards, activeBoardSlug }: { boards: Board[]; activeBoardSlug: string | null | undefined }) {
  const ws = useWorkspace();
  const containsActive = boards.some((b) => b.slug === activeBoardSlug);
  const [open, setOpen] = React.useState(false);
  const expanded = open || containsActive;
  if (boards.length === 0) return null;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className="flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
        data-testid="archived-folder"
      >
        {expanded ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
        <Archive className="size-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Archived</span>
        <span className="text-2xs tabular">{boards.length}</span>
      </button>
      {expanded && (
        <ul className="mt-1 ml-[17px] space-y-1 border-l border-sidebar-border/70 pl-2.5">
          {boards.map((board) => (
            <BoardLink key={board.id} board={board} href={ws.boardPath(board)} active={activeBoardSlug === board.slug} collapsed={false} nested archived />
          ))}
        </ul>
      )}
    </li>
  );
}

function TeamNode({
  team,
  boards,
  trackers,
  archivedBoards,
  collapsed,
  activeBoardSlug,
  activeTrackerId,
  activeTeam,
  searchView,
}: {
  team: Team;
  boards: Board[];
  trackers: Tracker[];
  archivedBoards: Board[];
  collapsed: boolean;
  activeBoardSlug: string | null | undefined;
  activeTrackerId: string | null | undefined;
  activeTeam: boolean;
  searchView: string | null;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const sidebar = useSidebarActions();
  const expandedIds = useUiStore((s) => s.expandedTeamIds);
  const toggleTeam = useUiStore((s) => s.toggleTeam);
  const containsActive = boards.some((b) => b.slug === activeBoardSlug) || archivedBoards.some((b) => b.slug === activeBoardSlug) || trackers.some((t) => t.id === activeTrackerId);
  const expanded = expandedIds.includes(team.id) || containsActive;
  const colors = colorClasses(team.color);
  const manage = canManageTeam(ws.permissions, team.id);

  const teamActions: MenuAction[] = [
    { type: "item", label: "Open team", icon: <Users />, onSelect: () => router.push(routes.team(ws.slug, team.id)) },
    ...(canCreateBoard(ws.permissions) || canEditTrackers(ws.permissions)
      ? [
          {
            type: "sub",
            label: "Add new",
            icon: <Plus />,
            items: [
              ...(canCreateBoard(ws.permissions) ? [{ type: "item", label: "Board", icon: <LayoutGrid />, onSelect: () => sidebar.newBoardInTeam(team.id) } satisfies MenuAction] : []),
              ...(canEditTrackers(ws.permissions) ? [{ type: "item", label: "Tracker", icon: <FileSpreadsheet />, onSelect: () => sidebar.newTrackerInTeam(team.id) } satisfies MenuAction] : []),
            ],
          } satisfies MenuAction,
        ]
      : []),
    { type: "separator" },
    { type: "item", label: "Team settings", icon: <Settings2 />, disabled: !manage, onSelect: () => sidebar.editTeam(team) },
    { type: "item", label: expanded ? "Collapse" : "Expand", icon: expanded ? <ChevronRight /> : <ChevronDown />, onSelect: () => toggleTeam(team.id) },
    ...(manage ? [{ type: "separator" } satisfies MenuAction, { type: "item", label: "Archive team", icon: <Archive />, destructive: true, onSelect: () => sidebar.archiveTeam(team) } satisfies MenuAction] : []),
  ];

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
      <RowMenu label={`Options for ${team.name}`} actions={teamActions}>
      <div className={cn("flex h-9 items-center rounded-xl pr-1 transition-colors", activeTeam ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70")}>
        <button
          type="button"
          onClick={() => toggleTeam(team.id)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${team.name}`}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <Link href={routes.team(ws.slug, team.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-[13px] font-medium">
          <DynamicIcon name={team.icon} className={cn("size-3.5 shrink-0", colors.text)} />
          <span className="truncate">{team.name}</span>
        </Link>
        <span className="text-2xs text-muted-foreground tabular transition-opacity group-hover/menu:opacity-0">{boards.length + trackers.length}</span>
      </div>
      </RowMenu>
      {expanded && (
        <ul className="mt-1 ml-[17px] space-y-1 border-l border-sidebar-border/70 pl-2.5">
          {boards.length === 0 && trackers.length === 0 && archivedBoards.length === 0 && <li className="py-1 pl-2 text-2xs text-muted-foreground">No boards or trackers yet</li>}
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
          {trackers.map((tracker) => (
            <TrackerLink key={tracker.id} tracker={tracker} active={activeTrackerId === tracker.id} />
          ))}
          <ArchivedFolder boards={archivedBoards} activeBoardSlug={activeBoardSlug} />
        </ul>
      )}
    </li>
  );
}

/** A team's tracker (in-app spreadsheet), shown beside its boards. */
function TrackerLink({ tracker, active }: { tracker: Tracker; active: boolean }) {
  const ws = useWorkspace();
  const router = useRouter();
  const sidebar = useSidebarActions();
  const href = routes.tracker(ws.slug, tracker.id);
  const actions: MenuAction[] = [
    { type: "item", label: "Open", icon: <FileSpreadsheet />, onSelect: () => router.push(href) },
    ...(canEditTrackers(ws.permissions) ? [{ type: "separator" } satisfies MenuAction, { type: "item", label: "Delete tracker", icon: <Trash2 />, destructive: true, onSelect: () => sidebar.requestDeleteTracker(tracker) } satisfies MenuAction] : []),
  ];
  return (
    <li>
      <RowMenu label={`Options for ${tracker.name}`} actions={actions}>
        <Link href={href} aria-current={active ? "page" : undefined} className={cn(navItemClasses(active), "h-8 pl-2.5 pr-7 font-normal")} data-testid="sidebar-tracker">
          <FileSpreadsheet className={cn("size-3.5 shrink-0", active ? "text-foreground" : "text-muted-foreground/70")} />
          <span className="truncate">{tracker.name}</span>
        </Link>
      </RowMenu>
    </li>
  );
}

/**
 * Thin grab area on the sidebar's edge. Dragging widens the sidebar (the designed
 * width is the minimum); double-click snaps it back.
 */
function SidebarResizeHandle({ onResizing }: { onResizing: (active: boolean) => void }) {
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const start = (event: React.PointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = useUiStore.getState().sidebarWidth;
    onResizing(true);
    const onMove = (e: PointerEvent) => setSidebarWidth(startWidth + (e.clientX - startX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      onResizing(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      title="Drag to resize · double-click to reset"
      onPointerDown={start}
      onDoubleClick={() => setSidebarWidth(SIDEBAR_MIN_WIDTH)}
      className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize transition-colors hover:bg-ring/50 active:bg-ring"
      data-testid="sidebar-resize"
    />
  );
}

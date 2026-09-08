"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import type { Board, BoardFavourite, BoardMember, Team, TeamMember, User, Workspace, WorkspaceMember } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { buildPermissionContext, canSeeSystemEntities, isWorkspaceAdmin, type PermissionContext } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { useUiStore } from "@/stores/ui-store";

export interface WorkspaceContextValue {
  workspace: Workspace;
  slug: string;
  currentUser: User;
  /**
   * The colleague whose view of the workspace is on screen, when an admin has
   * asked for one. What is visible follows their access; anything saved is
   * still saved as `currentUser`, who is the one actually signed in.
   */
  viewingAs: User | null;
  members: WorkspaceMember[];
  /** Everyone with a membership row, including pending and deactivated people, so history always resolves a name. */
  users: User[];
  /** People who can be assigned, mentioned or messaged: onboarded (ACTIVE) and not deactivated. */
  activeUsers: User[];
  teams: Team[];
  teamMembers: TeamMember[];
  boards: Board[];
  boardMembers: BoardMember[];
  favourites: BoardFavourite[];
  permissions: PermissionContext;
  /** What the signed-in person may do, whoever they are reading the workspace as. */
  ownPermissions: PermissionContext;
  userById: (id: string | null | undefined) => User | undefined;
  teamById: (id: string | null | undefined) => Team | undefined;
  boardById: (id: string | null | undefined) => Board | undefined;
  boardsForTeam: (teamId: string) => Board[];
  isFavourite: (boardId: string) => boolean;
  /** Teams the current user belongs to. */
  myTeams: Team[];
  boardPath: (board: Pick<Board, "slug">, options?: Parameters<typeof routes.board>[2]) => string;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export interface WorkspaceProviderProps {
  workspace: Workspace;
  children: React.ReactNode;
}

export function WorkspaceProvider({ workspace, children }: WorkspaceProviderProps) {
  const services = useServices();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();

  const contextQuery = useQuery({
    queryKey: queryKeys.workspaceContext(workspace.id),
    queryFn: () => services.workspace.loadContext(workspace.id),
  });
  const boardsQuery = useQuery({
    queryKey: queryKeys.boards(workspace.id),
    queryFn: () => services.boards.listBoards(workspace.id),
  });
  const boardMembersQuery = useQuery({
    queryKey: queryKeys.boardMembersAll(workspace.id),
    queryFn: () => services.repos.boards.listMembersByWorkspace(workspace.id),
  });
  const favouritesQuery = useQuery({
    queryKey: queryKeys.favourites(currentUser.id),
    queryFn: () => services.repos.boards.listFavourites(currentUser.id),
  });

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(workspace.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.boards(workspace.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.boardMembersAll(workspace.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.favourites(currentUser.id) }),
    ]);
  }, [queryClient, workspace.id, currentUser.id]);

  const ctx = contextQuery.data;
  const allBoards = boardsQuery.data;
  const boardMembers = boardMembersQuery.data;
  const favourites = favouritesQuery.data;

  const viewAsUserId = useUiStore((s) => s.viewAsUserId);
  const value = useMemo<WorkspaceContextValue | null>(() => {
    if (!ctx || !allBoards || !boardMembers || !favourites) return null;
    const own = buildPermissionContext({
      userId: currentUser.id,
      workspaceMembers: ctx.members,
      teamMembers: ctx.teamMembers,
      boardMembers,
    });
    // Only an admin may look through someone else's eyes, and only at someone who
    // is a member here. The data still arrives with the admin's own access; what
    // changes is how much of it the app is willing to show.
    const viewingAs = viewAsUserId && isWorkspaceAdmin(own) ? (ctx.users.find((u) => u.id === viewAsUserId) ?? null) : null;
    const permissions = viewingAs ? buildPermissionContext({ userId: viewingAs.id, workspaceMembers: ctx.members, teamMembers: ctx.teamMembers, boardMembers }) : own;
    // The Admin team and Task Allocation board exist for admins alone. Supabase
    // hides them through RLS; the local store has no such layer, so filter here.
    const admin = canSeeSystemEntities(permissions);
    const teams = admin ? ctx.teams : ctx.teams.filter((t) => !t.system);
    const boards = admin ? allBoards : allBoards.filter((b) => !b.system);
    const usersById = new Map(ctx.users.map((u) => [u.id, u]));
    const activeMemberIds = new Set(ctx.members.filter((m) => m.status === "ACTIVE").map((m) => m.userId));
    const teamsById = new Map(teams.map((t) => [t.id, t]));
    const boardsById = new Map(boards.map((b) => [b.id, b]));
    const favouriteIds = new Set(favourites.map((f) => f.boardId));
    const myTeamIds = new Set(ctx.teamMembers.filter((m) => m.userId === (viewingAs?.id ?? currentUser.id)).map((m) => m.teamId));
    return {
      workspace: ctx.workspace,
      slug: ctx.workspace.slug,
      currentUser,
      viewingAs,
      members: ctx.members,
      users: ctx.users,
      activeUsers: ctx.users.filter((u) => u.deactivatedAt === null && activeMemberIds.has(u.id)),
      teams,
      teamMembers: ctx.teamMembers,
      boards,
      boardMembers,
      favourites,
      permissions,
      ownPermissions: own,
      userById: (id) => (id ? usersById.get(id) : undefined),
      teamById: (id) => (id ? teamsById.get(id) : undefined),
      boardById: (id) => (id ? boardsById.get(id) : undefined),
      boardsForTeam: (teamId) => boards.filter((b) => b.teamId === teamId && b.archivedAt === null),
      isFavourite: (boardId) => favouriteIds.has(boardId),
      myTeams: teams.filter((t) => myTeamIds.has(t.id) && t.archivedAt === null),
      boardPath: (board, options) => routes.board(ctx.workspace.slug, board.slug, options),
      refresh,
    };
  }, [ctx, allBoards, boardMembers, favourites, currentUser, viewAsUserId, refresh]);

  // An admin opening the workspace makes sure its built-in Admin team, Task
  // Allocation board and booking link exist, and that the board carries every
  // column the current build expects (see WorkspaceService.ensureSystemEntities).
  // The check runs once per page load: creating what is missing when nothing is
  // there, and otherwise only the light top-up of columns and the team palette.
  const isAdmin = !!value && canSeeSystemEntities(value.permissions);
  const needsSystemEntities =
    isAdmin && (!value.teams.some((t) => t.system === "ADMIN") || !value.boards.some((b) => b.system === "TASK_ALLOCATION") || !value.workspace.bookingKey);
  const maintained = useRef<string | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    if (maintained.current === workspace.id && !needsSystemEntities) return;
    maintained.current = workspace.id;
    let cancelled = false;
    services.workspace
      .ensureSystemEntities(workspace.id, currentUser.id)
      .then(() => {
        if (!cancelled && needsSystemEntities) void refresh();
      })
      .catch((error) => console.warn("[workspace] could not create the built-in team and board", error));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, needsSystemEntities, services, workspace.id, currentUser.id, refresh]);

  if (contextQuery.isError || boardsQuery.isError) {
    throw contextQuery.error ?? boardsQuery.error;
  }
  if (!value) return null;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Supplies a workspace that has already been assembled rather than loading one.
 * The shared-board page builds its own from the payload behind the link: one
 * board, the people on it, and no rights to anything.
 */
export function WorkspaceContextProvider({ value, children }: { value: WorkspaceContextValue; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

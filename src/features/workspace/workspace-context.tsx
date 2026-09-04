"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo } from "react";
import type { Board, BoardFavourite, BoardMember, Team, TeamMember, User, Workspace, WorkspaceMember } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { buildPermissionContext, type PermissionContext } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

export interface WorkspaceContextValue {
  workspace: Workspace;
  slug: string;
  currentUser: User;
  members: WorkspaceMember[];
  users: User[];
  teams: Team[];
  teamMembers: TeamMember[];
  boards: Board[];
  boardMembers: BoardMember[];
  favourites: BoardFavourite[];
  permissions: PermissionContext;
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
  const boards = boardsQuery.data;
  const boardMembers = boardMembersQuery.data;
  const favourites = favouritesQuery.data;

  const value = useMemo<WorkspaceContextValue | null>(() => {
    if (!ctx || !boards || !boardMembers || !favourites) return null;
    const usersById = new Map(ctx.users.map((u) => [u.id, u]));
    const teamsById = new Map(ctx.teams.map((t) => [t.id, t]));
    const boardsById = new Map(boards.map((b) => [b.id, b]));
    const favouriteIds = new Set(favourites.map((f) => f.boardId));
    const myTeamIds = new Set(ctx.teamMembers.filter((m) => m.userId === currentUser.id).map((m) => m.teamId));
    return {
      workspace: ctx.workspace,
      slug: ctx.workspace.slug,
      currentUser,
      members: ctx.members,
      users: ctx.users,
      teams: ctx.teams,
      teamMembers: ctx.teamMembers,
      boards,
      boardMembers,
      favourites,
      permissions: buildPermissionContext({
        userId: currentUser.id,
        workspaceMembers: ctx.members,
        teamMembers: ctx.teamMembers,
        boardMembers,
      }),
      userById: (id) => (id ? usersById.get(id) : undefined),
      teamById: (id) => (id ? teamsById.get(id) : undefined),
      boardById: (id) => (id ? boardsById.get(id) : undefined),
      boardsForTeam: (teamId) => boards.filter((b) => b.teamId === teamId && b.archivedAt === null),
      isFavourite: (boardId) => favouriteIds.has(boardId),
      myTeams: ctx.teams.filter((t) => myTeamIds.has(t.id) && t.archivedAt === null),
      boardPath: (board, options) => routes.board(ctx.workspace.slug, board.slug, options),
      refresh,
    };
  }, [ctx, boards, boardMembers, favourites, currentUser, refresh]);

  if (contextQuery.isError || boardsQuery.isError) {
    throw contextQuery.error ?? boardsQuery.error;
  }
  if (!value) return null;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

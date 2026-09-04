"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Board, BoardFavourite, BoardRole } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { newId, nowIso } from "@/lib/ids";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

/** Board-level actions (rename, favourite, archive, delete, duplicate, members). */
export function useBoardActions(board: Board) {
  const services = useServices();
  const queryClient = useQueryClient();
  const ws = useWorkspace();
  const user = useCurrentUser();
  const router = useRouter();
  const boardsKey = queryKeys.boards(ws.workspace.id);

  const invalidateBoards = async () => {
    await queryClient.invalidateQueries({ queryKey: boardsKey });
    await queryClient.invalidateQueries({ queryKey: queryKeys.boardSnapshot(board.id) });
  };

  const updateBoard = useMutation({
    mutationFn: (patch: Partial<Pick<Board, "name" | "description" | "teamId" | "visibility" | "color" | "icon">>) =>
      services.boards.updateBoard(board.id, patch, user.id),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: boardsKey });
      const previous = queryClient.getQueryData<Board[]>(boardsKey);
      queryClient.setQueryData<Board[]>(boardsKey, (old) => old?.map((b) => (b.id === board.id ? { ...b, ...patch } : b)));
      return { previous };
    },
    onError: (error, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(boardsKey, ctx.previous);
      toast.error(error instanceof Error ? error.message : "Could not update the board");
    },
    onSuccess: (updated, patch) => {
      if (patch.name !== undefined && updated.slug !== board.slug) router.replace(ws.boardPath(updated));
      if (patch.name === undefined && patch.description === undefined) toast.success("Changes saved");
    },
    onSettled: invalidateBoards,
  });

  const toggleFavourite = useMutation({
    mutationFn: (next: boolean) => services.boards.setFavourite(board.id, user.id, next),
    onMutate: async (next) => {
      const key = queryKeys.favourites(user.id);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<BoardFavourite[]>(key);
      queryClient.setQueryData<BoardFavourite[]>(key, (old = []) =>
        next ? [...old, { id: newId(), boardId: board.id, userId: user.id, createdAt: nowIso() }] : old.filter((f) => f.boardId !== board.id),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.favourites(user.id), ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.favourites(user.id) }),
  });

  const archiveBoard = useMutation({
    mutationFn: () => services.boards.archiveBoard(board.id, user.id),
    onSuccess: async () => {
      await invalidateBoards();
      toast.success(`“${board.name}” archived`, {
        action: { label: "Undo", onClick: () => void services.boards.restoreBoard(board.id).then(invalidateBoards) },
      });
      router.push(routes.workspace(ws.slug));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not archive the board"),
  });

  const restoreBoard = useMutation({
    mutationFn: () => services.boards.restoreBoard(board.id),
    onSuccess: async () => {
      await invalidateBoards();
      toast.success("Board restored");
    },
  });

  const deleteBoard = useMutation({
    mutationFn: () => services.boards.deleteBoard(board.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardsKey });
      queryClient.removeQueries({ queryKey: queryKeys.boardSnapshot(board.id) });
      toast.success(`“${board.name}” deleted`);
      router.push(routes.workspace(ws.slug));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete the board"),
  });

  const duplicateBoard = useMutation({
    mutationFn: () => services.boards.duplicateBoard(board.id, user.id),
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: boardsKey });
      await queryClient.invalidateQueries({ queryKey: queryKeys.boardMembersAll(ws.workspace.id) });
      toast.success("Board duplicated");
      router.push(ws.boardPath(copy));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not duplicate the board"),
  });

  const setMember = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) =>
      services.boards.setMember(board.id, userId, role, user.id, ws.userById(userId)?.displayName ?? "member"),
    onSuccess: async (_r, { userId }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.boardMembersAll(ws.workspace.id) });
      toast.success(`${ws.userById(userId)?.firstName ?? "Member"} added`);
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => services.boards.removeMember(board.id, userId, user.id, ws.userById(userId)?.displayName ?? "member"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.boardMembersAll(ws.workspace.id) }),
  });

  return { updateBoard, toggleFavourite, archiveBoard, restoreBoard, deleteBoard, duplicateBoard, setMember, removeMember };
}

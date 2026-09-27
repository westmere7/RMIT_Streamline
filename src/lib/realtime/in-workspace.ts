"use client";

import { useEffect, useMemo, useRef } from "react";
import { useWorkspaceOptional } from "@/features/workspace/workspace-context";

/**
 * Checks for `RealtimeBinding.accept`: whether a row that arrived unfiltered
 * belongs to the workspace on screen. A table keyed by board cannot be
 * filtered on the wire to "any of this workspace's boards", and with several
 * workspaces every write in another one used to refetch this one's pages.
 *
 * Read through a ref, so a board added a moment ago counts at once. Outside a
 * workspace (a public page) every row is let through, as before.
 */
export function useWorkspaceRowChecks() {
  const ws = useWorkspaceOptional();
  const boardIds = useMemo(() => (ws ? new Set(ws.boards.map((b) => b.id)) : null), [ws]);
  const workspaceId = ws?.workspace.id ?? null;
  const state = useRef({ boardIds, workspaceId });
  useEffect(() => {
    state.current = { boardIds, workspaceId };
  }, [boardIds, workspaceId]);
  return useMemo(
    () => ({
      /** A row naming a board: one of this workspace's. */
      onBoard: (row: Record<string, unknown>) => {
        const ids = state.current.boardIds;
        return !ids || typeof row.board_id !== "string" || ids.has(row.board_id);
      },
      /** A row naming a workspace: this one. */
      inWorkspace: (row: Record<string, unknown>) => {
        const id = state.current.workspaceId;
        return !id || typeof row.workspace_id !== "string" || row.workspace_id === id;
      },
    }),
    [],
  );
}

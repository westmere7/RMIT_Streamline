"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { InviteMemberInput, WorkspaceInvitation } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageMembers } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { routes } from "@/lib/routes";

/** The full URL an invited person opens. Built in the browser so it matches wherever the app is served from. */
export function invitationUrl(invitation: Pick<WorkspaceInvitation, "token">): string {
  const path = routes.join(invitation.token);
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

/** Live invitation per pending member. Only admins can read these, so the query is off for everyone else. */
export function useLiveInvitations() {
  const ws = useWorkspace();
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.workspaceInvitations(ws.workspace.id),
    queryFn: () => services.workspace.listLiveInvitations(ws.workspace.id),
    enabled: canManageMembers(ws.permissions),
    staleTime: 10_000,
  });
}

export function useMemberMutations() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();

  const settle = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvitations(ws.workspace.id) }),
    ]);
    publishDataChange({ kinds: ["workspace"] });
  };

  const invite = useMutation({
    mutationFn: (input: Omit<InviteMemberInput, "workspaceId" | "invitedBy">) =>
      services.workspace.inviteMember({ ...input, workspaceId: ws.workspace.id, invitedBy: ws.currentUser.id }),
    onSuccess: settle,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add the member"),
  });

  const regenerate = useMutation({
    mutationFn: (userId: string) => services.workspace.regenerateInvitation(ws.workspace.id, userId),
    onSuccess: settle,
    onError: (error) => toast.error("Could not create a new link", { description: error instanceof Error ? error.message : undefined }),
  });

  const reinitiate = useMutation({
    mutationFn: (userId: string) => services.workspace.reinitiateMember(ws.workspace.id, userId, ws.currentUser.id),
    onSuccess: settle,
    onError: (error) => toast.error("Could not restart onboarding", { description: error instanceof Error ? error.message : undefined }),
  });

  const cancel = useMutation({
    mutationFn: (userId: string) => services.workspace.cancelInvitation(ws.workspace.id, userId),
    onSuccess: settle,
    onError: (error) => toast.error("Could not cancel the invitation", { description: error instanceof Error ? error.message : undefined }),
  });

  return { invite, regenerate, reinitiate, cancel };
}

/** Copies text and tells the user; falls back to a prompt when the clipboard is unavailable (http, old browsers). */
export async function copyToClipboard(text: string, label = "Link copied"): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
    return true;
  } catch {
    toast.error("Could not copy automatically. Select the link and copy it by hand.");
    return false;
  }
}

/** A workspace somebody belongs to, as the Members page names it. */
export interface PoolWorkspace {
  id: string;
  name: string;
}

/**
 * Everyone in the app, not only this workspace: people are one pool, and a
 * workspace is who of them has access to it. `people` is everybody active in
 * some workspace; `workspacesOf` is, per person, the workspaces they are in —
 * of the ones the reader can see themselves (an Owner sees every one, an admin
 * the ones they share), so the list names no workspace the reader cannot open.
 */
export function usePeoplePool() {
  const ws = useWorkspace();
  const services = useServices();
  return useQuery({
    queryKey: ["people-pool", ws.workspace.id, ws.currentUser.id],
    queryFn: async () => {
      const [directory, users, mine] = await Promise.all([
        services.repos.workspaces.listDirectory(),
        services.repos.users.list(),
        services.workspace.listWorkspacesForUser(ws.currentUser.id),
      ]);
      const seats = await Promise.all(mine.map(async (workspace) => ({ workspace, members: await services.repos.workspaces.listMembers(workspace.id) })));
      const workspacesOf = new Map<string, PoolWorkspace[]>();
      for (const { workspace, members } of seats) {
        for (const member of members) {
          if (member.status !== "ACTIVE") continue;
          const list = workspacesOf.get(member.userId) ?? [];
          list.push({ id: workspace.id, name: workspace.name });
          workspacesOf.set(member.userId, list);
        }
      }
      const inPool = new Set(directory);
      return { people: users.filter((u) => inPool.has(u.id) && u.deactivatedAt === null), workspacesOf };
    },
    staleTime: 30_000,
  });
}

/** Gives somebody from the pool access to this workspace: one account, a seat here with its own role. */
export function useAddToWorkspace() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; role: "ADMIN" | "MEMBER" | "GUEST"; teamIds: string[] }) => services.workspace.addExistingMember({ workspaceId: ws.workspace.id, ...input }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) }),
        queryClient.invalidateQueries({ queryKey: ["people-pool"] }),
      ]);
      publishDataChange({ kinds: ["workspace"] });
    },
    onError: (error) => toast.error("Could not add them", { description: error instanceof Error ? error.message : undefined }),
  });
}

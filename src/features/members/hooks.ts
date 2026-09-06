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
    mutationFn: (userId: string) => services.workspace.reinitiateMember(ws.workspace.id, userId),
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

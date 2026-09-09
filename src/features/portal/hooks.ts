"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { PortalPresentation, PortalTheme } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";

/**
 * The management side of the portal.
 *
 * These run in the browser against the ordinary repositories, so the policies in
 * policies/0013 are what actually decide whether the write lands — an ordinary
 * member calling this gets a refusal from the database, not from a hidden
 * button. The screen hides the controls as well, but that is courtesy rather
 * than the enforcement.
 */
export function portalKeys(workspaceId: string) {
  return ["portals", workspaceId] as const;
}

export function usePortalOverview() {
  const ws = useWorkspace();
  const services = useServices();
  return useQuery({
    queryKey: portalKeys(ws.workspace.id),
    queryFn: () => services.portals.overview(ws.workspace.id),
    staleTime: 10_000,
  });
}

export function usePortalMutations() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: portalKeys(ws.workspace.id) });

  const setEnabled = useMutation({
    mutationFn: ({ departmentId, enabled }: { departmentId: string; enabled: boolean }) => services.portals.setEnabled(ws.workspace.id, departmentId, enabled),
    onSuccess: async (_portal, { enabled }) => {
      await invalidate();
      toast.success(enabled ? "Portal is open" : "Portal is closed");
    },
  });

  // One mutation for every presentation setting: they are all the same write,
  // and a card that saved each through its own hook would show six spinners.
  const setPresentation = useMutation({
    mutationFn: ({ departmentId, patch }: { departmentId: string; patch: PortalPresentation }) => services.portals.setPresentation(ws.workspace.id, departmentId, patch),
    onSuccess: invalidate,
  });

  const setTheme = useMutation({
    mutationFn: ({ departmentId, theme }: { departmentId: string; theme: PortalTheme }) => services.portals.setTheme(ws.workspace.id, departmentId, theme),
    onSuccess: invalidate,
  });

  const regenerate = useMutation({
    mutationFn: (departmentId: string) => services.portals.regenerateLink(ws.workspace.id, departmentId),
    onSuccess: async () => {
      await invalidate();
      toast.success("New link issued. The old one has stopped working.");
    },
  });

  const setPassword = useMutation({
    mutationFn: ({ departmentId, password }: { departmentId: string; password: string | null }) => services.portals.setPassword(ws.workspace.id, departmentId, password),
    onSuccess: async (_portal, { password }) => {
      await invalidate();
      toast.success(password ? "Password set. Anyone already inside will be asked for it." : "Password removed");
    },
  });

  const setTeamName = useMutation({
    mutationFn: (creativeTeamName: string) => services.repos.workspaces.update(ws.workspace.id, { creativeTeamName: creativeTeamName.trim() || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      toast.success("Saved");
    },
  });

  return { setEnabled, setTheme, setPresentation, regenerate, setPassword, setTeamName };
}

/** The address to hand a department. Absolute, because it is going into an email. */
export function portalUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${routes.portal(token)}`;
}

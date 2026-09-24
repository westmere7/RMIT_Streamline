"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";
import type { PortalPresentation } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
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

/**
 * The portal card: the link, its settings, and how many requests each
 * stakeholder group has sent.
 *
 * Live because the count is the part that moves on its own — a stakeholder
 * booking a job is the one thing here that happens without anyone in the
 * workspace doing it, and an admin watching the page should see it arrive.
 */
export function usePortalOverview() {
  const ws = useWorkspace();
  const services = useServices();
  const workspaceId = ws.workspace.id;
  const bindings = useMemo<RealtimeBinding[]>(() => {
    const keys = [portalKeys(workspaceId)];
    return [
      { table: "department_portals", filter: `workspace_id=eq.${workspaceId}`, keys },
      { table: "stakeholder_departments", filter: `workspace_id=eq.${workspaceId}`, keys },
      { table: "portal_requests", filter: `workspace_id=eq.${workspaceId}`, keys },
    ];
  }, [workspaceId]);
  useRealtime(`portal:${workspaceId}`, bindings);
  return useQuery({
    queryKey: portalKeys(workspaceId),
    queryFn: () => services.portals.overview(workspaceId),
    staleTime: 10_000,
  });
}

export function usePortalMutations() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const invalidate = () => {
    publishDataChange({ kinds: ["settings"] });
    return queryClient.invalidateQueries({ queryKey: portalKeys(ws.workspace.id) });
  };

  const setEnabled = useMutation({
    mutationFn: (enabled: boolean) => services.portals.setEnabled(ws.workspace.id, enabled),
    onSuccess: async (_portal, enabled) => {
      await invalidate();
      toast.success(enabled ? "Portal is open" : "Portal is closed");
    },
  });

  // One mutation for every presentation setting: they are all the same write,
  // and a card that saved each through its own hook would show six spinners.
  const setPresentation = useMutation({
    mutationFn: (patch: PortalPresentation) => services.portals.setPresentation(ws.workspace.id, patch),
    onSuccess: invalidate,
  });

  /**
   * A settings panel's Save: everything that changed, in one go.
   *
   * The team's name lives on the workspace rather than the portal, so it is a
   * second write, made only when it changed.
   */
  const saveSettings = useMutation({
    mutationFn: async ({ patch, teamName }: { patch: PortalPresentation; teamName?: string }) => {
      if (Object.keys(patch).length > 0) await services.portals.setPresentation(ws.workspace.id, patch);
      if (teamName !== undefined) await services.repos.workspaces.update(ws.workspace.id, { creativeTeamName: teamName.trim() || null });
    },
    onSuccess: async (_result, { teamName }) => {
      await (teamName !== undefined ? queryClient.invalidateQueries() : invalidate());
      if (teamName !== undefined) publishDataChange({ kinds: ["settings"] });
      toast.success("Settings saved");
    },
  });

  const regenerate = useMutation({
    mutationFn: () => services.portals.regenerateLink(ws.workspace.id),
    onSuccess: async () => {
      await invalidate();
      toast.success("New link issued. The old one has stopped working.");
    },
  });

  const setPassword = useMutation({
    mutationFn: ({ password }: { password: string | null }) => services.portals.setPassword(ws.workspace.id, password),
    onSuccess: async (_portal, { password }) => {
      await invalidate();
      toast.success(password ? "Password set. Anyone already inside will be asked for it." : "Password removed");
    },
  });

  return { setEnabled, setPresentation, saveSettings, regenerate, setPassword };
}

/** The address to hand out. Absolute, because it is going into an email. */
export function portalUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${routes.portal(token)}`;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { useServices } from "@/features/data/data-context";
import { useWaitingWorkspaces } from "@/features/workspace/waiting-screen";
import { pickWorkspace } from "@/features/workspace/workspaces";
import { routes } from "@/lib/routes";

/**
 * Entry point: sends the person to their workspace or to sign in. While it
 * decides it shows the loading screen, not the sign-in frame: a saved session
 * goes from that straight into the workspace, with no sign-in form on the way.
 */
export default function RootPage() {
  const router = useRouter();
  const { status, user } = useAuth();
  const services = useServices();

  const workspaces = useQuery({
    queryKey: ["user-workspaces", user?.id],
    queryFn: () => services.workspace.listWorkspacesForUser(user!.id),
    enabled: !!user,
  });

  // Nowhere to go yet may mean waiting to be let in somewhere (joined through
  // a join link): that workspace's page says so, and opens once approved.
  const none = !!workspaces.data && !pickWorkspace(workspaces.data);
  const waiting = useWaitingWorkspaces(none);

  useEffect(() => {
    if (status === "signed-out") router.replace(routes.login());
    else if (status === "signed-in" && workspaces.data) {
      const first = pickWorkspace(workspaces.data);
      if (first) router.replace(routes.workspace(first.slug));
      else if (waiting.data) router.replace(waiting.data[0] ? routes.workspace(waiting.data[0].slug) : routes.login());
    }
  }, [status, workspaces.data, waiting.data, router]);

  const destination = workspaces.data ? pickWorkspace(workspaces.data) : null;
  return <FullPageLoader label={status === "signed-in" ? (destination ? `Opening ${destination.name}…` : "Opening workspace…") : "Checking your session…"} />;
}

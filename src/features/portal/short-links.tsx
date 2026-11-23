"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useServices } from "@/features/data/data-context";
import { PortalPage } from "@/features/portal/portal-page";
import { PortalShell } from "@/features/portal/portal-shell";
import { routes } from "@/lib/routes";

/**
 * A workspace's portal, or its booking form, at the short address:
 * /<workspace>/portal and /<workspace>/booking. No key in the link; the page
 * finds the workspace's portal and opens it as the token link always did, so
 * the open and booking switches, the password and every setting still decide
 * what the visitor gets.
 */
export function WorkspacePortalPage({ workspaceSlug, startOnBooking = false }: { workspaceSlug: string; startOnBooking?: boolean }) {
  const services = useServices();
  const link = useQuery({
    queryKey: ["portal-link", workspaceSlug],
    queryFn: () => services.portals.publicTokenForWorkspace(workspaceSlug),
    retry: false,
    staleTime: 60_000,
  });
  if (link.isPending) return <Waiting />;
  // No such workspace, or one with no portal: the same closed page an unknown link gets.
  return <PortalPage token={link.data ?? ""} startOnBooking={startOnBooking} workspaceSlug={workspaceSlug} />;
}

/**
 * An old token link (/portal/<token>, /portal/<token>/book): sent on to the
 * short address, with whatever it asked for (a request, a department, a
 * period). Only the current link moves; one that was replaced keeps its
 * "replaced" page, as it did.
 */
export function LegacyPortalLink({ token, startOnBooking = false }: { token: string; startOnBooking?: boolean }) {
  const services = useServices();
  const router = useRouter();
  const where = useQuery({
    queryKey: ["portal-where", token],
    queryFn: () => services.portals.publicWorkspaceForToken(token),
    retry: false,
    staleTime: 60_000,
  });
  const workspace = where.data ?? null;
  React.useEffect(() => {
    if (!workspace) return;
    const path = startOnBooking ? routes.workspaceBooking(workspace) : routes.workspacePortal(workspace);
    router.replace(`${path}${window.location.search}`);
  }, [workspace, startOnBooking, router]);
  if (where.isPending || workspace) return <Waiting />;
  return <PortalPage token={token} startOnBooking={startOnBooking} />;
}

function Waiting() {
  return (
    <PortalShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-10" data-testid="portal-short-link-waiting">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    </PortalShell>
  );
}

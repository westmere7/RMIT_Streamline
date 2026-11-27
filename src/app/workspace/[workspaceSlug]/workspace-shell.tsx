"use client";

import { useQuery } from "@tanstack/react-query";
import { LeaveIntakeConfirm } from "@/features/booking/leave-intake-confirm";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { ErrorState } from "@/components/shared/error-state";
import { PersonCardProvider } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { renderPersonCard } from "@/features/members/person-card";
import { WaitingScreen, useWaitingWorkspaces } from "@/features/workspace/waiting-screen";
import { WorkspaceProvider } from "@/features/workspace/workspace-context";
import { rememberWorkspace } from "@/features/workspace/workspaces";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ workspaceSlug: string }>();
  const slug = params.workspaceSlug;
  const router = useRouter();
  const { status, user, signOut } = useAuth();
  const services = useServices();

  useEffect(() => {
    if (status === "signed-out") router.replace(routes.login());
  }, [status, router]);

  const workspaceQuery = useQuery({
    queryKey: queryKeys.workspace(slug),
    // The gate needs the workspace and its id; the keys come with the context
    // (loadContext), so asking for them here was a round trip on every load.
    queryFn: () => services.workspace.getWorkspaceBySlug(slug, { keys: false }),
    enabled: status === "signed-in",
    // Whether this person may open it can change at any moment (approved,
    // added, deactivated): always asked again, never answered from before.
    staleTime: 0,
  });
  // This person's own seats, asked alongside the workspace rather than after it
  // (every seat in the workspace, read to find one, was a round trip of its own
  // on every page load). Under "workspace-members", so a change to any seat
  // still asks again.
  const seatsQuery = useQuery({
    queryKey: ["workspace-members", "self", user?.id],
    queryFn: () => services.repos.workspaces.listMembershipsForUser(user!.id),
    enabled: status === "signed-in" && !!user,
    staleTime: 0,
  });
  const membershipQuery = {
    // Undefined until both are in; null when they hold no seat here.
    data: workspaceQuery.data && seatsQuery.data ? (seatsQuery.data.find((m) => m.workspaceId === workspaceQuery.data!.id) ?? null) : undefined,
    isLoading: seatsQuery.isLoading,
    isFetching: seatsQuery.isFetching,
  };

  // The workspace to come back to next time: this one, once it has let them in.
  const admitted = membershipQuery.data?.status === "ACTIVE";
  // Someone who joined through the join link and is not let in yet can read
  // nothing here, the workspace included; this says whether that is why.
  const shut = workspaceQuery.data === null || (!!membershipQuery.data && membershipQuery.data.status !== "ACTIVE") || membershipQuery.data === null;
  const waiting = useWaitingWorkspaces(status === "signed-in" && shut);
  const waitingHere = waiting.data?.find((w) => w.slug === slug) ?? null;
  // Waiting here a moment ago and not any more: let in (or turned away). Load
  // the page afresh, so nothing read while they were shut out (the workspace,
  // their seat, the live channels) answers for them now. Done here, not in the
  // waiting screen, which is gone by the render that learns it.
  const wasWaiting = useRef(false);
  useEffect(() => {
    if (waitingHere) wasWaiting.current = true;
    else if (wasWaiting.current && waiting.data) window.location.reload();
  }, [waitingHere, waiting.data]);
  useEffect(() => {
    if (admitted) rememberWorkspace(slug);
  }, [admitted, slug]);

  if (status === "loading" || status === "signed-out" || !user) return <FullPageLoader label="Checking your session…" />;
  if (workspaceQuery.isLoading) return <FullPageLoader label="Opening workspace…" />;
  if (workspaceQuery.isError) return <ErrorState title="Could not load this workspace." error={workspaceQuery.error} onRetry={() => workspaceQuery.refetch()} />;

  if (shut && waiting.isLoading) return <FullPageLoader label="Opening workspace…" />;
  if (waitingHere) return <WaitingScreen workspaceName={waitingHere.name} workspaceId={waitingHere.workspaceId} />;
  // A "no" read earlier is being asked again: wait for the answer rather than show the old one.
  if (shut && (workspaceQuery.isFetching || membershipQuery.isFetching)) return <FullPageLoader label="Opening workspace…" />;

  const workspace = workspaceQuery.data;
  if (!workspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-center">
        <p className="text-base font-semibold">Workspace not found</p>
        <p className="text-[13px] text-muted-foreground">There is no workspace at /workspace/{slug}, or it is not open to you.</p>
        <Button variant="outline" onClick={() => router.replace(routes.root())}>
          Go to my workspace
        </Button>
      </div>
    );
  }
  if (membershipQuery.isLoading) return <FullPageLoader label="Opening workspace…" />;
  // Only an active seat lets anyone in. A pending one (a booking's, or somebody
  // who has not finished joining) is no access: with one account across every
  // workspace, a person signed in from another workspace could otherwise walk in.
  if (membershipQuery.data === null || (membershipQuery.data && membershipQuery.data.status !== "ACTIVE")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-center">
        <p className="text-base font-semibold">You do not have access to {workspace.name}</p>
        <p className="text-[13px] text-muted-foreground">Ask a workspace admin to add you, or open one of your other workspaces.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.replace(routes.root())} data-testid="no-access-my-workspaces">
            My workspaces
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <WorkspaceProvider workspace={workspace}>
      <PersonCardProvider value={renderPersonCard}>
        <AppShell>{children}</AppShell>
        <LeaveIntakeConfirm />
      </PersonCardProvider>
    </WorkspaceProvider>
  );
}

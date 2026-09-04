"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { WorkspaceProvider } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
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
    queryFn: () => services.workspace.getWorkspaceBySlug(slug),
    enabled: status === "signed-in",
  });
  const membershipQuery = useQuery({
    queryKey: [...queryKeys.workspaceMembers(workspaceQuery.data?.id ?? ""), "self", user?.id],
    queryFn: async () => {
      const members = await services.repos.workspaces.listMembers(workspaceQuery.data!.id);
      return members.find((m) => m.userId === user!.id) ?? null;
    },
    enabled: !!workspaceQuery.data && !!user,
  });

  if (status === "loading" || status === "signed-out" || !user) return <FullPageLoader label="Checking your session…" />;
  if (workspaceQuery.isLoading) return <FullPageLoader label="Opening workspace…" />;
  if (workspaceQuery.isError) return <ErrorState title="Could not load this workspace." error={workspaceQuery.error} onRetry={() => workspaceQuery.refetch()} />;

  const workspace = workspaceQuery.data;
  if (!workspace) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-center">
        <p className="text-base font-semibold">Workspace not found</p>
        <p className="text-[13px] text-muted-foreground">There is no workspace at /workspace/{slug}.</p>
        <Button variant="outline" onClick={() => router.replace(routes.root())}>
          Go to my workspace
        </Button>
      </div>
    );
  }
  if (membershipQuery.isLoading) return <FullPageLoader label="Opening workspace…" />;
  if (membershipQuery.data === null || membershipQuery.data?.status === "DEACTIVATED") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-center">
        <p className="text-base font-semibold">You do not have access to {workspace.name}</p>
        <p className="text-[13px] text-muted-foreground">Ask a workspace admin to invite you, or sign in with another account.</p>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <WorkspaceProvider workspace={workspace}>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}

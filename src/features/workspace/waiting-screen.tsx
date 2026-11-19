"use client";

import { useQuery } from "@tanstack/react-query";
import { Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";

/** How often a waiting screen asks again whether they have been let in. One small read. */
const WAITING_POLL_MS = 15_000;

/**
 * The workspaces this person is waiting to be let into (joined through the
 * join link, not yet approved). Asked again every so often, so the screen moves
 * on by itself once an admin approves them.
 */
export function useWaitingWorkspaces(enabled: boolean) {
  const { user } = useAuth();
  const services = useServices();
  return useQuery({
    queryKey: ["waiting-workspaces", user?.id],
    queryFn: () => services.repos.workspaces.listWaiting(user!.id),
    enabled: enabled && !!user,
    refetchInterval: WAITING_POLL_MS,
  });
}

/**
 * What someone who joined through the join link sees until an admin lets them
 * in. When they are approved the workspace opens on its own.
 */
export function WaitingScreen({ workspaceName }: { workspaceName: string; workspaceId: string }) {
  const { signOut } = useAuth();
  // Keeps the question asked while this is on screen; the workspace shell
  // reloads the page once the answer changes.
  useWaitingWorkspaces(true);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-6 text-center" data-testid="waiting-for-approval">
      <span className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-soft-foreground">
        <Hourglass className="size-5" />
      </span>
      <p className="text-base font-semibold">Waiting for approval</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">An admin of {workspaceName} has been told you joined. This page opens the workspace as soon as they let you in.</p>
      <Button variant="ghost" onClick={() => void signOut()}>
        Sign out
      </Button>
    </div>
  );
}

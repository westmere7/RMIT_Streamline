"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-context";
import { AuthShell, SessionProgress } from "@/features/auth/components/auth-shell";
import { useServices } from "@/features/data/data-context";
import { routes } from "@/lib/routes";

/**
 * Entry point: sends the person to their workspace or to sign in. Shows the
 * same frame as the sign-in screen while it decides, so a saved session lands
 * in the workspace without a blank page on the way.
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

  useEffect(() => {
    if (status === "signed-out") router.replace(routes.login());
    else if (status === "signed-in" && workspaces.data) {
      const first = workspaces.data[0];
      router.replace(first ? routes.workspace(first.slug) : routes.login());
    }
  }, [status, workspaces.data, router]);

  const destination = workspaces.data?.[0];
  return (
    <AuthShell
      headline="Boards, briefs and approvals in one place."
      lead="Track campaign production, creative requests and publication work across the Melbourne and Vietnam studios."
      progress
    >
      <div className="mb-6">
        <p className="mb-1 text-2xs font-semibold tracking-[0.12em] text-primary uppercase">RMIT Creative Team</p>
        <h2 className="text-[22px] font-semibold tracking-tight">One moment</h2>
      </div>
      <SessionProgress user={status === "signed-in" ? user : null} message={status === "signed-in" ? (destination ? `Opening ${destination.name}` : "Finding your workspace") : "Checking your session"} />
    </AuthShell>
  );
}

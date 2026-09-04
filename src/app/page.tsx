"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FullPageLoader } from "@/components/layout/full-page-loader";
import { useAuth } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { routes } from "@/lib/routes";

/** Entry point: sends the user to their workspace or the login screen. */
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

  return <FullPageLoader label="Loading your workspace…" />;
}

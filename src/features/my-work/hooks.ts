"use client";

import { useQuery } from "@tanstack/react-query";
import { useServices } from "@/features/data/data-context";
import { queryKeys } from "@/lib/query/keys";

export function useMyWork(workspaceId: string, userId: string) {
  const services = useServices();
  return useQuery({
    queryKey: queryKeys.myWork(workspaceId, userId),
    queryFn: () => services.myWork.listAssigned(workspaceId, userId),
    staleTime: 10_000,
  });
}

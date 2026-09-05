"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { User } from "@/domain";
import { useDataContext, useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { uploadAvatar } from "./avatar-upload";

export function useProfile(userId: string | null) {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.profile(ws.workspace.id, userId ?? ""),
    queryFn: () => services.profiles.load(ws.workspace.id, userId!),
    enabled: !!userId,
    staleTime: 10_000,
  });
}

type ProfilePatch = Partial<Pick<User, "firstName" | "lastName" | "displayName" | "jobTitle" | "department" | "timezone" | "avatarUrl">>;

export function useProfileMutations(userId: string) {
  const services = useServices();
  const { providerKind } = useDataContext();
  const queryClient = useQueryClient();
  const ws = useWorkspace();

  const settle = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.profile(ws.workspace.id, userId) });
    // The person's name and avatar appear on every board, so refresh the shell too.
    void queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
    void queryClient.invalidateQueries({ queryKey: ["current-user"] });
    publishDataChange({ kinds: ["workspace"] });
  };

  const save = useMutation({
    mutationFn: (patch: ProfilePatch) => services.profiles.updateProfile(userId, patch),
    onSuccess: () => toast.success("Profile updated"),
    onError: (error) => toast.error("Could not save the profile", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  /** Converts to WebP, stores it, then points the profile at the new file. */
  const changeAvatar = useMutation({
    mutationFn: async (file: File) => {
      const { url, bytes } = await uploadAvatar(providerKind, userId, file);
      await services.profiles.updateProfile(userId, { avatarUrl: url });
      return bytes;
    },
    onSuccess: (bytes) => toast.success("Avatar updated", { description: `Stored as WebP, ${Math.max(1, Math.round(bytes / 1024))}KB` }),
    onError: (error) => toast.error("Could not update the avatar", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  const removeAvatar = useMutation({
    mutationFn: () => services.profiles.updateProfile(userId, { avatarUrl: null }),
    onSuccess: () => toast.success("Avatar removed"),
    onSettled: settle,
  });

  return { save, changeAvatar, removeAvatar };
}

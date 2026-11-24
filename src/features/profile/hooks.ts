"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import type { User } from "@/domain";
import { useDataContext, useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { queryKeys } from "@/lib/query/keys";
import { useWorkspaceRowChecks } from "@/lib/realtime/in-workspace";
import { publishDataChange } from "@/lib/realtime/local-realtime";
import { useRealtime, type RealtimeBinding } from "@/lib/realtime/use-realtime";
import { uploadAvatar } from "./avatar-upload";

/** Who the person is: the head of their profile, which shows before their work has been read. */
export function useProfile(userId: string | null) {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.profile(ws.workspace.id, userId ?? ""),
    queryFn: () => services.profiles.loadSummary(ws.workspace.id, userId!),
    enabled: !!userId,
    staleTime: 10_000,
  });
}

/** Their tasks, deliverables and activity. Under the profile's key, so refreshing the profile refreshes this too. */
export function useProfileWork(userId: string | null) {
  const services = useServices();
  const ws = useWorkspace();
  return useQuery({
    queryKey: queryKeys.profileWork(ws.workspace.id, userId ?? ""),
    queryFn: () => services.profiles.loadWork(ws.workspace.id, userId!),
    enabled: !!userId,
    staleTime: 10_000,
    // Live while it is looked at: realtime (useProfileRealtime) brings changes as they happen, and this
    // catches anything it missed. Only this person's rows are read, so the poll is small; never in the background.
    refetchInterval: PROFILE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** The safety refresh of a profile's figures, on top of realtime. */
const PROFILE_REFRESH_MS = 60_000;

/**
 * Keeps a profile's figures current while it is open: the tables its tasks,
 * deliverables and head are read from, one refetch per burst of changes. RLS
 * applies to Realtime, so the reader only hears of rows they could read anyway.
 * In local mode the BroadcastChannel sync invalidates the same key.
 */
export function useProfileRealtime(userId: string | null): void {
  const ws = useWorkspace();
  const checks = useWorkspaceRowChecks();
  const workspaceId = ws.workspace.id;
  const bindings = React.useMemo<RealtimeBinding[]>(() => {
    if (!userId) return [];
    // Under profile(): the head and the work both.
    const keys = [queryKeys.profile(workspaceId, userId)];
    return [
      { table: "items", keys, accept: checks.onBoard },
      { table: "item_column_values", keys, accept: checks.onBoard },
      { table: "item_assets", keys, accept: checks.onBoard },
      { table: "board_groups", keys, accept: checks.onBoard },
      { table: "profiles", filter: `id=eq.${userId}`, keys },
      // Not in the workspace revision; rare enough to leave to the next change.
      { table: "workspace_members", filter: `user_id=eq.${userId}`, keys, catchUp: "none" },
      { table: "team_members", filter: `user_id=eq.${userId}`, keys, catchUp: "none" },
    ];
  }, [workspaceId, userId, checks]);
  useRealtime(userId ? `profile:${workspaceId}:${userId}` : null, bindings, { coalesceMs: 1_500, minIntervalMs: 5_000, catchUp: { workspaceId } });
}

type ProfilePatch = Partial<
  Pick<User, "firstName" | "lastName" | "displayName" | "jobTitle" | "department" | "timezone" | "avatarUrl" | "stakeholderGroup" | "workHoursStart" | "workHoursEnd">
>;

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
    mutationFn: (patch: ProfilePatch) => services.profiles.updateProfile(userId, patch, ws.currentUser.id),
    onSuccess: () => toast.success("Profile updated"),
    onError: (error) => toast.error("Could not save the profile", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  /** Their email, sign-in included; the caller saves the rest after it. */
  const changeEmail = useMutation({
    mutationFn: (email: string) => services.profiles.changeEmail(ws.workspace.id, userId, email),
    onError: (error) => toast.error("Could not change the email", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  /** Converts to WebP, stores it, then points the profile at the new file. */
  const changeAvatar = useMutation({
    mutationFn: async (file: File) => {
      const { url, bytes } = await uploadAvatar(providerKind, userId, file);
      await services.profiles.updateProfile(userId, { avatarUrl: url }, ws.currentUser.id);
      return bytes;
    },
    onSuccess: (bytes) => toast.success("Avatar updated", { description: `Stored as WebP, ${Math.max(1, Math.round(bytes / 1024))}KB` }),
    onError: (error) => toast.error("Could not update the avatar", { description: error instanceof Error ? error.message : undefined }),
    onSettled: settle,
  });

  const removeAvatar = useMutation({
    mutationFn: () => services.profiles.updateProfile(userId, { avatarUrl: null }, ws.currentUser.id),
    onSuccess: () => toast.success("Avatar removed"),
    onSettled: settle,
  });

  return { save, changeEmail, changeAvatar, removeAvatar };
}

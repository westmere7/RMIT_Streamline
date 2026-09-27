"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonLine } from "@/components/ui/skeleton";
import type { Workspace } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageWorkspaces } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { WORKSPACE_SLUG_PATTERN } from "@/services/workspace-service";

/** Where the last workspace opened is remembered, so signing in lands back in it. */
const LAST_WORKSPACE_KEY = "streamline:last-workspace";

export function rememberWorkspace(slug: string): void {
  try {
    window.localStorage.setItem(LAST_WORKSPACE_KEY, slug);
  } catch {
    // Private windows and blocked storage: the first workspace will do.
  }
}

/**
 * The workspace to open: the last one used if it is still one of theirs,
 * otherwise the oldest of them — the one the app started with, so nobody lands
 * somewhere just because its name sorts first.
 */
export function pickWorkspace<T extends Pick<Workspace, "slug" | "createdAt">>(workspaces: readonly T[]): T | null {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    last = null;
  }
  const oldest = workspaces.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  return workspaces.find((w) => w.slug === last) ?? oldest;
}

export const userWorkspacesKey = (userId: string | undefined) => ["user-workspaces", userId] as const;

/** The workspaces the signed-in person can open, by name. `enabled: false` holds the read back, for a menu that is not open yet. */
export function useMyWorkspaces({ enabled = true }: { enabled?: boolean } = {}) {
  const services = useServices();
  const user = useCurrentUser();
  return useQuery({ queryKey: userWorkspacesKey(user.id), queryFn: () => services.workspace.listWorkspacesForUser(user.id), staleTime: 30_000, enabled });
}

/** A workspace row still on its way: the height of a real one, so nothing jumps when it arrives. */
export function WorkspaceRowPlaceholder({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading workspaces" className={className} data-testid="workspace-row-loading">
      <SkeletonLine className="w-28" />
    </div>
  );
}

/** The Owners' ids. */
export function useOwners() {
  const services = useServices();
  return useQuery({ queryKey: ["owners"], queryFn: () => services.workspace.listOwners(), staleTime: 30_000 });
}

/** Creating, renaming and deleting workspaces, and making and unmaking Owners. Owners only; the services and the database both check. */
export function useWorkspaceAdmin() {
  const services = useServices();
  const user = useCurrentUser();
  const ws = useWorkspace();
  const queryClient = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user-workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["all-workspaces"] }),
      queryClient.invalidateQueries({ queryKey: ["owners"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace"] }),
    ]);
  };
  const fail = (fallback: string) => (error: unknown) => toast.error(error instanceof Error ? error.message : fallback);

  const createWorkspace = useMutation({
    mutationFn: (input: { name: string; slug: string | null }) => services.workspace.createWorkspace(input, user.id, ws.workspace.id),
    onSuccess: refresh,
    onError: fail("Could not create the workspace"),
  });
  const renameWorkspace = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => services.workspace.updateWorkspace(id, { name }),
    onSuccess: async () => {
      await refresh();
      ws.refresh();
    },
    onError: fail("Could not rename the workspace"),
  });
  const deleteWorkspace = useMutation({
    mutationFn: ({ id, typedName }: { id: string; typedName: string }) => services.workspace.deleteWorkspace(id, user.id, typedName),
    // Not the "workspace" queries: the page may still be standing in the one
    // just deleted, and re-reading it would show "not found" before it moves on.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["user-workspaces"] }),
        queryClient.invalidateQueries({ queryKey: ["all-workspaces"] }),
      ]),
    onError: fail("Could not delete the workspace"),
  });
  const setOwner = useMutation({
    mutationFn: ({ userId, owner }: { userId: string; owner: boolean }) => (owner ? services.workspace.grantOwner(userId, user.id) : services.workspace.revokeOwner(userId, user.id)),
    onSuccess: async () => {
      await refresh();
      ws.refresh();
    },
    onError: fail("Could not change who is an Owner"),
  });
  return { createWorkspace, renameWorkspace, deleteWorkspace, setOwner };
}

/** Every workspace, for the Owners' list in Settings. An Owner is in all of them, so their own list is the full one. */
export function useAllWorkspaces() {
  const services = useServices();
  return useQuery({ queryKey: ["all-workspaces"], queryFn: () => services.repos.workspaces.list(), staleTime: 30_000 });
}

// ---- The switcher ----------------------------------------------------------------

/**
 * The entries of the account menu's Workspace sub-menu: every workspace this
 * person can open, the current one ticked, and for Owners the ways to make and
 * manage them.
 */
export function WorkspaceMenuItems() {
  const ws = useWorkspace();
  const router = useRouter();
  const mine = useMyWorkspaces();
  const services = useServices();
  // Every workspace's notifications: the inbox shows this one's, so the menu is
  // where the others say something is waiting. The same cached read as the inbox.
  const all = useQuery({ queryKey: queryKeys.notifications(ws.currentUser.id), queryFn: () => services.repos.notifications.listByUser(ws.currentUser.id), staleTime: 10_000 });
  const unreadIn = (workspaceId: string) => (all.data ?? []).filter((n) => n.workspaceId === workspaceId && n.readAt === null && n.delivery === "NOTIFICATION").length;
  const showNew = useNewWorkspaceDialog((s) => s.show);
  const list = mine.data ?? [ws.workspace];
  const owner = canManageWorkspaces(ws.ownPermissions);
  // Only rows that arrive while the menu is open fade in; a cached list is simply there.
  const [arriving] = React.useState(mine.isPending);
  return (
    <>
      {list.map((workspace) => (
        <DropdownMenuItem
          key={workspace.id}
          className={cn(arriving && workspace.id !== ws.workspace.id && "animate-in fade-in-0 duration-200")}
          onSelect={() => router.push(routes.workspace(workspace.slug))}
          data-testid={workspace.id === ws.workspace.id ? "menu-workspace-current" : "menu-workspace-option"}
          data-workspace-slug={workspace.slug}
        >
          <span className="truncate">{workspace.name}</span>
          {workspace.id === ws.workspace.id ? (
            <Check className="ml-auto size-3.5" />
          ) : (
            unreadIn(workspace.id) > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-foreground tabular animate-in fade-in-0 duration-200" aria-label={`${unreadIn(workspace.id)} unread`} data-testid="menu-workspace-unread">
                {unreadIn(workspace.id)}
              </span>
            )
          )}
        </DropdownMenuItem>
      ))}
      {mine.isPending && <WorkspaceRowPlaceholder className="flex h-9 items-center px-2.5 text-[13px] max-md:h-11 max-md:text-[15px]" />}
      {owner && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => showNew()} data-testid="menu-workspace-new">
            <Plus /> New workspace
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push(routes.settings(ws.slug, "workspaces"))} data-testid="menu-workspace-manage">
            <Settings2 /> Manage workspaces
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

// ---- New workspace ---------------------------------------------------------------

export const useNewWorkspaceDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

const schema = z.object({
  name: z.string().trim().min(1, "Name the workspace").max(60, "Keep it to 60 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine((value) => value === "" || WORKSPACE_SLUG_PATTERN.test(value), "2 to 40 lower-case letters, digits and dashes"),
});
type FormValues = z.infer<typeof schema>;

/** One host in the app shell, opened from the account menu, phone More and Settings. */
export function NewWorkspaceHost() {
  const { open, hide } = useNewWorkspaceDialog();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && hide()}>
      <DialogContent size="sm" data-testid="new-workspace-dialog">
        {open && <NewWorkspaceForm onDone={hide} />}
      </DialogContent>
    </Dialog>
  );
}

function NewWorkspaceForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { createWorkspace } = useWorkspaceAdmin();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", slug: "" } });
  const name = useWatch({ control: form.control, name: "name" }) ?? "";
  const slug = useWatch({ control: form.control, name: "slug" }) ?? "";
  const address = slug.trim() || slugify(name).slice(0, 40) || "…";

  const submit = (values: FormValues) =>
    createWorkspace.mutate(
      { name: values.name, slug: values.slug || null },
      {
        onSuccess: (workspace) => {
          onDone();
          toast.success(`${workspace.name} is ready`);
          router.push(routes.workspace(workspace.slug));
        },
      },
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>New workspace</DialogTitle>
        <DialogDescription>It shares people and departments with the others. Everything else starts empty.</DialogDescription>
      </DialogHeader>
      <form id="new-workspace-form" className="grid gap-3.5" onSubmit={form.handleSubmit(submit)}>
        <div className="grid gap-1.5">
          <Label htmlFor="new-workspace-name">Name</Label>
          <Input id="new-workspace-name" autoFocus maxLength={60} {...form.register("name")} aria-invalid={!!form.formState.errors.name} data-testid="new-workspace-name" />
          {form.formState.errors.name && <p className="text-2xs text-destructive">{form.formState.errors.name.message}</p>}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="new-workspace-slug">Address</Label>
          <Input id="new-workspace-slug" placeholder={slugify(name).slice(0, 40) || "made from the name"} maxLength={40} {...form.register("slug")} aria-invalid={!!form.formState.errors.slug} data-testid="new-workspace-slug" />
          {form.formState.errors.slug ? (
            <p className="text-2xs text-destructive">{form.formState.errors.slug.message}</p>
          ) : (
            <p className="truncate text-2xs text-muted-foreground">/workspace/{address}</p>
          )}
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" form="new-workspace-form" disabled={createWorkspace.isPending} data-testid="new-workspace-create">
          {createWorkspace.isPending ? "Creating…" : "Create workspace"}
        </Button>
      </DialogFooter>
    </>
  );
}

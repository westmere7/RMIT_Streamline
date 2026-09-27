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
import type { Workspace } from "@/domain";
import { useCurrentUser } from "@/features/auth/auth-context";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageWorkspaces } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { slugify } from "@/lib/slug";
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

/** The workspace to open: the last one used if it is still one of theirs, otherwise the first. */
export function pickWorkspace<T extends Pick<Workspace, "slug">>(workspaces: readonly T[]): T | null {
  let last: string | null = null;
  try {
    last = window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    last = null;
  }
  return workspaces.find((w) => w.slug === last) ?? workspaces[0] ?? null;
}

export const userWorkspacesKey = (userId: string | undefined) => ["user-workspaces", userId] as const;

/** The workspaces the signed-in person can open, by name. */
export function useMyWorkspaces() {
  const services = useServices();
  const user = useCurrentUser();
  return useQuery({ queryKey: userWorkspacesKey(user.id), queryFn: () => services.workspace.listWorkspacesForUser(user.id), staleTime: 30_000 });
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
    onSuccess: refresh,
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
  const showNew = useNewWorkspaceDialog((s) => s.show);
  const list = mine.data ?? [ws.workspace];
  const owner = canManageWorkspaces(ws.ownPermissions);
  return (
    <>
      {list.map((workspace) => (
        <DropdownMenuItem
          key={workspace.id}
          onSelect={() => router.push(routes.workspace(workspace.slug))}
          data-testid={workspace.id === ws.workspace.id ? "menu-workspace-current" : "menu-workspace-option"}
          data-workspace-slug={workspace.slug}
        >
          <span className="truncate">{workspace.name}</span>
          {workspace.id === ws.workspace.id && <Check className="ml-auto size-3.5" />}
        </DropdownMenuItem>
      ))}
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

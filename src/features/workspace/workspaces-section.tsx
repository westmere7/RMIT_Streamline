"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, Check, Hash, LayoutGrid, Pencil, Plus, ShieldCheck, Trash2, UserCog, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonLine } from "@/components/ui/skeleton";
import type { Workspace } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useAllWorkspaces, useNewWorkspaceDialog, useOwners, useWorkspaceAdmin } from "@/features/workspace/workspaces";
import { formatRelative, formatShortDate } from "@/lib/dates/dates";
import { routes } from "@/lib/routes";
import { pluralize } from "@/lib/utils";

/**
 * Settings → Workspaces, for Owners: every workspace, renamed or deleted from
 * here, and the Owners themselves.
 */
export function WorkspacesSection() {
  const ws = useWorkspace();
  const all = useAllWorkspaces();
  const owners = useOwners();
  const showNew = useNewWorkspaceDialog((s) => s.show);
  const { setOwner } = useWorkspaceAdmin();
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);
  const workspaces = (all.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const ownerUsers = (owners.data ?? []).map((id) => ws.userById(id)).filter((u) => !!u);
  const removing = confirmRemove ? ws.userById(confirmRemove) : null;

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border border-border/70 bg-card shadow-xs">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <h3 className="flex-1 text-[13px] font-semibold">Workspaces</h3>
          <Button size="sm" variant="outline" onClick={showNew} data-testid="workspaces-new">
            <Plus /> New workspace
          </Button>
        </div>
        <ul className="divide-y divide-border/60" data-testid="workspaces-list">
          {workspaces.map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} current={workspace.id === ws.workspace.id} onlyOne={workspaces.length <= 1} />
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border/70 bg-card shadow-xs">
        <h3 className="border-b border-border/60 px-4 py-2.5 text-[13px] font-semibold">Owners</h3>
        <ul className="divide-y divide-border/60" data-testid="owners-list">
          {ownerUsers.map((user) => (
            <li key={user.id} className="flex items-center gap-3 px-4 py-2.5" data-testid="owner-row" data-owner-email={user.email}>
              <UserAvatar user={user} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{user.displayName}</span>
                <span className="block truncate text-2xs text-muted-foreground">{user.email}</span>
              </span>
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={ownerUsers.length <= 1} onClick={() => setConfirmRemove(user.id)} data-testid="owner-remove">
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <p className="border-t border-border/60 px-4 py-2.5 text-2xs text-muted-foreground">
          Make someone an Owner from{" "}
          <Link href={routes.members(ws.slug)} className="font-medium text-foreground hover:underline">
            Members
          </Link>
          .
        </p>
      </section>

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title={`Remove ${removing?.displayName ?? "this person"} as an Owner?`}
        description="They stay in every workspace as a member."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmRemove) setOwner.mutate({ userId: confirmRemove, owner: false }, { onSuccess: () => toast.success("Owner removed") });
          setConfirmRemove(null);
        }}
      />
    </div>
  );
}

function WorkspaceRow({ workspace, current, onlyOne }: { workspace: Workspace; current: boolean; onlyOne: boolean }) {
  const services = useServices();
  const router = useRouter();
  const ws = useWorkspace();
  const { renameWorkspace, deleteWorkspace } = useWorkspaceAdmin();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(workspace.name);
  const [deleting, setDeleting] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  // What is in it, at a glance. Owners are in every workspace, so the admins
  // named are the people who run this one.
  const overview = useQuery({
    queryKey: ["workspace-overview", workspace.id],
    queryFn: async () => {
      const [members, teams, boards, latest] = await Promise.all([
        services.repos.workspaces.listMembers(workspace.id),
        services.repos.teams.listByWorkspace(workspace.id),
        services.repos.boards.listByWorkspace(workspace.id),
        services.repos.activities.listByWorkspace(workspace.id, 1),
      ]);
      const active = members.filter((m) => m.status === "ACTIVE");
      return {
        members: active.length,
        adminIds: active.filter((m) => m.role === "ADMIN").map((m) => m.userId),
        teams: teams.filter((t) => !t.archivedAt && !t.system).length,
        boards: boards.filter((b) => !b.archivedAt && !b.system).length,
        lastActive: latest[0]?.createdAt ?? null,
      };
    },
    staleTime: 60_000,
  });
  const o = overview.data;
  const admins = (o?.adminIds ?? []).map((id) => ws.userById(id)?.displayName).filter((n): n is string => !!n);
  const figures: Array<{ icon: LucideIcon; label: string; testId: string }> = o
    ? [
        { icon: UserCog, label: pluralize(o.members, "member"), testId: "members" },
        { icon: Users, label: pluralize(o.teams, "team"), testId: "teams" },
        { icon: LayoutGrid, label: pluralize(o.boards, "board"), testId: "boards" },
        { icon: Hash, label: pluralize(workspace.ticketCounter ?? 0, "ticket"), testId: "tickets" },
        { icon: Activity, label: o.lastActive ? `Active ${formatRelative(o.lastActive)}` : "No activity yet", testId: "active" },
      ]
    : [];

  const save = () => {
    const next = name.trim();
    if (!next || next === workspace.name) return setEditing(false);
    renameWorkspace.mutate({ id: workspace.id, name: next }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className="flex items-center gap-3 px-4 py-2.5" data-testid="workspace-row" data-workspace-slug={workspace.slug}>
      <span className="min-w-0 flex-1">
        {editing ? (
          <span className="flex items-center gap-1">
            <Input
              value={name}
              autoFocus
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") setEditing(false);
              }}
              className="h-8 text-[13px]"
              aria-label="Workspace name"
              data-testid="workspace-rename-input"
            />
            <Button size="icon-sm" variant="ghost" onClick={save} aria-label="Save name" data-testid="workspace-rename-save">
              <Check />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
              <X />
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium" data-testid="workspace-row-name">
              {workspace.name}
            </span>
            {current && <Badge variant="muted">This one</Badge>}
          </span>
        )}
        <span className="block truncate text-2xs text-muted-foreground">
          /workspace/{workspace.slug} · since {formatShortDate(workspace.createdAt.slice(0, 10))}
        </span>
        <span className="mt-1.5 flex min-h-4 flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground" data-testid="workspace-row-figures">
          {o ? (
            <>
              {figures.map(({ icon: Icon, label, testId }) => (
                <span key={testId} className="inline-flex items-center gap-1 animate-in fade-in-0 duration-200" data-testid={`workspace-figure-${testId}`}>
                  <Icon className="size-3" aria-hidden />
                  {label}
                </span>
              ))}
              <span className="inline-flex min-w-0 items-center gap-1 animate-in fade-in-0 duration-200" data-testid="workspace-figure-admins">
                <ShieldCheck className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{admins.length ? `Admins: ${admins.join(", ")}` : "No admins"}</span>
              </span>
            </>
          ) : (
            <SkeletonLine className="w-72" />
          )}
        </span>
      </span>
      {!editing && (
        <span className="flex shrink-0 items-center gap-0.5">
          {!current && (
            <Button size="icon-sm" variant="ghost" asChild aria-label={`Open ${workspace.name}`}>
              <Link href={routes.workspace(workspace.slug)}>
                <ArrowUpRight />
              </Link>
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              setName(workspace.name);
              setEditing(true);
            }}
            aria-label={`Rename ${workspace.name}`}
            data-testid="workspace-rename"
          >
            <Pencil />
          </Button>
          <Button size="icon-sm" variant="ghost" className="hover:text-destructive" disabled={onlyOne} onClick={() => setDeleting(true)} aria-label={`Delete ${workspace.name}`} data-testid="workspace-delete">
            <Trash2 />
          </Button>
        </span>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open);
          if (!open) setTyped("");
        }}
        title={`Delete ${workspace.name}?`}
        description="Its boards, tasks, teams and settings go for good. People and departments stay. A snapshot is taken first."
        confirmLabel="Delete workspace"
        destructive
        confirmDisabled={typed.trim() !== workspace.name.trim() || deleteWorkspace.isPending}
        onConfirm={async () => {
          await deleteWorkspace.mutateAsync({ id: workspace.id, typedName: typed });
          toast.success(`${workspace.name} deleted`);
          setDeleting(false);
          setTyped("");
          if (current) {
            const next = (await services.workspace.listWorkspacesForUser(ws.currentUser.id)).find((w) => w.id !== workspace.id);
            router.replace(next ? routes.workspace(next.slug) : routes.root());
          }
        }}
      >
        <div className="grid gap-1.5">
          <p className="text-[13px] text-muted-foreground">
            Type <span className="font-medium text-foreground">{workspace.name}</span> to confirm.
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Workspace name to confirm" data-testid="workspace-delete-confirm" />
        </div>
      </ConfirmDialog>
    </li>
  );
}

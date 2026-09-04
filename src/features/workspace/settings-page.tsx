"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Pencil, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Team } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const SECTIONS = ["general", "members", "teams", "permissions", "data"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABELS: Record<Section, string> = { general: "General", members: "Members", teams: "Teams", permissions: "Permissions", data: "Data" };

export function SettingsPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("section");
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : "general";

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Workspace settings" description={ws.workspace.name} />
      <div className="flex min-h-0 flex-1">
        <nav className="w-48 shrink-0 border-r px-3 py-2" aria-label="Settings sections">
          <ul className="space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => router.replace(routes.settings(ws.slug, s))}
                  aria-current={section === s ? "page" : undefined}
                  className={cn(
                    "flex h-8 w-full items-center rounded-md px-2 text-[13px] font-medium",
                    section === s ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  )}
                >
                  {SECTION_LABELS[s]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-2xl">
            {section === "general" && <GeneralSection />}
            {section === "members" && <MembersSection />}
            {section === "teams" && <TeamsSection />}
            {section === "permissions" && <PermissionsSection />}
            {section === "data" && <DataSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-[13px] text-muted-foreground">{description}</p>
    </div>
  );
}

function GeneralSection() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const manage = canManageWorkspace(ws.permissions);
  const [name, setName] = React.useState(ws.workspace.name);
  const save = useMutation({
    mutationFn: () => services.workspace.updateWorkspace(ws.workspace.id, { name }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace(ws.slug) });
      toast.success("Changes saved");
    },
  });
  return (
    <>
      <SectionTitle title="General" description="Workspace name and identity." />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="ws-name">Workspace name</Label>
          <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} className="max-w-sm" />
        </div>
        <div className="grid gap-1.5">
          <Label>URL</Label>
          <p className="text-[13px] text-muted-foreground">/workspace/{ws.slug}</p>
        </div>
        {manage && (
          <Button type="submit" disabled={save.isPending || name.trim() === ws.workspace.name || !name.trim()}>
            Save changes
          </Button>
        )}
      </form>
    </>
  );
}

function MembersSection() {
  const ws = useWorkspace();
  const active = ws.members.filter((m) => m.status === "ACTIVE").length;
  const invited = ws.members.filter((m) => m.status === "INVITED").length;
  return (
    <>
      <SectionTitle title="Members" description="People with access to this workspace." />
      <div className="flex items-center gap-4 rounded-md border p-4 text-[13px]">
        <div>
          <p className="text-lg font-semibold tabular">{active}</p>
          <p className="text-muted-foreground">active</p>
        </div>
        <div>
          <p className="text-lg font-semibold tabular">{invited}</p>
          <p className="text-muted-foreground">invited</p>
        </div>
        <Button variant="outline" className="ml-auto" asChild>
          <Link href={routes.members(ws.slug)}>Manage members</Link>
        </Button>
      </div>
    </>
  );
}

function TeamsSection() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<Team | null | undefined>(undefined);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
  const archive = useMutation({
    mutationFn: ({ team, archived }: { team: Team; archived: boolean }) => services.workspace.archiveTeam(team.id, archived),
    onSuccess: async (team) => {
      await invalidate();
      toast.success(team.archivedAt ? `${team.name} archived` : `${team.name} restored`);
    },
  });
  return (
    <>
      <SectionTitle title="Teams" description="Teams group boards and people. Archived teams are hidden from the sidebar." />
      <div className="mb-3 flex justify-end">
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus /> New team
        </Button>
      </div>
      <ul className="divide-y rounded-md border">
        {ws.teams.map((team) => {
          const memberCount = ws.teamMembers.filter((m) => m.teamId === team.id).length;
          return (
            <li key={team.id} className="flex h-12 items-center gap-3 px-3 text-[13px]">
              <DynamicIcon name={team.icon} className={cn("size-4", colorClasses(team.color).text)} />
              <span className="min-w-0 flex-1">
                <Link href={routes.team(ws.slug, team.id)} className="font-medium hover:underline">
                  {team.name}
                </Link>
                <span className="ml-2 text-2xs text-muted-foreground">
                  {memberCount} members · {ws.boards.filter((b) => b.teamId === team.id && !b.archivedAt).length} boards
                </span>
              </span>
              {team.archivedAt && <Badge variant="muted">Archived</Badge>}
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${team.name}`} onClick={() => setEditing(team)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={team.archivedAt ? `Restore ${team.name}` : `Archive ${team.name}`}
                onClick={() => archive.mutate({ team, archived: !team.archivedAt })}
              >
                {team.archivedAt ? <ArchiveRestore /> : <Archive />}
              </Button>
            </li>
          );
        })}
      </ul>
      <CreateTeamDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} team={editing ?? null} />
    </>
  );
}

function PermissionsSection() {
  const rows: Array<[string, string, string, string, string]> = [
    ["View workspace boards", "✓", "✓", "✓", "Shared only"],
    ["Create boards and teams", "✓", "✓", "✓", "—"],
    ["Manage members and roles", "✓", "✓", "—", "—"],
    ["Edit any board", "✓", "✓", "If editor", "If editor"],
    ["Delete boards", "✓", "✓", "Own boards", "—"],
    ["Reset demo data", "✓", "✓", "—", "—"],
  ];
  return (
    <>
      <SectionTitle title="Permissions" description="Workspace roles apply everywhere; board roles (owner, editor, viewer) refine access per board." />
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-[13px]">
          <thead className="bg-surface text-left text-2xs text-muted-foreground">
            <tr className="h-8">
              <th className="px-3 font-medium">Capability</th>
              <th className="px-3 font-medium">Owner</th>
              <th className="px-3 font-medium">Admin</th>
              <th className="px-3 font-medium">Member</th>
              <th className="px-3 font-medium">Guest</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(([cap, ...cells]) => (
              <tr key={cap} className="h-9">
                <td className="px-3">{cap}</td>
                {cells.map((c, i) => (
                  <td key={i} className="px-3 text-muted-foreground">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-2xs text-muted-foreground">
        Rules live in <code>src/lib/permissions/permissions.ts</code> and mirror the planned Supabase row-level security policies.
      </p>
    </>
  );
}

function DataSection() {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const manage = canManageWorkspace(ws.permissions);
  return (
    <>
      <SectionTitle title="Data" description="This prototype stores everything in your browser (IndexedDB). Nothing is sent to a server." />
      <div className="rounded-md border p-4">
        <p className="text-[13px] font-medium">Reset demo data</p>
        <p className="mb-3 text-[13px] text-muted-foreground">Restore the original seeded boards, items, comments and notifications. All local changes are lost.</p>
        <Button variant="destructive" size="sm" disabled={!manage} onClick={() => setConfirm(true)}>
          <RotateCcw /> Reset demo data
        </Button>
        {!manage && <p className="mt-2 text-2xs text-muted-foreground">Only workspace owners and admins can reset data.</p>}
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Reset demo data?"
        description="All boards, items, comments and notifications in this browser will be replaced with the original seed. This cannot be undone."
        confirmLabel="Reset data"
        destructive
        onConfirm={async () => {
          await services.repos.admin.resetToSeed();
          queryClient.clear();
          toast.success("Demo data reset");
          router.replace(routes.workspace(ws.slug));
        }}
      />
    </>
  );
}

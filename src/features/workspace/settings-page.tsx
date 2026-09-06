"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Download, Pencil, Plus, RefreshCw, RotateCcw, Upload } from "lucide-react";
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
import { isDataExport, type DataExport } from "@/data/repositories";
import { useDataContext, useServices } from "@/features/data/data-context";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { CURRENT_VERSION, formatVersion } from "@/lib/version";
import { selectUpdateAvailable, useVersionStore } from "@/stores/version-store";

const SECTIONS = ["general", "teams", "permissions", "data"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABELS: Record<Section, string> = { general: "General", teams: "Teams", permissions: "Permissions", data: "Data" };

export function SettingsPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("section");
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : "general";

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Workspace settings" description={ws.workspace.name} />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        {/* A side list on desktop, a row of tabs on a phone. */}
        <nav className="w-48 shrink-0 border-r px-3 py-2 max-md:w-full max-md:border-r-0 max-md:border-b max-md:py-1" aria-label="Settings sections">
          <ul className="space-y-0.5 max-md:flex max-md:gap-1 max-md:space-y-0 max-md:overflow-x-auto">
            {SECTIONS.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => router.replace(routes.settings(ws.slug, s))}
                  aria-current={section === s ? "page" : undefined}
                  className={cn(
                    "flex h-8 w-full items-center rounded-md px-2 text-[13px] font-medium max-md:w-auto max-md:shrink-0 max-md:whitespace-nowrap",
                    section === s ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
                  )}
                >
                  {SECTION_LABELS[s]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">
          <div className="max-w-2xl">
            {section === "general" && <GeneralSection />}
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
      <AboutSection />
    </>
  );
}

/**
 * The only place the version is shown. The watcher in the app shell checks
 * for a newer build on its own; this is where to see the result and ask again.
 */
function AboutSection() {
  const latest = useVersionStore((s) => s.latest);
  const checkedAt = useVersionStore((s) => s.checkedAt);
  const checking = useVersionStore((s) => s.checking);
  const failed = useVersionStore((s) => s.failed);
  const check = useVersionStore((s) => s.check);
  const updateAvailable = useVersionStore(selectUpdateAvailable);
  const built = CURRENT_VERSION.builtAt ? new Date(CURRENT_VERSION.builtAt) : null;

  return (
    <div className="mt-10">
      <SectionTitle title="About" description="The version of Streamline this page is running." />
      <div className="rounded-xl border border-border/70 bg-card p-4 text-[13px] shadow-xs" data-testid="about-version">
        <p>
          <span className="font-medium">Streamline {formatVersion(CURRENT_VERSION)}</span>
          {built && !Number.isNaN(built.getTime()) && <span className="text-muted-foreground"> · built {built.toLocaleString()}</span>}
        </p>
        <p className="mt-1 text-muted-foreground" data-testid="version-status">
          {updateAvailable && latest
            ? `A newer version is live: ${formatVersion(latest)}. Reload to get it; nothing here is lost.`
            : failed
              ? "Could not reach the server to check for updates. It will try again shortly."
              : checkedAt
                ? `You are up to date. Checked at ${new Date(checkedAt).toLocaleTimeString()}.`
                : "Checking for updates…"}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {updateAvailable && (
            <Button size="sm" onClick={() => window.location.reload()} data-testid="version-reload">
              <RefreshCw /> Reload now
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={checking} onClick={() => void check()} data-testid="version-check">
            <RefreshCw className={cn(checking && "animate-spin")} /> {checking ? "Checking…" : "Check for updates"}
          </Button>
        </div>
      </div>
    </div>
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
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
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
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs">
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
  const { providerKind } = useDataContext();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [pendingImport, setPendingImport] = React.useState<{ data: DataExport; filename: string } | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const manage = canManageWorkspace(ws.permissions);

  const exportData = async () => {
    setExporting(true);
    try {
      const data = await services.repos.admin.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `streamline-${ws.slug}-${data.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      const count = Object.values(data.stores).reduce((sum, rows) => sum + rows.length, 0);
      toast.success("Data exported", { description: `${count.toLocaleString()} records saved to ${anchor.download}` });
    } catch (error) {
      console.error("[data] export failed", error);
      toast.error("Could not export data");
    } finally {
      setExporting(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDataExport(parsed)) {
        toast.error("That file is not a Streamline export");
        return;
      }
      setPendingImport({ data: parsed, filename: file.name });
    } catch (error) {
      console.error("[data] import parse failed", error);
      toast.error("Could not read that file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importCounts = pendingImport
    ? {
        boards: pendingImport.data.stores.boards?.length ?? 0,
        items: pendingImport.data.stores.items?.length ?? 0,
        users: pendingImport.data.stores.users?.length ?? 0,
      }
    : null;

  return (
    <>
      <SectionTitle
        title="Data"
        description={
          providerKind === "supabase"
            ? "This workspace is stored in Supabase Postgres and shared by everyone in it. Row-level security decides what each person can see."
            : "This prototype stores everything in your browser (IndexedDB). Nothing is sent to a server, so each browser and each device holds its own copy."
        }
      />
      {providerKind === "supabase" ? (
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
          <p className="text-[13px] font-medium">Managed by the database</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Export, import and reset are local-store tools. For a Supabase project use a Postgres dump for backups, and
            <code className="mx-1 rounded bg-surface px-1.5 py-0.5 text-2xs">npm run db:seed</code>
            to restore the demo data.
          </p>
        </div>
      ) : (
      <div className="space-y-4">
        <div className="rounded-md border p-4">
          <p className="text-[13px] font-medium">Export data</p>
          <p className="mb-3 text-[13px] text-muted-foreground">Download everything in this browser as a JSON file: boards, items, comments, activity, notifications and preferences. Use it to move your work to another browser or share a scenario.</p>
          <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportData()} data-testid="export-data">
            <Download /> {exporting ? "Exporting…" : "Export data"}
          </Button>
        </div>

        <div className="rounded-md border p-4">
          <p className="text-[13px] font-medium">Import data</p>
          <p className="mb-3 text-[13px] text-muted-foreground">Replace everything in this browser with a previously exported file. Your current local data is overwritten.</p>
          <input ref={fileInputRef} type="file" accept="application/json,.json" hidden aria-label="Choose export file" onChange={(e) => void pickFile(e.target.files?.[0])} />
          <Button variant="outline" size="sm" disabled={!manage} onClick={() => fileInputRef.current?.click()} data-testid="import-data">
            <Upload /> Import data…
          </Button>
          {!manage && <p className="mt-2 text-2xs text-muted-foreground">Only workspace owners and admins can import data.</p>}
        </div>

        <div className="rounded-md border p-4">
          <p className="text-[13px] font-medium">Reset demo data</p>
          <p className="mb-3 text-[13px] text-muted-foreground">Restore the original seeded boards, items, comments and notifications. All local changes are lost.</p>
          <Button variant="destructive" size="sm" disabled={!manage} onClick={() => setConfirm(true)}>
            <RotateCcw /> Reset demo data
          </Button>
          {!manage && <p className="mt-2 text-2xs text-muted-foreground">Only workspace owners and admins can reset data.</p>}
        </div>
      </div>
      )}

      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        title="Import and replace local data?"
        description={
          pendingImport && importCounts
            ? `${pendingImport.filename} contains ${importCounts.boards} boards, ${importCounts.items} items and ${importCounts.users} people (exported ${new Date(pendingImport.data.exportedAt).toLocaleString()}). Everything currently in this browser will be replaced. You will be signed out if your account is not in the file.`
            : undefined
        }
        confirmLabel="Import data"
        destructive
        onConfirm={async () => {
          if (!pendingImport) return;
          await services.repos.admin.importAll(pendingImport.data);
          queryClient.clear();
          toast.success("Data imported");
          // Full reload so auth, workspace and board queries all start from the imported state.
          window.location.assign(routes.root());
        }}
      />
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

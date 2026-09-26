"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Hash,
  Info,
  LayoutGrid,
  Minus,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Shapes,
  ShieldCheck,
  Sun,
  SunDim,
  TriangleAlert,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Team } from "@/domain";
import { useDataContext, useServices } from "@/features/data/data-context";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { AboutDialog } from "@/features/version/about-dialog";
import { ListSection } from "@/features/workspace/lists-section";
import { DangerZoneSection } from "@/features/workspace/danger-zone-section";
import { SnapshotsSection } from "@/features/workspace/snapshots-section";
import { TicketSettings } from "@/features/workspace/ticket-settings";
import { DocumentationSection } from "@/features/workspace/documentation/documentation-section";
import { useAppUpdatedNoticeSetting } from "@/features/version/app-updated-card";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { colorClasses } from "@/lib/colors";
import { canManageWorkspace } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { useThemePreference, type ThemePreference } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

const SECTIONS = ["general", "tickets", "teams", "departments", "asset-types", "permissions", "view", "snapshots", "danger", "documentation"] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Old section names still land somewhere sensible: "lists" held both lists as
 * tabs, and "rates" was a section of its own before rates moved onto the asset
 * types they belong to.
 */
const SECTION_ALIASES: Record<string, Section> = { lists: "asset-types", rates: "asset-types" };

interface SectionMeta {
  label: string;
  icon: LucideIcon;
  description: string;
  /** How wide the page runs: a column of fields, a table, or the guide. */
  width: "narrow" | "wide" | "full";
  /** The guide draws its own heading. */
  bare?: boolean;
}

const SECTION_META: Record<Section, SectionMeta> = {
  general: { label: "Overview", icon: LayoutGrid, description: "The workspace's name, address and size.", width: "narrow" },
  tickets: { label: "Tickets", icon: Hash, description: "The code every task is stamped with.", width: "narrow" },
  teams: { label: "Teams", icon: Users, description: "Teams hold boards and people. An archived team leaves the sidebar.", width: "narrow" },
  departments: { label: "Departments", icon: Building2, description: "Who the work is for: offered on the booking form, the portal and every Department column.", width: "wide" },
  "asset-types": { label: "Asset types", icon: Shapes, description: "What a deliverable can be, and how long each one takes to make.", width: "wide" },
  permissions: { label: "Roles", icon: ShieldCheck, description: "What each workspace role can do. Board roles refine it board by board.", width: "narrow" },
  view: { label: "Appearance", icon: Palette, description: "How the app looks for you, on this device.", width: "narrow" },
  documentation: { label: "Guide", icon: BookOpen, description: "How Streamline works.", width: "full", bare: true },
  snapshots: { label: "Snapshots", icon: DatabaseBackup, description: "Everything the workspace holds, saved in one file. Download it, or restore to it.", width: "wide" },
  danger: { label: "Danger zone", icon: TriangleAlert, description: "What cannot be done by accident. Admins and owners only.", width: "wide" },
};

/** The side list, in groups of what the sections are about. */
const NAV_GROUPS: Array<{ label: string; sections: Section[]; members?: boolean; about?: boolean }> = [
  { label: "Workspace", sections: ["general", "tickets", "teams"] },
  { label: "Lists", sections: ["departments", "asset-types"] },
  { label: "People", sections: ["permissions"], members: true },
  { label: "You", sections: ["view"] },
  { label: "Data", sections: ["snapshots", "danger"] },
  { label: "Help", sections: ["documentation"], about: true },
];

const WIDTH_CLASSES: Record<SectionMeta["width"], string> = { narrow: "max-w-2xl", wide: "max-w-4xl", full: "max-w-6xl" };

export function SettingsPage() {
  const ws = useWorkspace();
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get("section") ?? "";
  // On a phone the page is a list of sections to drill into, and a section
  // is a page of its own with a way back — like the phone's own settings.
  const hasSection = raw !== "";
  const isMobile = useIsMobile();
  const asked = SECTION_ALIASES[raw] ?? raw;
  let section: Section = SECTIONS.includes(asked as Section) ? (asked as Section) : "general";
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const { providerKind } = useDataContext();
  // Snapshots and the danger zone are the shared database's, and an admin's or owner's alone.
  const snapshotsOn = providerKind === "supabase" && canManageWorkspace(ws.permissions);
  const visible = (s: Section) => (s !== "snapshots" && s !== "danger") || snapshotsOn;
  if (!visible(section)) section = "general";
  const meta = SECTION_META[section];
  // A section replaces the last on a desktop, so Back leaves the page; on a
  // phone each one is a step in, and Back returns to the list.
  const go = (s: Section) => (isMobile ? router.push : router.replace)(routes.settings(ws.slug, s));
  const itemClass = (active: boolean) =>
    cn(
      "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors max-md:h-10 max-md:w-auto max-md:shrink-0 max-md:px-3 max-md:text-[14px] max-md:whitespace-nowrap",
      active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Workspace settings" description={ws.workspace.name} className={cn(hasSection && "max-md:hidden")} />
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <PhoneSectionList slug={ws.slug} visible={visible} onAbout={() => setAboutOpen(true)} className={cn("md:hidden", hasSection && "hidden")} />
        {/* Grouped down the side on desktop. */}
        <nav className="scrollbar-thin w-56 shrink-0 overflow-y-auto border-r px-3 py-3 max-md:hidden" aria-label="Settings sections">
          <div className="space-y-4 max-md:flex max-md:gap-1 max-md:space-y-0">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="max-md:contents">
                <p className="mb-1 px-2 text-2xs font-medium tracking-wide text-muted-foreground/80 uppercase max-md:hidden">{group.label}</p>
                <ul className="space-y-0.5 max-md:contents">
                  {group.sections.filter(visible).map((s) => {
                    const Icon = SECTION_META[s].icon;
                    return (
                      <li key={s} className="max-md:shrink-0">
                        <button type="button" onClick={() => go(s)} aria-current={section === s ? "page" : undefined} className={itemClass(section === s)} data-testid={`settings-nav-${s}`}>
                          <Icon className={cn("size-4 shrink-0", section === s ? "text-foreground" : "text-muted-foreground/80")} aria-hidden />
                          {SECTION_META[s].label}
                        </button>
                      </li>
                    );
                  })}
                  {group.members && (
                    <li className="max-md:shrink-0">
                      <Link href={routes.members(ws.slug)} className={itemClass(false)}>
                        <UserCog className="size-4 shrink-0 text-muted-foreground/80" aria-hidden />
                        Members
                        <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground/60" aria-hidden />
                      </Link>
                    </li>
                  )}
                  {/* About is read and closed rather than configured, so it opens as a dialog. */}
                  {group.about && (
                    <li className="max-md:shrink-0">
                      <button type="button" onClick={() => setAboutOpen(true)} className={itemClass(false)} data-testid="settings-about">
                        <Info className="size-4 shrink-0 text-muted-foreground/80" aria-hidden />
                        About
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div data-settings-content className={cn("scrollbar-thin min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-10 md:py-8", !hasSection && "max-md:hidden")}>
          <div className={WIDTH_CLASSES[meta.width]}>
            <Link href={routes.settings(ws.slug)} className="-mt-2 -ml-2 mb-3 inline-flex h-11 items-center gap-0.5 rounded-lg pr-3 pl-1 text-[15px] font-medium text-muted-foreground active:bg-accent/70 md:hidden" data-testid="settings-back">
              <ChevronLeft className="size-5" aria-hidden />
              Settings
            </Link>
            {!meta.bare && <SectionHeader meta={meta} description={meta.description} />}
            {section === "general" && <OverviewSection onGo={go} />}
            {section === "tickets" && <TicketsSection />}
            {section === "teams" && <TeamsSection />}
            {section === "departments" && <ListSection listKey="STAKEHOLDER_GROUPS" />}
            {section === "asset-types" && <ListSection listKey="ASSET_TYPES" />}
            {section === "permissions" && <PermissionsSection />}
            {section === "view" && <AppearanceSection />}
            {section === "documentation" && <DocumentationSection />}
            {section === "snapshots" && <SnapshotsSection />}
            {section === "danger" && <DangerZoneSection />}
          </div>
        </div>
        <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </div>
    </div>
  );
}

/**
 * The phone's settings: every section as a row to tap into, in the same
 * groups as the desktop's side list, with a line on what each one holds.
 */
function PhoneSectionList({ slug, visible, onAbout, className }: { slug: string; visible: (s: Section) => boolean; onAbout: () => void; className?: string }) {
  const row = "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-accent/70";
  const icon = (Icon: LucideIcon) => (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card" aria-hidden>
      <Icon className="size-[18px] text-foreground/80" />
    </span>
  );
  return (
    <nav className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-6", className)} aria-label="Settings sections">
      {NAV_GROUPS.map((group) => {
        const sections = group.sections.filter(visible);
        if (!sections.length && !group.members && !group.about) return null;
        return (
          <section key={group.label} className="mt-4 first:mt-1">
            <h2 className="mb-1.5 px-1 text-2xs font-medium tracking-wide text-muted-foreground/80 uppercase">{group.label}</h2>
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
              {sections.map((s) => (
                <li key={s}>
                  <Link href={routes.settings(slug, s)} className={row} data-testid={`settings-row-${s}`}>
                    {icon(SECTION_META[s].icon)}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">{SECTION_META[s].label}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">{SECTION_META[s].description}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  </Link>
                </li>
              ))}
              {group.members && (
                <li>
                  <Link href={routes.members(slug)} className={row}>
                    {icon(UserCog)}
                    <span className="min-w-0 flex-1 text-[15px] font-medium">Members</span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  </Link>
                </li>
              )}
              {group.about && (
                <li>
                  <button type="button" onClick={onAbout} className={row} data-testid="settings-row-about">
                    {icon(Info)}
                    <span className="min-w-0 flex-1 text-[15px] font-medium">About</span>
                  </button>
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}

/** The section's icon, name and one line on what it is for. */
function SectionHeader({ meta, description }: { meta: SectionMeta; description?: string }) {
  const Icon = meta.icon;
  return (
    <div className="mb-6 flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card shadow-xs" aria-hidden>
        <Icon className="size-5 text-foreground/80" />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg leading-tight font-semibold tracking-tight">{meta.label}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/** A group of settings on one card, with an optional heading of its own. */
function SettingsCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border/70 bg-card shadow-xs", className)}>
      {title && <h3 className="border-b border-border/60 px-4 py-2.5 text-[13px] font-semibold">{title}</h3>}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Name and address, and the size of the workspace at a glance, each figure a way into what it counts. */
function OverviewSection({ onGo }: { onGo: (section: Section) => void }) {
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
  const teams = ws.teams.filter((t) => !t.archivedAt && !t.system).length;
  const boards = ws.boards.filter((b) => !b.archivedAt && !b.system).length;
  const stats: Array<{ label: string; value: number; icon: LucideIcon; onClick?: () => void; href?: string }> = [
    { label: "Teams", value: teams, icon: Users, onClick: () => onGo("teams") },
    { label: "Boards", value: boards, icon: LayoutGrid, href: routes.browse(ws.slug) },
    { label: "People", value: ws.activeUsers.length, icon: UserCog, href: routes.members(ws.slug) },
    { label: "Tickets issued", value: ws.workspace.ticketCounter ?? 0, icon: Hash, onClick: () => onGo("tickets") },
  ];
  const tile = "group flex flex-col gap-1 rounded-xl border border-border/70 bg-card p-3.5 text-left shadow-xs transition-colors hover:border-border hover:bg-accent/40";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, onClick, href }) => {
          const body = (
            <>
              <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                <Icon className="size-3.5" aria-hidden /> {label}
              </span>
              <span className="text-2xl font-semibold tracking-tight tabular">{value.toLocaleString()}</span>
            </>
          );
          return href ? (
            <Link key={label} href={href} className={tile}>
              {body}
            </Link>
          ) : (
            <button key={label} type="button" onClick={onClick} className={tile}>
              {body}
            </button>
          );
        })}
      </div>
      <SettingsCard title="Identity">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="ws-name">Workspace name</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} className="max-w-sm" />
              {manage && (
                <Button type="submit" disabled={save.isPending || name.trim() === ws.workspace.name || !name.trim()}>
                  Save
                </Button>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Address</Label>
            <p className="font-mono text-[13px] text-muted-foreground">/workspace/{ws.slug}</p>
          </div>
        </form>
      </SettingsCard>
    </div>
  );
}

function TicketsSection() {
  const ws = useWorkspace();
  return (
    <SettingsCard>
      <TicketSettings manage={canManageWorkspace(ws.permissions)} />
    </SettingsCard>
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground tabular">{ws.teams.length} teams</p>
        <Button size="sm" onClick={() => setEditing(null)}>
          <Plus /> New team
        </Button>
      </div>
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
        {ws.teams.map((team) => {
          const memberCount = ws.teamMembers.filter((m) => m.teamId === team.id).length;
          const boardCount = ws.boards.filter((b) => b.teamId === team.id && !b.archivedAt).length;
          const colors = colorClasses(team.color);
          return (
            <li key={team.id} className={cn("flex h-14 items-center gap-3 px-3 text-[13px]", team.archivedAt && "opacity-60")}>
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", colors.soft)} aria-hidden>
                <DynamicIcon name={team.icon} className={cn("size-4", colors.text)} />
              </span>
              <span className="min-w-0 flex-1">
                <Link href={routes.team(ws.slug, team.id)} className="relative block truncate font-medium after:absolute after:inset-x-0 after:-inset-y-3 after:content-[''] hover:underline">
                  {team.name}
                </Link>
                <span className="text-2xs text-muted-foreground tabular">
                  {memberCount} {memberCount === 1 ? "member" : "members"} · {boardCount} {boardCount === 1 ? "board" : "boards"}
                </span>
              </span>
              {team.archivedAt && <Badge variant="muted">Archived</Badge>}
              {team.system && <Badge variant="primary">Built in</Badge>}
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${team.name}`} onClick={() => setEditing(team)}>
                <Pencil />
              </Button>
              {!team.system && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={team.archivedAt ? `Restore ${team.name}` : `Archive ${team.name}`}
                  onClick={() => archive.mutate({ team, archived: !team.archivedAt })}
                >
                  {team.archivedAt ? <ArchiveRestore /> : <Archive />}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <CreateTeamDialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)} team={editing ?? null} />
    </>
  );
}

/** Yes, no, or a condition, as a mark rather than a character. */
function Allowed({ value }: { value: string }) {
  if (value === "✓") return <Check className="size-4 text-green-600 dark:text-green-400" aria-label="Yes" />;
  if (value === "—") return <Minus className="size-4 text-muted-foreground/50" aria-label="No" />;
  return <span className="text-2xs text-muted-foreground">{value}</span>;
}

function PermissionsSection() {
  const rows: Array<[string, string, string, string, string]> = [
    ["View workspace boards", "✓", "✓", "✓", "Shared only"],
    ["Create boards and teams", "✓", "✓", "✓", "—"],
    ["Manage members and roles", "✓", "✓", "—", "—"],
    ["Edit any board", "✓", "✓", "If editor", "If editor"],
    ["Delete boards", "✓", "✓", "Own boards", "—"],
    ["Automations on a board", "✓", "✓", "Own boards", "—"],
    ["Allocate requests, run the portal", "✓", "✓", "—", "—"],
    ["Snapshots and the Danger zone", "✓", "✓", "—", "—"],
  ];
  return (
    // Scrolls inside its own box on the narrowest phones rather than losing a column.
    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border/70 bg-card shadow-xs">
      <table className="w-full text-[13px]">
        <thead className="bg-surface text-left text-2xs text-muted-foreground">
          <tr className="h-9">
            <th className="px-4 font-medium max-md:px-3">Can</th>
            {["Owner", "Admin", "Member", "Guest"].map((role) => (
              <th key={role} className="px-3 text-center font-medium max-md:px-1.5">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map(([cap, ...cells]) => (
            <tr key={cap} className="h-10">
              <td className="px-4 max-md:px-3">{cap}</td>
              {cells.map((c, i) => (
                <td key={i} className="px-3 max-md:px-1.5">
                  <span className="flex justify-center">
                    <Allowed value={c} />
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon; swatch: string }> = [
  { value: "light", label: "Light", icon: Sun, swatch: "bg-white" },
  { value: "dim", label: "Dim", icon: SunDim, swatch: "bg-slate-600" },
  { value: "dark", label: "Dark", icon: Moon, swatch: "bg-slate-900" },
  { value: "system", label: "System", icon: Monitor, swatch: "bg-[linear-gradient(90deg,#ffffff_50%,#0f172a_50%)]" },
];

/** Personal display preferences: kept in this browser, seen by nobody else. */
function AppearanceSection() {
  const showTeamCounts = useUiStore((s) => s.showTeamCounts);
  const setShowTeamCounts = useUiStore((s) => s.setShowTeamCounts);
  const [theme, setTheme] = useThemePreference();
  const [appUpdated, setAppUpdated] = useAppUpdatedNoticeSetting();

  return (
    <div className="space-y-5">
      <SettingsCard title="Theme">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(({ value, label, icon: Icon, swatch }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors",
                theme === value ? "border-foreground/60 ring-2 ring-ring/30" : "border-border/70 hover:border-border hover:bg-accent/40",
              )}
              data-testid={`setting-theme-${value}`}
            >
              <span className={cn("h-12 w-full rounded-md border border-border/60", swatch)} aria-hidden />
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden /> {label}
              </span>
            </button>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard title="Sidebar">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="show-team-counts" className="text-[13px] font-medium">
            Item counts beside teams
          </Label>
          <Switch id="show-team-counts" aria-label="Item counts beside teams" checked={showTeamCounts} onCheckedChange={setShowTeamCounts} data-testid="setting-team-counts" />
        </div>
      </SettingsCard>
      <SettingsCard title="Updates">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="show-app-updated" className="text-[13px] font-medium">
            What&apos;s new after an update
          </Label>
          <Switch id="show-app-updated" aria-label="What's new after an update" checked={appUpdated} onCheckedChange={setAppUpdated} data-testid="setting-app-updated" />
        </div>
      </SettingsCard>
    </div>
  );
}


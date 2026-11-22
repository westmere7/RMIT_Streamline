"use client";

import { Archive, ChevronDown, ChevronRight, FileSpreadsheet, FileText, MoreHorizontal, Plus, Search, SquareKanban, Star, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { MenuSheet } from "@/components/layout/menu-sheet";
import type { MenuAction } from "@/components/layout/row-menu";
import { SidebarActionsHost, useBoardRowActions, useSidebarActions, useTeamMenuActions } from "@/components/layout/sidebar";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board, Team } from "@/domain";
import { BoardItemCount, TeamItemCount } from "@/features/boards/board-item-count";
import { useTrackers } from "@/features/trackers/hooks";
import { useDocs } from "@/features/docs/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canCreateBoard, canCreateTeam, canEditDocs, canEditTrackers, canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn, pluralize } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

/**
 * The workspace's directory, as a screen rather than a sidebar.
 *
 * Everything the sidebar lists — favourites, teams and their boards, boards with
 * no team, trackers — reachable with a thumb and filterable by name, because a
 * phone cannot show forty rows at once the way a tall sidebar can.
 */
export function BrowsePage() {
  // The sidebar's dialogs, so a board's or a team's menu here opens what it opens there.
  return (
    <SidebarActionsHost>
      <BrowseBody />
    </SidebarActionsHost>
  );
}

function BrowseBody() {
  const ws = useWorkspace();
  const sidebar = useSidebarActions();
  const trackers = useTrackers().data ?? [];
  const docs = useDocs().data ?? [];
  const [query, setQuery] = React.useState("");
  const [newMenu, setNewMenu] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  // The same switches as the sidebar's (Settings → Appearance), on this device.
  const showTeamCounts = useUiStore((s) => s.showTeamCounts);

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);

  const boards = ws.boards.filter((b) => b.archivedAt === null && canViewBoard(ws.permissions, b));
  const favourites = boards.filter((b) => ws.isFavourite(b.id) && matches(b.name));
  const teams = ws.teams.filter((t) => t.archivedAt === null);
  const boardsForTeam = (team: Team) => boards.filter((b) => b.teamId === team.id && matches(b.name));
  const looseBoards = boards.filter((b) => !b.teamId && matches(b.name));
  const visibleTrackers = trackers.filter((t) => matches(t.name));
  const visibleDocs = docs.filter((d) => matches(d.title));
  // Archived boards, as the sidebar keeps them: folded away until asked for.
  const archived = ws.boards.filter((b) => b.archivedAt !== null && canViewBoard(ws.permissions, b) && matches(b.name));
  // The sidebar's New menu, which a phone has no sidebar for.
  const newActions: MenuAction[] = [
    ...(canCreateBoard(ws.permissions) ? [{ type: "item", label: "Board", icon: <SquareKanban />, onSelect: () => sidebar.newBoard(), testId: "browse-new-board-item" } satisfies MenuAction] : []),
    ...(canEditTrackers(ws.permissions) ? [{ type: "item", label: "Tracker", icon: <FileSpreadsheet />, onSelect: () => sidebar.newTrackerInTeam(null), testId: "browse-new-tracker" } satisfies MenuAction] : []),
    ...(canEditDocs(ws.permissions) ? [{ type: "item", label: "Doc", icon: <FileText />, onSelect: () => sidebar.newDocInTeam(null), testId: "browse-new-doc" } satisfies MenuAction] : []),
    ...(canCreateTeam(ws.permissions) ? [{ type: "item", label: "Team", icon: <Users />, onSelect: () => sidebar.newTeam(), testId: "browse-new-team" } satisfies MenuAction] : []),
  ];

  const nothing = favourites.length === 0 && looseBoards.length === 0 && visibleTrackers.length === 0 && visibleDocs.length === 0 && teams.every((t) => boardsForTeam(t).length === 0 && !matches(t.name));

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-8">
        <h1 className="sr-only">Browse the workspace</h1>
        <div className="mb-4 flex items-center gap-2">
          <label className="relative flex min-w-0 flex-1 items-center">
            <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <span className="sr-only">Filter boards, teams and trackers</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter boards, teams, trackers"
              className="h-11 pl-9 text-base"
              data-testid="browse-filter"
            />
          </label>
          {newActions.length > 0 && (
            <Button type="button" variant="outline" className="h-11 shrink-0 px-3" onClick={() => setNewMenu(true)} data-testid="browse-new-board">
              <Plus /> New
            </Button>
          )}
        </div>
        <MenuSheet open={newMenu} onOpenChange={setNewMenu} title="Add new" actions={newActions} />

        {nothing && <p className="px-1 py-8 text-center text-[15px] text-muted-foreground">Nothing matches “{query}”.</p>}

        {favourites.length > 0 && (
          <Section title="Favourites" icon={Star}>
            {favourites.map((board) => (
              <BoardRow key={board.id} board={board} />
            ))}
          </Section>
        )}

        {teams.map((team) => {
          const teamBoards = boardsForTeam(team);
          if (teamBoards.length === 0 && !matches(team.name)) return null;
          // Counted over all the team's boards, not just those the filter leaves.
          const allTeamBoards = boards.filter((b) => b.teamId === team.id);
          return (
            <Section
              key={team.id}
              title={team.name}
              iconNode={<DynamicIcon name={team.icon} className={cn("size-4", colorClasses(team.color).text)} />}
              badge={showTeamCounts && allTeamBoards.length > 0 ? <TeamItemCount boardIds={allTeamBoards.map((b) => b.id)} color={team.color} /> : undefined}
              action={{ href: routes.team(ws.slug, team.id), label: "Open team" }}
              menu={<TeamMenu team={team} />}
              empty={teamBoards.length === 0 ? "No boards yet" : undefined}
            >
              {teamBoards.map((board) => (
                <BoardRow key={board.id} board={board} />
              ))}
            </Section>
          );
        })}

        {looseBoards.length > 0 && (
          <Section title="Other boards" icon={SquareKanban}>
            {looseBoards.map((board) => (
              <BoardRow key={board.id} board={board} />
            ))}
          </Section>
        )}

        {visibleTrackers.length > 0 && (
          <Section title="Trackers" icon={FileSpreadsheet} action={{ href: routes.trackers(ws.slug), label: "All trackers" }}>
            {visibleTrackers.map((tracker) => (
              <Row key={tracker.id} href={routes.tracker(ws.slug, tracker.id)} title={tracker.name} meta={tracker.description ?? undefined}>
                <FileSpreadsheet className="size-4 text-muted-foreground" />
              </Row>
            ))}
          </Section>
        )}

        {visibleDocs.length > 0 && (
          <Section title="Docs" icon={FileText} action={{ href: routes.docs(ws.slug), label: "All docs" }}>
            {visibleDocs.map((doc) => (
              <Row key={doc.id} href={routes.doc(ws.slug, doc.id)} title={doc.title} meta={doc.kind === "pdf" ? "PDF" : undefined}>
                {doc.icon ? <span className="text-base leading-none">{doc.icon}</span> : <FileText className="size-4 text-muted-foreground" />}
              </Row>
            ))}
          </Section>
        )}

        {archived.length > 0 && (
          <section className="mb-5">
            <button type="button" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived} className="mb-1.5 flex h-11 w-full items-center gap-2 px-1 text-left" data-testid="browse-archived-toggle">
              <Archive className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-semibold tracking-tight">Archived boards</span>
              <span className="text-2xs text-muted-foreground tabular">{archived.length}</span>
              <span className="flex-1" />
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !showArchived && "-rotate-90")} />
            </button>
            {showArchived && (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card" data-testid="browse-archived">
                {archived.map((board) => (
                  <BoardRow key={board.id} board={board} />
                ))}
              </ul>
            )}
          </section>
        )}

        <Section title="Everyone" icon={Users}>
          <Row href={routes.members(ws.slug)} title="Members" meta={pluralize(ws.users.length, "person", "people")}>
            <Users className="size-4 text-muted-foreground" />
          </Row>
        </Section>
      </div>
    </div>
  );
}

export function BrowsePageSkeleton() {
  return (
    <div className="space-y-3 p-4">
      <Skeleton className="h-11" />
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  iconNode,
  badge,
  action,
  menu,
  empty,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconNode?: React.ReactNode;
  /** Beside the title: a team's task count. */
  badge?: React.ReactNode;
  action?: { href: string; label: string };
  /** A "…" after the action: a team's menu. */
  menu?: React.ReactNode;
  /** Said on one dashed line, as on a team's page, when there is nothing to list. */
  empty?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        {iconNode ?? (Icon ? <Icon className="size-4 text-muted-foreground" /> : null)}
        <h2 className="min-w-0 truncate text-[13px] font-semibold tracking-tight">{title}</h2>
        {badge}
        <span className="flex-1" />
        {action && (
          <Link href={action.href} className="flex h-11 items-center px-1 text-2xs font-medium text-muted-foreground">
            {action.label}
          </Link>
        )}
        {menu}
      </div>
      {empty ? (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-2.5 text-[13px] text-muted-foreground" data-testid="browse-empty">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">{children}</ul>
      )}
    </section>
  );
}

function BoardRow({ board }: { board: Board }) {
  const ws = useWorkspace();
  const actions = useBoardRowActions(board);
  return (
    <Row
      href={ws.boardPath(board)}
      title={board.name}
      meta={board.description ?? undefined}
      trailing={board.archivedAt ? undefined : <BoardItemCount boardId={board.id} />}
      menu={<MenuButton label={`Options for ${board.name}`} title={board.name} actions={actions} testId="browse-board-menu" />}
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", colorClasses(board.color).solid)}>
        <DynamicIcon name={board.icon} className="size-4" />
      </span>
    </Row>
  );
}

/** One tappable line: 56px tall, the whole width of it a target. */
function Row({ href, title, meta, trailing, menu, children }: { href: string; title: string; meta?: string; trailing?: React.ReactNode; menu?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex items-center">
      <Link href={href} className={cn("flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-3 active:bg-accent/70", menu ? "pr-1" : "pr-3")}>
        {children}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{title}</span>
          {meta && <span className="block truncate text-[13px] text-muted-foreground">{meta}</span>}
        </span>
        {trailing}
        {!menu && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />}
      </Link>
      {menu}
    </li>
  );
}

/** "…" opening a menu as a sheet: a board's or a team's, the same list the desktop sidebar shows. */
function MenuButton({ label, title, actions, testId }: { label: string; title: string; actions: MenuAction[]; testId: string }) {
  const [open, setOpen] = React.useState(false);
  if (actions.length === 0) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} className="flex size-11 shrink-0 items-center justify-center text-muted-foreground active:bg-accent/70" data-testid={testId}>
        <MoreHorizontal className="size-5" />
      </button>
      <MenuSheet open={open} onOpenChange={setOpen} title={title} actions={actions} />
    </>
  );
}

function TeamMenu({ team }: { team: Team }) {
  const actions = useTeamMenuActions(team);
  return <MenuButton label={`Options for ${team.name}`} title={team.name} actions={actions} testId="browse-team-menu" />;
}

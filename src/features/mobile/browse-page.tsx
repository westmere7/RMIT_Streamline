"use client";

import { ChevronRight, FileSpreadsheet, Search, SquareKanban, Star, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board, Team } from "@/domain";
import { useTrackers } from "@/features/trackers/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canViewBoard } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn, pluralize } from "@/lib/utils";

/**
 * The workspace's directory, as a screen rather than a sidebar.
 *
 * Everything the sidebar lists — favourites, teams and their boards, boards with
 * no team, trackers — reachable with a thumb and filterable by name, because a
 * phone cannot show forty rows at once the way a tall sidebar can.
 */
export function BrowsePage() {
  const ws = useWorkspace();
  const trackers = useTrackers().data ?? [];
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);

  const boards = ws.boards.filter((b) => b.archivedAt === null && canViewBoard(ws.permissions, b));
  const favourites = boards.filter((b) => ws.isFavourite(b.id) && matches(b.name));
  const teams = ws.teams.filter((t) => t.archivedAt === null);
  const boardsForTeam = (team: Team) => boards.filter((b) => b.teamId === team.id && matches(b.name));
  const looseBoards = boards.filter((b) => !b.teamId && matches(b.name));
  const visibleTrackers = trackers.filter((t) => matches(t.name));

  const nothing = favourites.length === 0 && looseBoards.length === 0 && visibleTrackers.length === 0 && teams.every((t) => boardsForTeam(t).length === 0 && !matches(t.name));

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain">
      <div className="px-4 pt-4 pb-8">
        <h1 className="sr-only">Browse the workspace</h1>
        <label className="relative mb-4 flex items-center">
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
          return (
            <Section
              key={team.id}
              title={team.name}
              iconNode={<DynamicIcon name={team.icon} className={cn("size-4", colorClasses(team.color).text)} />}
              action={{ href: routes.team(ws.slug, team.id), label: "Open team" }}
            >
              {teamBoards.map((board) => (
                <BoardRow key={board.id} board={board} />
              ))}
              {teamBoards.length === 0 && <p className="px-3 py-2.5 text-[13px] text-muted-foreground">No boards here yet.</p>}
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
  action,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconNode?: React.ReactNode;
  action?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        {iconNode ?? (Icon ? <Icon className="size-4 text-muted-foreground" /> : null)}
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">{title}</h2>
        {action && (
          <Link href={action.href} className="flex h-11 items-center px-1 text-2xs font-medium text-muted-foreground">
            {action.label}
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">{children}</ul>
    </section>
  );
}

function BoardRow({ board }: { board: Board }) {
  const ws = useWorkspace();
  return (
    <Row href={ws.boardPath(board)} title={board.name} meta={board.description ?? undefined}>
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", colorClasses(board.color).solid)}>
        <DynamicIcon name={board.icon} className="size-4" />
      </span>
    </Row>
  );
}

/** One tappable line: 56px tall, the whole width of it a target. */
function Row({ href, title, meta, children }: { href: string; title: string; meta?: string; children?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-3 py-2 active:bg-accent/70">
        {children}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{title}</span>
          {meta && <span className="block truncate text-[13px] text-muted-foreground">{meta}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
      </Link>
    </li>
  );
}

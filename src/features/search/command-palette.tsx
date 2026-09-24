"use client";

import { useQuery } from "@tanstack/react-query";
import { Archive, FileSpreadsheet, Globe, Home, Inbox, Layers, ListTodo, LoaderCircle, Settings, SquareKanban, UserRound, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import { colorClasses } from "@/lib/colors";
import { canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { useUiStore } from "@/stores/ui-store";

/**
 * What a search is for.
 *
 * Everything by default, so a search can start the moment the palette opens,
 * with the results grouped by kind. One kind narrows it when a word means
 * several things at once — "Linh" is a person, a team and part of several
 * task names.
 */
const SEARCH_KINDS = ["all", "items", "boards", "teams", "people"] as const;
type SearchKind = (typeof SEARCH_KINDS)[number];
const SEARCH_KIND_LABELS: Record<SearchKind, { label: string; placeholder: string; icon: React.ComponentType<{ className?: string }> }> = {
  all: { label: "All", placeholder: "Search items, boards, teams and people…", icon: Layers },
  items: { label: "Items", placeholder: "Search items by name or booking code…", icon: ListTodo },
  boards: { label: "Boards", placeholder: "Search boards…", icon: SquareKanban },
  teams: { label: "Teams", placeholder: "Search teams…", icon: Users },
  people: { label: "People", placeholder: "Search people by name…", icon: UserRound },
};

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const ws = useWorkspace();
  const services = useServices();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<SearchKind>("all");
  const debounced = useDebouncedValue(query.trim(), 150);
  // Off every time search opens. The archive is where finished work goes, so
  // including it by default would answer a question nobody asked - and it costs
  // a second read of every board.
  const [includeArchived, setIncludeArchived] = React.useState(false);

  // The board being viewed, if any — the default scope when search opens.
  const viewedBoard = React.useMemo(() => {
    const slug = /\/boards\/([^/?#]+)/.exec(pathname ?? "")?.[1];
    return slug ? (ws.boards.find((b) => b.slug === slug) ?? null) : null;
  }, [pathname, ws.boards]);

  // Defaults to what is on screen; the chips below the input override it.
  const chosenScope = useUiStore((s) => s.searchScope);
  const setScope = useUiStore((s) => s.setSearchScope);
  const scope = chosenScope ?? (viewedBoard ? "view" : "workspace");
  // A board chosen as the scope narrows the items to that board. Boards, teams
  // and people are the workspace's whichever scope is on, so the kind stays the
  // reader's to pick either way.
  const scopedBoard = scope === "view" ? viewedBoard : null;
  const wants = (option: Exclude<SearchKind, "all">) => kind === "all" || kind === option;

  const results = useQuery({
    queryKey: [...queryKeys.search(ws.workspace.id, debounced), includeArchived],
    queryFn: () => services.search.search(ws.workspace.id, debounced, { includeArchived }),
    enabled: open && debounced.length > 0,
    staleTime: 5_000,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const data = results.data;
  const visibleBoards = wants("boards") ? (data?.boards.filter((b) => canViewBoard(ws.permissions, b)) ?? []) : [];
  const visibleItems = wants("items") ? (data?.items.filter(({ board }) => canViewBoard(ws.permissions, board) && (!scopedBoard || board.id === scopedBoard.id)) ?? []) : [];
  const teams = wants("teams") ? (data?.teams ?? []) : [];
  const people = wants("people") ? (data?.users ?? []) : [];
  const hasResults = visibleBoards.length + visibleItems.length + teams.length + people.length > 0;

  return (
    <CommandDialog
      shouldFilter={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setKind("all");
          setIncludeArchived(false);
        }
      }}
    >
      <CommandInput
        placeholder={scopedBoard && kind === "items" ? `Search items in ${scopedBoard.name}…` : scopedBoard && kind === "all" ? `Search ${scopedBoard.name}, and boards, teams and people…` : SEARCH_KIND_LABELS[kind].placeholder}
        value={query}
        onValueChange={setQuery}
        data-testid="palette-input"
      />
      {/* What, then where. Both rows are always there: choosing a board to
          search in used to take the kinds away with it. */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5" data-testid="palette-kinds">
        <span className="text-2xs text-muted-foreground">Looking for</span>
        {SEARCH_KINDS.map((option) => {
          const Icon = SEARCH_KIND_LABELS[option].icon;
          return (
            <ScopeChip key={option} active={kind === option} onClick={() => setKind(option)} testId={`palette-kind-${option}`}>
              <Icon className="size-3" /> {SEARCH_KIND_LABELS[option].label}
            </ScopeChip>
          );
        })}
      </div>
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
        <span className="text-2xs text-muted-foreground">Search in</span>
        {viewedBoard && (
          <ScopeChip active={scope === "view"} onClick={() => setScope("view")}>
            <DynamicIcon name={viewedBoard.icon} className={cn("size-3", colorClasses(viewedBoard.color).text)} />
            <span className="max-w-40 truncate">{viewedBoard.name}</span>
          </ScopeChip>
        )}
        <ScopeChip active={scope === "workspace"} onClick={() => setScope("workspace")}>
          <Globe className="size-3" /> Everywhere
        </ScopeChip>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
        <ScopeChip active={includeArchived} onClick={() => setIncludeArchived((v) => !v)} testId="search-include-archived">
          <Archive className="size-3" /> Archived
        </ScopeChip>
      </div>
      <CommandList>
        {debounced.length > 0 && results.isFetching && (
          <p className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-muted-foreground" data-testid="palette-loading">
            <LoaderCircle className="size-3.5 animate-spin" /> Searching…
          </p>
        )}
        {debounced.length > 0 && !results.isFetching && !hasResults && <CommandEmpty>No {kind === "all" ? "results" : SEARCH_KIND_LABELS[kind].label.toLowerCase()} for “{debounced}”.</CommandEmpty>}
        {debounced.length === 0 && kind !== "all" && (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            Type to search {SEARCH_KIND_LABELS[kind].label.toLowerCase()}
            {kind === "items" && scopedBoard ? ` in ${scopedBoard.name}` : ""}.
          </p>
        )}
        {debounced.length === 0 && kind === "all" && (
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => go(routes.workspace(ws.slug))}>
              <Home /> Home
            </CommandItem>
            <CommandItem onSelect={() => go(routes.myWork(ws.slug))}>
              <ListTodo /> My Work
            </CommandItem>
            <CommandItem onSelect={() => go(routes.inbox(ws.slug))}>
              <Inbox /> Inbox
            </CommandItem>
            <CommandItem onSelect={() => go(routes.trackers(ws.slug))}>
              <FileSpreadsheet /> Trackers
            </CommandItem>
            <CommandItem onSelect={() => go(routes.members(ws.slug))}>
              <Users /> Members
            </CommandItem>
            <CommandItem onSelect={() => go(routes.settings(ws.slug))}>
              <Settings /> Settings
            </CommandItem>
          </CommandGroup>
        )}
        {visibleBoards.length > 0 && (
          <CommandGroup heading="Boards">
            {visibleBoards.map((board) => (
              <CommandItem key={board.id} value={`board-${board.id}`} onSelect={() => go(ws.boardPath(board))}>
                <DynamicIcon name={board.icon} className={colorClasses(board.color).text} />
                <span className="truncate">{board.name}</span>
                <span className="ml-auto truncate text-2xs text-muted-foreground">{ws.teamById(board.teamId)?.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {visibleItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Items">
              {visibleItems.map(({ item, board, archived }) => (
                <CommandItem
                  key={item.id}
                  value={`item-${item.id}`}
                  data-archived={archived ? "true" : undefined}
                  // An archived hit opens where it actually lives: the board's
                  // archive, with the task open. Sending it to the board would
                  // land on a row that is not there.
                  onSelect={() => go(archived ? routes.boardArchive(ws.slug, board.slug, { itemId: item.id }) : ws.boardPath(board, { itemId: item.id }))}
                >
                  {archived ? <Archive /> : <ListTodo />}
                  <span className="truncate">{item.name}</span>
                  {archived && (
                    <span className="shrink-0 rounded-full bg-surface-strong px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">Archived</span>
                  )}
                  {/* Searching by booking code should show the code that matched. */}
                  {item.ticket && <span className="shrink-0 font-mono text-2xs text-muted-foreground/70 tabular">{item.ticket}</span>}
                  <span className="ml-auto truncate text-2xs text-muted-foreground">{board.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {teams.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Teams">
              {teams.map((team) => (
                <CommandItem key={team.id} value={`team-${team.id}`} onSelect={() => go(routes.team(ws.slug, team.id))}>
                  <DynamicIcon name={team.icon} className={colorClasses(team.color).text} />
                  <span className="truncate">{team.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {people.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="People">
              {people.map((user) => (
                <CommandItem key={user.id} value={`user-${user.id}`} onSelect={() => go(`${routes.members(ws.slug)}?q=${encodeURIComponent(user.displayName)}`)}>
                  <UserAvatar user={user} size="xs" tooltip={false} />
                  <span className="truncate">{user.displayName}</span>
                  <span className="ml-auto truncate text-2xs text-muted-foreground">{user.jobTitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** One selectable search scope. */
function ScopeChip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex h-6 items-center gap-1 rounded-full border px-2 text-2xs font-medium transition-colors",
        active ? "border-primary/40 bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

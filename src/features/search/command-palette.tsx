"use client";

import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Globe, Home, Inbox, ListTodo, Settings, Users } from "lucide-react";
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

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const ws = useWorkspace();
  const services = useServices();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const debounced = useDebouncedValue(query.trim(), 150);

  // The board being viewed, if any — the default scope when search opens.
  const viewedBoard = React.useMemo(() => {
    const slug = /\/boards\/([^/?#]+)/.exec(pathname ?? "")?.[1];
    return slug ? (ws.boards.find((b) => b.slug === slug) ?? null) : null;
  }, [pathname, ws.boards]);

  // Defaults to what is on screen; the chips below the input override it.
  const chosenScope = useUiStore((s) => s.searchScope);
  const setScope = useUiStore((s) => s.setSearchScope);
  const scope = chosenScope ?? (viewedBoard ? "view" : "workspace");
  const scopedBoard = scope === "view" ? viewedBoard : null;

  const results = useQuery({
    queryKey: queryKeys.search(ws.workspace.id, debounced),
    queryFn: () => services.search.search(ws.workspace.id, debounced),
    enabled: open && debounced.length > 0,
    staleTime: 5_000,
  });

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const data = results.data;
  const visibleBoards = scopedBoard ? [] : (data?.boards.filter((b) => canViewBoard(ws.permissions, b)) ?? []);
  const visibleItems = data?.items.filter(({ board }) => canViewBoard(ws.permissions, board) && (!scopedBoard || board.id === scopedBoard.id)) ?? [];
  const teams = scopedBoard ? [] : (data?.teams ?? []);
  const people = scopedBoard ? [] : (data?.users ?? []);
  const hasResults = visibleBoards.length + visibleItems.length + teams.length + people.length > 0;

  return (
    <CommandDialog
      shouldFilter={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <CommandInput
        placeholder={scopedBoard ? `Search items in ${scopedBoard.name}…` : "Search boards, items, teams and people…"}
        value={query}
        onValueChange={setQuery}
      />
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
      </div>
      <CommandList>
        {debounced.length > 0 && !results.isLoading && !hasResults && <CommandEmpty>No results for “{debounced}”.</CommandEmpty>}
        {debounced.length === 0 && scopedBoard && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Type to search items in this board.</p>}
        {debounced.length === 0 && !scopedBoard && (
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
              {visibleItems.map(({ item, board }) => (
                <CommandItem key={item.id} value={`item-${item.id}`} onSelect={() => go(ws.boardPath(board, { itemId: item.id }))}>
                  <ListTodo />
                  <span className="truncate">{item.name}</span>
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
function ScopeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-6 items-center gap-1 rounded-full border px-2 text-2xs font-medium transition-colors",
        active ? "border-primary/40 bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Home, Inbox, ListTodo, Settings, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
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
  const [query, setQuery] = React.useState("");
  const debounced = useDebouncedValue(query.trim(), 150);

  const results = useQuery({
    queryKey: queryKeys.search(ws.workspace.id, debounced),
    queryFn: () => services.search.search(ws.workspace.id, debounced),
    enabled: open && debounced.length > 0,
    staleTime: 5_000,
  });

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const data = results.data;
  const visibleBoards = data?.boards.filter((b) => canViewBoard(ws.permissions, b)) ?? [];
  const visibleItems = data?.items.filter(({ board }) => canViewBoard(ws.permissions, board)) ?? [];
  const hasResults = visibleBoards.length + visibleItems.length + (data?.teams.length ?? 0) + (data?.users.length ?? 0) > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search boards, items, teams and people…" value={query} onValueChange={setQuery} />
      <CommandList>
        {debounced.length > 0 && !results.isLoading && !hasResults && <CommandEmpty>No results for “{debounced}”.</CommandEmpty>}
        {debounced.length === 0 && (
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
        {data && data.teams.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Teams">
              {data.teams.map((team) => (
                <CommandItem key={team.id} value={`team-${team.id}`} onSelect={() => go(routes.team(ws.slug, team.id))}>
                  <DynamicIcon name={team.icon} className={colorClasses(team.color).text} />
                  <span className="truncate">{team.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {data && data.users.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="People">
              {data.users.map((user) => (
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

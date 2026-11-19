"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserMinus, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Team } from "@/domain";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageTeam } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";

/**
 * A team's people, to add and take off: on the team's page, and in Edit team.
 * Each change is saved at once, as anywhere else people are added.
 */
export function TeamMembersEditor({ team, heading }: { team: Team; heading?: (add: React.ReactNode, count: number) => React.ReactNode }) {
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const manage = canManageTeam(ws.permissions, team.id);
  const members = ws.teamMembers.filter((m) => m.teamId === team.id).map((m) => ({ membership: m, user: ws.userById(m.userId) }));
  const candidates = ws.activeUsers.filter((u) => !members.some((m) => m.user?.id === u.id));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
  const addMember = useMutation({
    mutationFn: (userId: string) => services.workspace.addTeamMember(team.id, userId),
    onSuccess: async (_m, userId) => {
      await invalidate();
      toast.success(`${ws.userById(userId)?.firstName ?? "Member"} added to ${team.name}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not add them"),
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => services.workspace.removeTeamMember(team.id, userId),
    onSuccess: invalidate,
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not remove them"),
  });

  const add = manage ? (
    <Popover open={addOpen} onOpenChange={setAddOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid="team-member-add">
          <Plus /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search people…" />
          <CommandList>
            <CommandEmpty>Everyone is already in this team.</CommandEmpty>
            <CommandGroup>
              {candidates.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.displayName} ${user.email}`}
                  onSelect={() => {
                    addMember.mutate(user.id);
                    setAddOpen(false);
                  }}
                >
                  <UserAvatar user={user} size="xs" tooltip={false} />
                  <span className="truncate">{user.displayName}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  ) : null;

  return (
    <>
      {heading ? heading(add, members.length) : null}
      <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs" data-testid="team-members-list">
        {members.map(({ membership, user }) => (
          <li key={membership.id} className="group flex h-11 items-center gap-2.5 px-3 text-[13px]">
            <UserAvatar user={user} size="md" tooltip={false} />
            <span className="min-w-0 flex-1">
              {user ? (
                <Link href={routes.person(ws.slug, user.id)} className="block truncate font-medium hover:underline max-md:flex max-md:min-h-11 max-md:items-center">
                  {user.displayName}
                </Link>
              ) : (
                <span className="block truncate font-medium">Unknown</span>
              )}
              <span className="block truncate text-2xs text-muted-foreground">{user?.jobTitle}</span>
            </span>
            {membership.role === "LEAD" && <Badge variant="primary">Lead</Badge>}
            {manage && user && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${user.displayName}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => removeMember.mutate(user.id)}
              >
                {membership.role === "LEAD" ? <UserMinus /> : <X />}
              </Button>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="px-3 py-3 text-[13px] text-muted-foreground">Nobody yet.</li>}
      </ul>
    </>
  );
}

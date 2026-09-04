"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, FileSpreadsheet, LayoutGrid, Pencil, Plus, UserMinus, Users, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionHeading } from "@/components/shared/page-header";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreateBoardDialog } from "@/features/boards/components/create-board-dialog";
import { CreateTrackerDialog } from "@/features/trackers/create-tracker-dialog";
import { useTrackers } from "@/features/trackers/hooks";
import { useServices } from "@/features/data/data-context";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canCreateBoard, canEditTrackers, canManageTeam, canViewBoard } from "@/lib/permissions/permissions";
import { queryKeys } from "@/lib/query/keys";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export function TeamPage() {
  const params = useParams<{ teamId: string }>();
  const ws = useWorkspace();
  const services = useServices();
  const queryClient = useQueryClient();
  const router = useRouter();
  const team = ws.teamById(params.teamId);
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [createBoardOpen, setCreateBoardOpen] = React.useState(false);
  const [createTrackerOpen, setCreateTrackerOpen] = React.useState(false);
  const trackersQuery = useTrackers();
  const teamTrackers = (trackersQuery.data ?? []).filter((t) => t.teamId === params.teamId);
  const [addOpen, setAddOpen] = React.useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
  const addMember = useMutation({
    mutationFn: (userId: string) => services.workspace.addTeamMember(team!.id, userId),
    onSuccess: async (_m, userId) => {
      await invalidate();
      toast.success(`${ws.userById(userId)?.firstName ?? "Member"} added to ${team?.name}`);
    },
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => services.workspace.removeTeamMember(team!.id, userId),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: () => services.workspace.archiveTeam(team!.id, true),
    onSuccess: async () => {
      await invalidate();
      toast.success(`${team?.name} archived`);
      router.push(routes.workspace(ws.slug));
    },
  });

  if (!team) {
    return <EmptyState icon={Users} title="Team not found" description="It may have been removed." action={<Button variant="outline" asChild><Link href={routes.workspace(ws.slug)}>Back to home</Link></Button>} />;
  }

  const manage = canManageTeam(ws.permissions, team.id);
  const members = ws.teamMembers.filter((m) => m.teamId === team.id).map((m) => ({ membership: m, user: ws.userById(m.userId) }));
  const boards = ws.boardsForTeam(team.id).filter((b) => canViewBoard(ws.permissions, b));
  const candidates = ws.users.filter((u) => u.deactivatedAt === null && !members.some((m) => m.user?.id === u.id));
  const colors = colorClasses(team.color);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={cn("flex size-10 items-center justify-center rounded-md", colors.solid)}>
              <DynamicIcon name={team.icon} className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{team.name}</h1>
              <p className="text-[13px] text-muted-foreground">{team.description ?? "No description yet."}</p>
              {team.archivedAt && <Badge variant="muted" className="mt-1">Archived</Badge>}
            </div>
          </div>
          {manage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
              {!team.archivedAt && (
                <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
                  <Archive /> Archive
                </Button>
              )}
            </div>
          )}
        </header>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <SectionHeading
              action={
                canCreateBoard(ws.permissions) && (
                  <Button variant="ghost" size="sm" onClick={() => setCreateBoardOpen(true)}>
                    <Plus /> New board
                  </Button>
                )
              }
            >
              Boards
            </SectionHeading>
            {boards.length === 0 ? (
              <EmptyState icon={LayoutGrid} title="No boards yet" description="Create a board for this team to start tracking work." compact />
            ) : (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
                {boards.map((board) => (
                  <li key={board.id}>
                    <Link href={ws.boardPath(board)} className="flex h-11 items-center gap-3 px-3 text-[13px] hover:bg-accent">
                      <DynamicIcon name={board.icon} className={cn("size-4", colorClasses(board.color).text)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{board.name}</span>
                        {board.description && <span className="block truncate text-2xs text-muted-foreground">{board.description}</span>}
                      </span>
                      <Badge variant="muted">{board.visibility.toLowerCase()}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-8">
              <SectionHeading
                action={
                  canEditTrackers(ws.permissions) && (
                    <Button variant="ghost" size="sm" onClick={() => setCreateTrackerOpen(true)} data-testid="team-new-tracker">
                      <Plus /> New tracker
                    </Button>
                  )
                }
              >
                Trackers
              </SectionHeading>
              {teamTrackers.length === 0 ? (
                <EmptyState icon={FileSpreadsheet} title="No trackers yet" description="Spreadsheets for this team — asset trackers, production logs — that used to live in Excel." compact />
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
                  {teamTrackers.map((tracker) => (
                    <li key={tracker.id}>
                      <Link href={routes.tracker(ws.slug, tracker.id)} className="flex h-11 items-center gap-3 px-3 text-[13px] hover:bg-accent">
                        <FileSpreadsheet className="size-4 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{tracker.name}</span>
                          {tracker.description && <span className="block truncate text-2xs text-muted-foreground">{tracker.description}</span>}
                        </span>
                        <Badge variant="muted">tracker</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <SectionHeading
              action={
                manage && (
                  <Popover open={addOpen} onOpenChange={setAddOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="sm">
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
                )
              }
            >
              Members · {members.length}
            </SectionHeading>
            <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
              {members.map(({ membership, user }) => (
                <li key={membership.id} className="group flex h-11 items-center gap-2.5 px-3 text-[13px]">
                  <UserAvatar user={user} size="md" tooltip={false} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{user?.displayName ?? "Unknown"}</span>
                    <span className="block truncate text-2xs text-muted-foreground">{user?.jobTitle}</span>
                  </span>
                  {membership.role === "LEAD" && <Badge variant="primary">Lead</Badge>}
                  {manage && user && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${user.displayName}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => removeMember.mutate(user.id)}
                    >
                      {membership.role === "LEAD" ? <UserMinus /> : <X />}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <CreateTeamDialog open={editOpen} onOpenChange={setEditOpen} team={team} />
      <CreateBoardDialog open={createBoardOpen} onOpenChange={setCreateBoardOpen} defaultTeamId={team.id} />
      <CreateTrackerDialog open={createTrackerOpen} onOpenChange={setCreateTrackerOpen} defaultTeamId={team.id} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive ${team.name}?`}
        description="The team is hidden from the sidebar. Its boards stay available and can be reassigned."
        confirmLabel="Archive team"
        onConfirm={() => archive.mutateAsync().then(() => undefined)}
      />
    </div>
  );
}

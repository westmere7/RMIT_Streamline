"use client";

import { TeamMembersEditor } from "@/features/teams/components/team-members-editor";
import { UnavailableState } from "@/features/workspace/unavailable-state";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, FileSpreadsheet, Pencil, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { BoardItemCount } from "@/features/boards/board-item-count";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { SectionHeading } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateBoardDialog } from "@/features/boards/components/create-board-dialog";
import { CreateTrackerDialog } from "@/features/trackers/create-tracker-dialog";
import { useTrackers } from "@/features/trackers/hooks";
import { CreateDocDialog } from "@/features/docs/create-doc-dialog";
import { DocGlyph } from "@/features/docs/docs-page";
import { useDocs } from "@/features/docs/hooks";
import { useServices } from "@/features/data/data-context";
import { CreateTeamDialog } from "@/features/teams/components/create-team-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canCreateBoard, canEditDocs, canEditTrackers, canManageTeam, canViewBoard } from "@/lib/permissions/permissions";
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
  const [createDocOpen, setCreateDocOpen] = React.useState(false);
  const docsQuery = useDocs();
  const teamDocs = (docsQuery.data ?? []).filter((d) => d.teamId === params.teamId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaceContext(ws.workspace.id) });
  const archive = useMutation({
    mutationFn: () => services.workspace.archiveTeam(team!.id, true),
    onSuccess: async () => {
      await invalidate();
      toast.success(`${team?.name} archived`);
      router.push(routes.workspace(ws.slug));
    },
  });

  if (!team) {
    return (
      <UnavailableState
        kind="team"
        refId={params.teamId}
        icon={Users}
        missing={{ title: "Team not found", description: "It may have been removed." }}
        back={{ href: routes.workspace(ws.slug), label: "Back to home" }}
      />
    );
  }

  const manage = canManageTeam(ws.permissions, team.id);
  const boards = ws.boardsForTeam(team.id).filter((b) => canViewBoard(ws.permissions, b));
  const colors = colorClasses(team.color);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className={cn("flex size-10 items-center justify-center rounded-md", colors.solid)}>
              <DynamicIcon name={team.icon} className="size-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{team.name}</h1>
              <p className="text-[13px] text-muted-foreground">{team.description ?? "No description yet."}</p>
              {team.archivedAt && <Badge variant="muted" className="mt-1">Archived</Badge>}
              {team.system && (
                <Badge variant="primary" className="mt-1" data-testid="team-built-in">
                  Built in
                </Badge>
              )}
            </div>
          </div>
          {manage && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
              {!team.archivedAt && !team.system && (
                <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
                  <Archive /> Archive
                </Button>
              )}
            </div>
          )}
        </header>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
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
              <EmptyLine testId="team-boards-empty">No boards yet</EmptyLine>
            ) : (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
                {boards.map((board) => (
                  <li key={board.id}>
                    <Link href={ws.boardPath(board)} className="flex h-11 items-center gap-3 px-3 text-[13px] hover:bg-accent">
                      <DynamicIcon name={board.icon} className={cn("size-4", colorClasses(board.color).text)} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{board.name}</span>
                          <BoardItemCount boardId={board.id} />
                        </span>
                        {board.description && <span className="block truncate text-2xs text-muted-foreground">{board.description}</span>}
                      </span>
                      {/* The team says who sees its boards; a board itself can only be made private. */}
                      {board.visibility === "PRIVATE" && <Badge variant="muted">Private</Badge>}
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
                <EmptyLine testId="team-trackers-empty">No trackers yet</EmptyLine>
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

            <div className="mt-8">
              <SectionHeading
                action={
                  canEditDocs(ws.permissions) && (
                    <Button variant="ghost" size="sm" onClick={() => setCreateDocOpen(true)} data-testid="team-new-doc">
                      <Plus /> New doc
                    </Button>
                  )
                }
              >
                Docs
              </SectionHeading>
              {teamDocs.length === 0 ? (
                <EmptyLine testId="team-docs-empty">No docs yet</EmptyLine>
              ) : (
                <ul className="divide-y divide-border/60 rounded-xl border border-border/70 bg-card shadow-xs">
                  {teamDocs.map((doc) => (
                    <li key={doc.id}>
                      <Link href={routes.doc(ws.slug, doc.id)} className="flex h-11 items-center gap-3 px-3 text-[13px] hover:bg-accent" data-testid="team-doc">
                        <DocGlyph doc={doc} className="size-6 text-sm" />
                        <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
                        <Badge variant="muted">{doc.kind === "pdf" ? "PDF" : "doc"}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <TeamMembersEditor team={team} heading={(add, count) => <SectionHeading action={add}>Members · {count}</SectionHeading>} />
          </section>
        </div>
      </div>

      <CreateTeamDialog open={editOpen} onOpenChange={setEditOpen} team={team} />
      <CreateBoardDialog open={createBoardOpen} onOpenChange={setCreateBoardOpen} defaultTeamId={team.id} />
      <CreateTrackerDialog open={createTrackerOpen} onOpenChange={setCreateTrackerOpen} defaultTeamId={team.id} />
      <CreateDocDialog key={createDocOpen ? "open" : "closed"} open={createDocOpen} onOpenChange={setCreateDocOpen} defaultTeamId={team.id} />
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

/**
 * A section with nothing in it, as one quiet line rather than an icon and a
 * paragraph: the section's own New button, beside its heading, is the way in.
 */
function EmptyLine({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-[13px] text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

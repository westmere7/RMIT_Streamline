"use client";

import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { type MenuAction, RowMenu } from "@/components/layout/row-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DynamicIcon } from "@/components/shared/dynamic-icon";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tracker } from "@/domain";
import { CreateTrackerDialog } from "@/features/trackers/create-tracker-dialog";
import { useTrackerMutations, useTrackers } from "@/features/trackers/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { colorClasses } from "@/lib/colors";
import { canEditTrackers } from "@/lib/permissions/permissions";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/** Workspace-level list of trackers (in-app spreadsheets). */
export function TrackersPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const trackers = useTrackers();
  const { remove } = useTrackerMutations();
  const canEdit = canEditTrackers(ws.permissions);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Tracker | null>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-6xl">
        <PageHeader
          title="Trackers"
          description="Every team's spreadsheets in one place — asset trackers, production logs, anything that used to live in Excel."
          actions={
            canEdit && (
              <Button onClick={() => setCreateOpen(true)} data-testid="new-tracker">
                <Plus /> New tracker
              </Button>
            )
          }
        />
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto w-full max-w-6xl">
          {trackers.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : (trackers.data ?? []).length === 0 ? (
            <EmptyState
              icon={FileSpreadsheet}
              title="No trackers yet"
              description="Create one from the campaign asset layout, start blank, or import an existing .xlsx workbook."
              action={canEdit && <Button onClick={() => setCreateOpen(true)}>New tracker</Button>}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(trackers.data ?? []).map((tracker) => {
                const team = ws.teamById(tracker.teamId);
                const actions: MenuAction[] = [
                  { type: "item", label: "Open", icon: <FileSpreadsheet />, onSelect: () => router.push(routes.tracker(ws.slug, tracker.id)) },
                  ...(canEdit ? ([{ type: "separator" }, { type: "item", label: "Delete tracker", icon: <Trash2 />, destructive: true, onSelect: () => setDeleting(tracker) }] as MenuAction[]) : []),
                ];
                return (
                  <li key={tracker.id}>
                    <RowMenu label={`Options for ${tracker.name}`} actions={actions} hideButton>
                      <Link
                        href={routes.tracker(ws.slug, tracker.id)}
                        className="flex h-28 flex-col rounded-md border bg-card p-4 transition-colors hover:border-ring hover:bg-accent"
                        data-testid="tracker-card"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-navy text-white">
                            <FileSpreadsheet className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold">{tracker.name}</span>
                            <span className="flex items-center gap-1 truncate text-2xs text-muted-foreground">
                              {team ? (
                                <>
                                  <DynamicIcon name={team.icon} className={cn("size-3", colorClasses(team.color).text)} /> {team.name}
                                </>
                              ) : (
                                "Workspace"
                              )}
                            </span>
                          </span>
                        </span>
                        <span className="mt-2 line-clamp-2 text-2xs text-muted-foreground">{tracker.description || "No description."}</span>
                        <span className="mt-auto text-2xs text-muted-foreground">
                          Updated <RelativeTime iso={tracker.updatedAt} />
                        </span>
                      </Link>
                    </RowMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <CreateTrackerDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="This permanently deletes the tracker and every sheet in it. Export it first if you want a copy."
        confirmLabel="Delete tracker"
        destructive
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </div>
  );
}

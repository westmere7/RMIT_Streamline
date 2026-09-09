"use client";

import { Maximize2, Minimize2, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import { Freshness } from "@/features/dashboard/dashboard-controls";
import { useAgo, useDashboardRealtime, useDashboardSnapshot } from "@/features/dashboard/hooks";
import { ShareDashboardDialog } from "@/features/dashboard/share-dashboard-dialog";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { canManageDashboardShare } from "@/lib/permissions/permissions";
import { cn } from "@/lib/utils";

/**
 * The Dashboard page inside the workspace: the live figures for every board the
 * reader can see, with the controls to share it and to put it full screen for a
 * wall display.
 */
export function DashboardPage() {
  const ws = useWorkspace();
  const router = useRouter();
  const snapshot = useDashboardSnapshot(ws.workspace.id, ws.boards);
  useDashboardRealtime(ws.workspace.id);
  const ago = useAgo(snapshot.dataUpdatedAt || null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Full screen puts just this page on the display: no sidebar, no browser chrome.
  React.useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  const openTask = (taskId: string, boardId: string) => {
    const board = ws.boardById(boardId);
    if (board) router.push(ws.boardPath(board, { itemId: taskId }));
  };
  const openBoard = (boardId: string) => {
    const board = ws.boardById(boardId);
    if (board) router.push(ws.boardPath(board));
  };

  const canShare = canManageDashboardShare(ws.permissions);

  return (
    <div ref={rootRef} className={cn("flex h-full min-h-0 flex-col bg-background", fullscreen && "overflow-hidden")} data-testid="dashboard-page">
      {snapshot.data ? (
        <DashboardScreen
          snapshot={snapshot.data}
          viewerId={ws.currentUser.id}
          onOpenTask={openTask}
          onOpenBoard={openBoard}
          // A refresh that failed while a good snapshot is still on screen is
          // "not updating", never "Live".
          freshness={<Freshness ago={ago} refreshing={snapshot.isFetching} failed={snapshot.isError} />}
          toolbarExtras={
            <>
              {canShare && (
                <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} data-testid="dashboard-share">
                  <Share2 /> Share
                </Button>
              )}
              <SimpleTooltip label={fullscreen ? "Exit full screen" : "Full screen"} side="bottom">
                <Button variant="outline" size="icon-sm" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} data-testid="dashboard-fullscreen">
                  {fullscreen ? <Minimize2 /> : <Maximize2 />}
                </Button>
              </SimpleTooltip>
            </>
          }
        />
      ) : snapshot.isError ? (
        <ErrorState title="Could not load the dashboard." error={snapshot.error} onRetry={() => snapshot.refetch()} />
      ) : (
        <DashboardSkeleton />
      )}

      {canShare && <ShareDashboardDialog workspaceId={ws.workspace.id} workspaceName={ws.workspace.name} open={shareOpen} onOpenChange={setShareOpen} />}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="flex-1 space-y-4 p-5" data-testid="dashboard-skeleton">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-8 w-64 rounded-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-80 rounded-2xl xl:col-span-8" />
        <Skeleton className="h-80 rounded-2xl xl:col-span-4" />
      </div>
    </div>
  );
}

"use client";

import { History } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/shared/empty-state";
import { RelativeTime } from "@/components/shared/relative-time";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { Activity } from "@/domain";
import { describeActivity } from "@/features/activity/format-activity";
import { useWorkspace } from "@/features/workspace/workspace-context";

export interface ActivityFeedProps {
  activities: Activity[];
  /** Append the item name to each line and link to it. */
  showItem?: boolean;
  emptyTitle?: string;
  className?: string;
}

export function ActivityFeed({ activities, showItem = false, emptyTitle = "No activity yet.", className }: ActivityFeedProps) {
  const ws = useWorkspace();
  if (activities.length === 0) return <EmptyState icon={History} title={emptyTitle} compact />;
  return (
    <ol className={className}>
      {activities.map((activity) => {
        const actor = ws.userById(activity.actorId);
        const board = ws.boardById(activity.boardId);
        // The line itself leads to what it talks about: the item when there is one, else the board.
        const target = board ? (activity.itemId ? ws.boardPath(board, { itemId: activity.itemId }) : ws.boardPath(board)) : null;
        const line = describeActivity(activity, ws.users, showItem);
        return (
          <li key={activity.id} className="flex gap-2.5 py-2" data-testid="activity-row">
            <UserAvatar user={actor} size="sm" />
            <div className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
              {target ? (
                <Link href={target} className="block rounded-md hover:bg-accent/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" data-testid="activity-link">
                  {line}
                </Link>
              ) : (
                <p>{line}</p>
              )}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-2xs">
                <RelativeTime iso={activity.createdAt} />
                {showItem && board && (
                  <>
                    <span aria-hidden>·</span>
                    {activity.itemId ? (
                      <Link href={ws.boardPath(board, { itemId: activity.itemId })} className="truncate hover:text-foreground hover:underline">
                        {board.name}
                      </Link>
                    ) : (
                      <Link href={ws.boardPath(board)} className="truncate hover:text-foreground hover:underline">
                        {board.name}
                      </Link>
                    )}
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { Board } from "@/domain";
import { ActivityFeed } from "@/features/activity/activity-feed";
import { useBoardActivity } from "@/features/activity/hooks";

export function BoardActivityDialog({ board, open, onOpenChange }: { board: Board; open: boolean; onOpenChange: (open: boolean) => void }) {
  const activity = useBoardActivity(board.id, 100);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Board activity</DialogTitle>
          <DialogDescription>Everything that happened on {board.name}, newest first.</DialogDescription>
        </DialogHeader>
        <div className="scrollbar-thin -mx-2 max-h-[60vh] overflow-y-auto px-2">
          {activity.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9" />)}
            </div>
          ) : (
            <ActivityFeed activities={activity.data ?? []} showItem className="divide-y" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

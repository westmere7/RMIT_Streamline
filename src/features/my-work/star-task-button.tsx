"use client";

import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { Item } from "@/domain";
import { useStar, useStarredIds } from "@/features/my-work/hooks";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { cn } from "@/lib/utils";

/**
 * Stars a task for My Work's Starred tab. On a row it sits over a link, so
 * the click stays with the star rather than opening the task.
 */
export function StarTaskButton({ item, size = "icon-xs", className }: { item: Pick<Item, "id" | "boardId">; size?: "icon-xs" | "icon-sm"; className?: string }) {
  const ws = useWorkspace();
  const starred = useStarredIds(ws.currentUser.id);
  const star = useStar(ws.currentUser.id);
  const on = starred.data?.has(item.id) ?? false;
  const label = on ? "Unstar this task" : "Star this task";
  return (
    <SimpleTooltip label={on ? "Starred: in My Work, Starred" : "Star: keep it in My Work, Starred"}>
      <Button
        type="button"
        variant="ghost"
        size={size}
        aria-label={label}
        aria-pressed={on}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          star.mutate({ items: [item], on: !on });
        }}
        className={className}
        data-testid="star-task"
      >
        <Star className={cn(on ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
      </Button>
    </SimpleTooltip>
  );
}

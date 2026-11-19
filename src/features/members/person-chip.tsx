"use client";

import Link from "next/link";
import * as React from "react";
import { PersonHover, UserAvatar } from "@/components/shared/user-avatar";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Someone named inside a line of text: their face and name, leading to their
 * page, with the usual card on hover. Nothing when they are not in the
 * workspace (any more). The click stops here, so a card that opens on a click
 * of its own does not open as well.
 */
export function PersonChip({ userId, className, testId = "person-chip" }: { userId: string | null | undefined; className?: string; testId?: string }) {
  const ws = useWorkspace();
  const user = ws.userById(userId);
  if (!user) return null;
  return (
    <PersonHover user={user}>
      <Link
        href={routes.person(ws.slug, user.id)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(
          "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full py-px pr-1.5 pl-px align-middle font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
        data-testid={testId}
      >
        <UserAvatar user={user} size="xs" tooltip={false} />
        <span className="truncate">{user.displayName}</span>
      </Link>
    </PersonHover>
  );
}

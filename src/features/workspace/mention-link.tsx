"use client";

import Link from "next/link";
import * as React from "react";
import type { User } from "@/domain";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * A name inside a sentence — a person, a board, a team, a task — that leads back
 * to its page. Plain emphasis when there is nowhere to send anyone: an activity
 * entry keeps the names of things that have since been deleted, and a shared
 * board is read by people with no pages to visit.
 */
export function Mention({ href, children, className }: { href?: string | null; children: React.ReactNode; className?: string }) {
  if (!href) return <span className={cn("font-medium text-foreground", className)}>{children}</span>;
  return (
    <Link href={href} className={cn("font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring", className)} data-testid="mention-link">
      {children}
    </Link>
  );
}

export interface MentionLinks {
  /** A person's page, by id. */
  person: (userId: string | null | undefined) => string | null;
  /** The same, from the display name a mention was written with. */
  personNamed: (displayName: string) => string | null;
  team: (teamId: string | null | undefined) => string | null;
  /** A board, or one of its items when `itemId` is given. */
  board: (boardId: string | null | undefined, itemId?: string | null) => string | null;
}

/** Where each kind of mention points in this workspace. */
export function useMentionLinks(): MentionLinks {
  const ws = useWorkspace();
  const { slug, users } = ws;
  return React.useMemo(
    () => ({
      person: (userId) => (userId && ws.userById(userId) ? routes.person(slug, userId) : null),
      personNamed: (displayName) => {
        const match = users.find((u: User) => u.displayName === displayName || u.firstName === displayName);
        return match ? routes.person(slug, match.id) : null;
      },
      team: (teamId) => (teamId && ws.teamById(teamId) ? routes.team(slug, teamId) : null),
      board: (boardId, itemId) => {
        const board = ws.boardById(boardId);
        return board ? ws.boardPath(board, itemId ? { itemId } : undefined) : null;
      },
    }),
    [slug, users, ws],
  );
}

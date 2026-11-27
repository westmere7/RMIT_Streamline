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
    <Link href={href} className={cn("font-medium text-foreground underline decoration-foreground/25 decoration-dotted underline-offset-2 hover:decoration-solid hover:decoration-foreground/70 focus-visible:outline-2 focus-visible:outline-ring", className)} data-testid="mention-link">
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
  /** A board from the name an older activity entry kept, when exactly one live board has it. */
  boardNamed: (name: string | null | undefined) => string | null;
  /** The board's archive, opened on a task that has been put away. */
  archived: (boardId: string | null | undefined, itemId?: string | null) => string | null;
  /** One part of a task: its Assets tab, or one of its fields brought into view. */
  part: (boardId: string | null | undefined, itemId: string | null | undefined, part: { tab: "assets" } | { field: string }) => string | null;
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
      boardNamed: (name) => {
        const wanted = name?.trim().toLowerCase();
        if (!wanted) return null;
        const found = ws.boards.filter((b) => b.archivedAt === null && b.name.trim().toLowerCase() === wanted);
        return found.length === 1 ? ws.boardPath(found[0]!) : null;
      },
      // A task that has been put away is not on the board any more; a link to
      // it goes to the board's archive, opened on that task.
      archived: (boardId, itemId) => {
        const board = ws.boardById(boardId);
        return board ? routes.boardArchive(slug, board.slug, itemId ? { itemId } : undefined) : null;
      },
      part: (boardId, itemId, part) => {
        const board = ws.boardById(boardId);
        if (!board || !itemId) return null;
        return ws.boardPath(board, "tab" in part ? { itemId, tab: part.tab } : { itemId, field: part.field });
      },
    }),
    [slug, users, ws],
  );
}

/**
 * The same links for a feed inside one task. The task may have moved board
 * since an entry was written; anything about it (or its subitems) leads to the
 * board it is on now.
 */
export function useMentionLinksHere(boardId: string, itemIds: ReadonlySet<string>): MentionLinks {
  const links = useMentionLinks();
  return React.useMemo(() => {
    const here = (b: string | null | undefined, itemId?: string | null) => (itemId && itemIds.has(itemId) ? boardId : b);
    return {
      ...links,
      board: (b, itemId) => links.board(here(b, itemId), itemId),
      // A column is the board's own: one named on the board the task has left is not on this one, so the task alone.
      part: (b, itemId, part) => {
        const at = here(b, itemId);
        return "field" in part && b && at !== b ? links.board(at, itemId) : links.part(at, itemId, part);
      },
    };
  }, [links, boardId, itemIds]);
}

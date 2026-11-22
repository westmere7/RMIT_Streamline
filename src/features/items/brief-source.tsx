"use client";

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { briefMatchesSource, briefSourceText, lastBriefEdit } from "@/domain/booking/brief-source";
import type { BoardColumn } from "@/domain/board/column";
import type { Item } from "@/domain/item/item";
import type { User } from "@/domain/user/user";
import { useItemActivity } from "@/features/activity/hooks";
import { useServices } from "@/features/data/data-context";
import { useWorkspace } from "@/features/workspace/workspace-context";
import { formatDateTime } from "@/lib/dates/dates";
import { queryKeys } from "@/lib/query/keys";

/**
 * A booked task's Brief against the brief as the booking wrote it.
 *
 * The booking's copy (`items.booking_brief`) is the evidence of what was asked
 * for; the column is the team's working copy. When the two differ the brief
 * says who last edited it and when (from the task's log), and an editor can put
 * the booked one back.
 */
export interface BriefSource {
  /** The working copy no longer says what the booking said. */
  edited: boolean;
  /** The brief as booked, dressed as a Brief column shows it: what Revert writes. */
  sourceText: string;
  /** Who made the latest change, when the log still has it. */
  editor: User | null;
  editedAt: string | null;
}

export function useBriefSource(item: Pick<Item, "id">, column: Pick<BoardColumn, "id" | "name" | "type">, body: string): BriefSource | null {
  const services = useServices();
  const ws = useWorkspace();
  const source = useQuery({
    queryKey: queryKeys.bookingBrief(item.id),
    queryFn: async () => (await services.repos.items.listBookingBriefs([item.id])).get(item.id) ?? null,
    enabled: column.type === "BRIEF",
    // Written once, at booking.
    staleTime: 10 * 60_000,
  });
  const raw = column.type === "BRIEF" ? (source.data ?? null) : null;
  const edited = raw !== null && !briefMatchesSource(body, raw);
  const activity = useItemActivity(edited ? item.id : null);
  return React.useMemo(() => {
    if (raw === null) return null;
    const edit = edited && activity.data ? lastBriefEdit(activity.data, column) : null;
    return { edited, sourceText: briefSourceText(raw), editor: edit ? (ws.userById(edit.actorId) ?? null) : null, editedAt: edit?.at ?? null };
  }, [raw, edited, activity.data, column, ws]);
}

/** "Edited by Danh Nguyen · Nov 22, 2026 at 2:20 PM · not original brief", under the brief's title bar. */
export function BriefEditedNote({ source, className }: { source: BriefSource; className?: string }) {
  if (!source.edited) return null;
  return (
    <p className={className ?? "border-b border-border/60 bg-amber-500/8 px-3.5 py-1.5 text-2xs text-muted-foreground"} data-testid="brief-edited-note">
      Edited
      {source.editor && (
        <>
          {" "}by <span className="font-medium text-foreground">{source.editor.displayName}</span>
        </>
      )}
      {source.editedAt && <> · {formatDateTime(source.editedAt)}</>}
      {" "}· not original brief
    </p>
  );
}

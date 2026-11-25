import type { Activity } from "@/domain/activity/activity";
import type { BoardColumn } from "@/domain/board/column";
import type { EntityId } from "@/domain/common/types";
import { portalBriefMarkdown } from "@/domain/portal/stakeholder-portal";
import { docToRichText, richTextToDoc } from "@/lib/rich-text-doc";

/**
 * The brief as the booking wrote it, kept for evidence.
 *
 * A booked task keeps its own copy of the brief (`items.booking_brief`, 0068),
 * written once by the booking and never changed afterwards (0152). The Brief
 * column holds the working copy, which the team may edit; this is what it is
 * compared with, and what Revert puts back.
 */

/** The line that names the requester. Left out of what the portal shows visitors. */
export const BOOKED_BY_LABEL = "**Booked by:**";

/**
 * A brief as the portal shows it to visitors: without the line naming who
 * booked it, marked up or already flattened. The portal never names a requester.
 */
export function briefForVisitors(brief: string | null): string | null {
  if (!brief) return brief;
  const kept = brief
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\*\*)?Booked by:/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return kept || null;
}

/**
 * The copy as a Brief column shows it. Today's briefs are written in the
 * column's own markup and go in as they are. Briefs from before the form wrote
 * headings (filled in by 0068) are dressed the way a Brief column added later
 * dresses them.
 */
export function briefSourceText(bookingBrief: string): string {
  return /^#{1,3} \S/m.test(bookingBrief) ? bookingBrief : portalBriefMarkdown(bookingBrief);
}

/**
 * A brief as the editor would save it. The markup has more than one way to
 * write the same document (lines that wrap into one paragraph, an escape or
 * none), and the editor writes one of them: a brief opened and saved unchanged
 * is still the brief as booked.
 */
const normalise = (text: string) =>
  docToRichText(
    richTextToDoc(
      text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n"),
    ),
  );

/** Whether the working copy still says what the booking said. How the markup is written doesn't count, only what it shows. */
export function briefMatchesSource(current: string, bookingBrief: string): boolean {
  const now = normalise(current);
  return now === normalise(bookingBrief) || now === normalise(briefSourceText(bookingBrief));
}

export interface BriefEdit {
  actorId: EntityId;
  at: string;
}

/**
 * The latest change to this column on this task, from its log: who, and when
 * (the server's clock, p0034). Older entries name the column but not its id.
 * Null when the log holds none — a re-allocation starts the log again.
 */
export function lastBriefEdit(activities: readonly Activity[], column: Pick<BoardColumn, "id" | "name">): BriefEdit | null {
  let latest: Activity | null = null;
  for (const a of activities) {
    if (a.eventType !== "ITEM_COLUMN_VALUE_UPDATED") continue;
    const m = a.metadata;
    const mine = m.columnId ? m.columnId === column.id : m.columnName === column.name;
    if (!mine) continue;
    if (!latest || a.createdAt > latest.createdAt) latest = a;
  }
  return latest ? { actorId: latest.actorId, at: latest.createdAt } : null;
}

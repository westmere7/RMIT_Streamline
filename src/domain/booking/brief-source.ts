import type { Activity } from "@/domain/activity/activity";
import type { BoardColumn } from "@/domain/board/column";
import type { EntityId } from "@/domain/common/types";
import { portalBriefMarkdown } from "@/domain/portal/stakeholder-portal";

/**
 * The brief as the booking wrote it, kept for evidence.
 *
 * A booked task keeps its own copy of the brief (`items.booking_brief`, 0068),
 * written once by the booking and never changed by the app afterwards. The Brief
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

const normalise = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

/** Whether the working copy still says what the booking said. Whitespace at line ends doesn't count. */
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

import type { EntityId, ISODate } from "@/domain/common/types";

/**
 * A task's planned dates as of the board's last saved baseline: what was
 * promised, kept apart from what the task says now so the difference can be
 * shown. A board has one baseline, replaced whenever it is saved again.
 */
export interface ItemBaseline {
  itemId: EntityId;
  start: ISODate | null;
  end: ISODate | null;
  savedAt: string;
  savedBy: EntityId | null;
}

/** One task's dates for a baseline being saved. */
export interface ItemBaselineInput {
  itemId: EntityId;
  start: ISODate | null;
  end: ISODate | null;
}

/** Whole days between two dates, positive when `to` is later: a slip of +3 is three days late. */
export function daysBetweenDates(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

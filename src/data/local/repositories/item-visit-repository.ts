import type { ItemVisitRepository } from "@/data/repositories";

const KEY = (userId: string) => `streamline.item-visits.${userId}`;
/** Enough to fill Home's list after the ones no longer reachable are left out. */
const KEEP = 50;

/**
 * The local store's task visits: this browser's own list per person, in
 * storage. The demo has one browser, so there is nobody to share it with.
 */
export class LocalItemVisitRepository implements ItemVisitRepository {
  async record(userId: string, itemId: string): Promise<void> {
    const visits = read(userId).filter((visit) => visit.itemId !== itemId);
    visits.unshift({ itemId, visitedAt: new Date().toISOString() });
    try {
      window.localStorage.setItem(KEY(userId), JSON.stringify(visits.slice(0, KEEP)));
    } catch {
      // Storage refused: the list simply does not grow.
    }
  }

  async listRecent(userId: string, limit: number): Promise<Array<{ itemId: string; visitedAt: string }>> {
    return read(userId).slice(0, limit);
  }
}

function read(userId: string): Array<{ itemId: string; visitedAt: string }> {
  try {
    const raw = window.localStorage.getItem(KEY(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is { itemId: string; visitedAt: string } => typeof v?.itemId === "string" && typeof v?.visitedAt === "string") : [];
  } catch {
    return [];
  }
}

import type { Tracker, TrackerInput, TrackerSheet, TrackerSheetInput } from "@/domain";
import type { TrackerRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import { sortByPosition } from "@/lib/utils";
import type { LocalConnection } from "../connection";

export class LocalTrackerRepository implements TrackerRepository {
  constructor(private readonly conn: LocalConnection) {}

  async listByWorkspace(workspaceId: string): Promise<Tracker[]> {
    const db = await this.conn.getDb();
    const trackers = await db.getAllFromIndex("trackers", "byWorkspace", workspaceId);
    return trackers.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getById(id: string): Promise<Tracker | null> {
    const db = await this.conn.getDb();
    return (await db.get("trackers", id)) ?? null;
  }

  async create(input: TrackerInput): Promise<Tracker> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const tracker: Tracker = { ...input, id: newId(), createdAt: now, updatedAt: now };
    await db.put("trackers", tracker);
    return tracker;
  }

  async update(id: string, patch: Partial<Omit<Tracker, "id" | "workspaceId" | "createdAt">>): Promise<Tracker> {
    const db = await this.conn.getDb();
    const existing = await db.get("trackers", id);
    if (!existing) throw new NotFoundError("Tracker", id);
    const updated: Tracker = { ...existing, ...patch, id, updatedAt: nowIso() };
    await db.put("trackers", updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction(["trackers", "trackerSheets"], "readwrite");
    const sheetKeys = await tx.objectStore("trackerSheets").index("byTracker").getAllKeys(id);
    await Promise.all([...sheetKeys.map((k) => tx.objectStore("trackerSheets").delete(k)), tx.objectStore("trackers").delete(id)]);
    await tx.done;
  }

  // ---- Sheets --------------------------------------------------------------

  async listSheets(trackerId: string): Promise<TrackerSheet[]> {
    const db = await this.conn.getDb();
    return sortByPosition(await db.getAllFromIndex("trackerSheets", "byTracker", trackerId));
  }

  async getSheet(id: string): Promise<TrackerSheet | null> {
    const db = await this.conn.getDb();
    return (await db.get("trackerSheets", id)) ?? null;
  }

  async createSheet(input: TrackerSheetInput): Promise<TrackerSheet> {
    const db = await this.conn.getDb();
    const siblings = await db.getAllFromIndex("trackerSheets", "byTracker", input.trackerId);
    const now = nowIso();
    const sheet: TrackerSheet = {
      id: newId(),
      trackerId: input.trackerId,
      name: input.name,
      position: input.position ?? siblings.reduce((max, s) => Math.max(max, s.position), -1) + 1,
      columns: input.columns,
      rows: input.rows,
      frozenColumns: input.frozenColumns,
      createdAt: now,
      updatedAt: now,
    };
    await db.put("trackerSheets", sheet);
    await db.put("trackers", { ...(await db.get("trackers", input.trackerId))!, updatedAt: now });
    return sheet;
  }

  async updateSheet(id: string, patch: Partial<Omit<TrackerSheet, "id" | "trackerId" | "createdAt">>): Promise<TrackerSheet> {
    const db = await this.conn.getDb();
    const existing = await db.get("trackerSheets", id);
    if (!existing) throw new NotFoundError("TrackerSheet", id);
    const now = nowIso();
    const updated: TrackerSheet = { ...existing, ...patch, id, updatedAt: now };
    await db.put("trackerSheets", updated);
    const tracker = await db.get("trackers", existing.trackerId);
    if (tracker) await db.put("trackers", { ...tracker, updatedAt: now });
    return updated;
  }

  async deleteSheet(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("trackerSheets", id);
  }

  async reorderSheets(trackerId: string, orderedIds: string[]): Promise<TrackerSheet[]> {
    const db = await this.conn.getDb();
    const tx = db.transaction("trackerSheets", "readwrite");
    const sheets = await tx.store.index("byTracker").getAll(trackerId);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const updated = sheets.map((s) => ({ ...s, position: order.get(s.id) ?? s.position + orderedIds.length }));
    await Promise.all(updated.map((s) => tx.store.put(s)));
    await tx.done;
    return sortByPosition(updated);
  }
}

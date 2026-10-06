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
    const tx = db.transaction(["trackers", "trackerSheets", "itemAssets"], "readwrite");
    const sheets = await tx.objectStore("trackerSheets").index("byTracker").getAll(id);
    // The lines a linked sheet wrote go with it, as the database's cascade does.
    const lines: string[] = [];
    for (const sheet of sheets) {
      if (!sheet.itemId) continue;
      for (const line of await tx.objectStore("itemAssets").index("byItem").getAll(sheet.itemId)) if (line.trackerSheetId === sheet.id) lines.push(line.id);
    }
    await Promise.all([...lines.map((key) => tx.objectStore("itemAssets").delete(key)), ...sheets.map((s) => tx.objectStore("trackerSheets").delete(s.id)), tx.objectStore("trackers").delete(id)]);
    await tx.done;
  }

  // ---- Sheets --------------------------------------------------------------

  async listSheets(trackerId: string): Promise<TrackerSheet[]> {
    const db = await this.conn.getDb();
    return sortByPosition((await db.getAllFromIndex("trackerSheets", "byTracker", trackerId)).map(withLink));
  }

  async getSheet(id: string): Promise<TrackerSheet | null> {
    const db = await this.conn.getDb();
    const sheet = await db.get("trackerSheets", id);
    return sheet ? withLink(sheet) : null;
  }

  async getSheetByItem(itemId: string): Promise<TrackerSheet | null> {
    const db = await this.conn.getDb();
    const sheet = (await db.getAll("trackerSheets")).find((s) => s.itemId === itemId);
    return sheet ? withLink(sheet) : null;
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
      itemId: null,
      assetMapping: input.assetMapping ?? null,
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
    const updated: TrackerSheet = { ...existing, ...patch, id, updatedAt: laterThan(existing.updatedAt) };
    await db.put("trackerSheets", updated);
    const tracker = await db.get("trackers", existing.trackerId);
    if (tracker) await db.put("trackers", { ...tracker, updatedAt: now });
    return withLink(updated);
  }

  async updateSheetIfCurrent(id: string, patch: Partial<Omit<TrackerSheet, "id" | "trackerId" | "createdAt">>, expectedUpdatedAt: string): Promise<TrackerSheet | null> {
    const db = await this.conn.getDb();
    const tx = db.transaction(["trackerSheets", "trackers"], "readwrite");
    const existing = await tx.objectStore("trackerSheets").get(id);
    if (!existing) throw new Error("This sheet no longer exists.");
    if (existing.updatedAt !== expectedUpdatedAt) {
      await tx.done;
      return null;
    }
    const updated: TrackerSheet = { ...existing, ...patch, id, updatedAt: laterThan(existing.updatedAt) };
    await tx.objectStore("trackerSheets").put(updated);
    const tracker = await tx.objectStore("trackers").get(existing.trackerId);
    if (tracker) await tx.objectStore("trackers").put({ ...tracker, updatedAt: updated.updatedAt });
    await tx.done;
    return withLink(updated);
  }

  async deleteSheet(id: string): Promise<void> {
    const db = await this.conn.getDb();
    const tx = db.transaction(["trackerSheets", "itemAssets"], "readwrite");
    const sheet = await tx.objectStore("trackerSheets").get(id);
    const lines: string[] = [];
    if (sheet?.itemId) for (const line of await tx.objectStore("itemAssets").index("byItem").getAll(sheet.itemId)) if (line.trackerSheetId === id) lines.push(line.id);
    await Promise.all([...lines.map((key) => tx.objectStore("itemAssets").delete(key)), tx.objectStore("trackerSheets").delete(id)]);
    await tx.done;
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

/** Sheets stored before a sheet could hold a task's assets. */
function withLink(sheet: TrackerSheet): TrackerSheet {
  return { ...sheet, itemId: sheet.itemId ?? null, assetMapping: sheet.assetMapping ?? null };
}

/**
 * A timestamp after `previous`, even within the same millisecond: a save is
 * matched on it (updateSheetIfCurrent), so two saves must never share one.
 */
function laterThan(previous: string): string {
  const now = nowIso();
  if (now > previous) return now;
  return new Date(new Date(previous).getTime() + 1).toISOString();
}

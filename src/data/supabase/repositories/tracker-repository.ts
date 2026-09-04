import type { Tracker, TrackerInput, TrackerSheet, TrackerSheetInput } from "@/domain";
import type { TrackerRepository } from "@/data/repositories";
import { sortByPosition } from "@/lib/utils";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined, toTracker, toTrackerSheet, type TrackerSheetRow, type TrackerTableRow } from "../rows";

const TRACKER = "id, workspace_id, team_id, name, description, created_by, created_at, updated_at";
const SHEET = "id, tracker_id, name, position, columns, rows, frozen_columns, created_at, updated_at";

export class SupabaseTrackerRepository implements TrackerRepository {
  async listByWorkspace(workspaceId: string): Promise<Tracker[]> {
    const result = await db().from("trackers").select(TRACKER).eq("workspace_id", workspaceId).order("name", { ascending: true });
    return unwrapList<TrackerTableRow>(result, "trackers.listByWorkspace").map(toTracker);
  }

  async getById(id: string): Promise<Tracker | null> {
    const result = await db().from("trackers").select(TRACKER).eq("id", id).maybeSingle();
    const row = unwrapMaybe<TrackerTableRow>(result, "trackers.getById");
    return row ? toTracker(row) : null;
  }

  async create(input: TrackerInput): Promise<Tracker> {
    const payload = {
      workspace_id: input.workspaceId,
      team_id: input.teamId,
      name: input.name,
      description: input.description,
      created_by: input.createdBy,
    };
    const result = await db().from("trackers").insert(payload).select(TRACKER).single();
    return toTracker(unwrap<TrackerTableRow>(result, "trackers.create"));
  }

  async update(id: string, patch: Partial<Omit<Tracker, "id" | "workspaceId" | "createdAt">>): Promise<Tracker> {
    const payload = pruneUndefined({
      team_id: patch.teamId,
      name: patch.name,
      description: patch.description,
      created_by: patch.createdBy,
    });
    const result = await db().from("trackers").update(payload).eq("id", id).select(TRACKER).single();
    return toTracker(unwrap<TrackerTableRow>(result, "trackers.update"));
  }

  /** Sheets cascade with the tracker. */
  async delete(id: string): Promise<void> {
    assertOk(await db().from("trackers").delete().eq("id", id), "trackers.delete");
  }

  async listSheets(trackerId: string): Promise<TrackerSheet[]> {
    const result = await db().from("tracker_sheets").select(SHEET).eq("tracker_id", trackerId).order("position", { ascending: true });
    return unwrapList<TrackerSheetRow>(result, "tracker_sheets.listSheets").map(toTrackerSheet);
  }

  async getSheet(id: string): Promise<TrackerSheet | null> {
    const result = await db().from("tracker_sheets").select(SHEET).eq("id", id).maybeSingle();
    const row = unwrapMaybe<TrackerSheetRow>(result, "tracker_sheets.getSheet");
    return row ? toTrackerSheet(row) : null;
  }

  async createSheet(input: TrackerSheetInput): Promise<TrackerSheet> {
    let position = input.position;
    if (position === undefined) {
      const existing = await db()
        .from("tracker_sheets")
        .select("position")
        .eq("tracker_id", input.trackerId)
        .order("position", { ascending: false })
        .limit(1);
      const rows = unwrapList<{ position: number }>(existing, "tracker_sheets.createSheet.position");
      position = (rows[0]?.position ?? -1) + 1;
    }
    const payload = {
      tracker_id: input.trackerId,
      name: input.name,
      position,
      columns: input.columns,
      rows: input.rows,
      frozen_columns: input.frozenColumns,
    };
    const result = await db().from("tracker_sheets").insert(payload).select(SHEET).single();
    return toTrackerSheet(unwrap<TrackerSheetRow>(result, "tracker_sheets.createSheet"));
  }

  async updateSheet(id: string, patch: Partial<Omit<TrackerSheet, "id" | "trackerId" | "createdAt">>): Promise<TrackerSheet> {
    const payload = pruneUndefined({
      name: patch.name,
      position: patch.position,
      columns: patch.columns,
      rows: patch.rows,
      frozen_columns: patch.frozenColumns,
    });
    const result = await db().from("tracker_sheets").update(payload).eq("id", id).select(SHEET).single();
    return toTrackerSheet(unwrap<TrackerSheetRow>(result, "tracker_sheets.updateSheet"));
  }

  async deleteSheet(id: string): Promise<void> {
    assertOk(await db().from("tracker_sheets").delete().eq("id", id), "tracker_sheets.deleteSheet");
  }

  async reorderSheets(trackerId: string, orderedIds: string[]): Promise<TrackerSheet[]> {
    const sheets = await this.listSheets(trackerId);
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const updated = sheets.map((s) => ({ ...s, position: order.get(s.id) ?? s.position + orderedIds.length }));
    await Promise.all(
      updated
        .filter((s, index) => s.position !== sheets[index]?.position)
        .map((s) => db().from("tracker_sheets").update({ position: s.position }).eq("id", s.id)),
    );
    return sortByPosition(updated);
  }
}

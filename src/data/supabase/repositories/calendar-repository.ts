import type { CalendarFeed, CalendarKeyDate, CalendarKeyDateInput, CalendarKeyDatePatch, CalendarTaskRow, LeaveEntry, LeaveEntryInput, LeaveEntryPatch, WorkspaceHoliday, WorkspaceHolidayInput, WorkspaceHolidayPatch } from "@/domain";
import type { CalendarRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapAll, unwrapList, unwrapMaybe } from "../client";

const HOLIDAY = "id, workspace_id, name, starts_on, ends_on, half_day, kind, note, created_by, created_at, updated_at";
const LEAVE = "id, workspace_id, user_id, starts_on, ends_on, start_half, end_half, kind, cover_user_id, note, status, created_by, created_at, updated_at";
const KEY_DATE = "id, workspace_id, name, starts_on, ends_on, color, note, created_by, created_at, updated_at";
const FEED = "id, workspace_id, user_id, token, created_at, revoked_at";

type Row = Record<string, unknown>;
const s = (v: unknown) => v as string;
const n = (v: unknown) => (v ?? null) as string | null;

const toHoliday = (r: Row): WorkspaceHoliday => ({ id: s(r.id), workspaceId: s(r.workspace_id), name: s(r.name), startsOn: s(r.starts_on), endsOn: s(r.ends_on), halfDay: (r.half_day ?? null) as WorkspaceHoliday["halfDay"], kind: r.kind as WorkspaceHoliday["kind"], note: n(r.note), createdBy: n(r.created_by), createdAt: s(r.created_at), updatedAt: s(r.updated_at) });
const toLeave = (r: Row): LeaveEntry => ({ id: s(r.id), workspaceId: s(r.workspace_id), userId: s(r.user_id), startsOn: s(r.starts_on), endsOn: s(r.ends_on), startHalf: !!r.start_half, endHalf: !!r.end_half, kind: r.kind as LeaveEntry["kind"], coverUserId: n(r.cover_user_id), note: n(r.note), status: r.status as LeaveEntry["status"], createdBy: n(r.created_by), createdAt: s(r.created_at), updatedAt: s(r.updated_at) });
const toKeyDate = (r: Row): CalendarKeyDate => ({ id: s(r.id), workspaceId: s(r.workspace_id), name: s(r.name), startsOn: s(r.starts_on), endsOn: s(r.ends_on), color: s(r.color), note: n(r.note), createdBy: n(r.created_by), createdAt: s(r.created_at), updatedAt: s(r.updated_at) });
const toFeed = (r: Row): CalendarFeed => ({ id: s(r.id), workspaceId: s(r.workspace_id), userId: s(r.user_id), token: s(r.token), createdAt: s(r.created_at), revokedAt: n(r.revoked_at) });

/** Only the fields a patch names: undefined means "leave it". */
function defined(payload: Row): Row {
  return Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
}

/** The workspace Calendar (migration 0162). Everyone in the workspace reads; RLS decides who writes. */
export class SupabaseCalendarRepository implements CalendarRepository {
  async listHolidays(workspaceId: string): Promise<WorkspaceHoliday[]> {
    const result = await db().from("workspace_holidays").select(HOLIDAY).eq("workspace_id", workspaceId).order("starts_on", { ascending: true });
    return unwrapList<Row>(result, "workspace_holidays.list").map(toHoliday);
  }
  async createHoliday(input: WorkspaceHolidayInput): Promise<WorkspaceHoliday> {
    const result = await db().from("workspace_holidays").insert({ workspace_id: input.workspaceId, name: input.name, starts_on: input.startsOn, ends_on: input.endsOn, half_day: input.halfDay, kind: input.kind, note: input.note }).select(HOLIDAY).single();
    return toHoliday(unwrap<Row>(result, "workspace_holidays.create"));
  }
  async updateHoliday(id: string, patch: WorkspaceHolidayPatch): Promise<WorkspaceHoliday> {
    const result = await db().from("workspace_holidays").update(defined({ name: patch.name, starts_on: patch.startsOn, ends_on: patch.endsOn, half_day: patch.halfDay, kind: patch.kind, note: patch.note })).eq("id", id).select(HOLIDAY).single();
    return toHoliday(unwrap<Row>(result, "workspace_holidays.update"));
  }
  async deleteHoliday(id: string): Promise<void> {
    assertOk(await db().from("workspace_holidays").delete().eq("id", id), "workspace_holidays.delete");
  }

  async listLeave(workspaceId: string): Promise<LeaveEntry[]> {
    const rows = await unwrapAll<Row>((from, to) => db().from("leave_entries").select(LEAVE).eq("workspace_id", workspaceId).order("starts_on", { ascending: true }).order("id", { ascending: true }).range(from, to), "leave_entries.list");
    return rows.map(toLeave);
  }
  async createLeave(input: LeaveEntryInput): Promise<LeaveEntry> {
    const result = await db().from("leave_entries").insert({ workspace_id: input.workspaceId, user_id: input.userId, starts_on: input.startsOn, ends_on: input.endsOn, start_half: input.startHalf, end_half: input.endHalf, kind: input.kind, cover_user_id: input.coverUserId, note: input.note }).select(LEAVE).single();
    return toLeave(unwrap<Row>(result, "leave_entries.create"));
  }
  async updateLeave(id: string, patch: LeaveEntryPatch): Promise<LeaveEntry> {
    const result = await db().from("leave_entries").update(defined({ user_id: patch.userId, starts_on: patch.startsOn, ends_on: patch.endsOn, start_half: patch.startHalf, end_half: patch.endHalf, kind: patch.kind, cover_user_id: patch.coverUserId, note: patch.note, status: patch.status })).eq("id", id).select(LEAVE).single();
    return toLeave(unwrap<Row>(result, "leave_entries.update"));
  }
  async deleteLeave(id: string): Promise<void> {
    assertOk(await db().from("leave_entries").delete().eq("id", id), "leave_entries.delete");
  }

  async listKeyDates(workspaceId: string): Promise<CalendarKeyDate[]> {
    const result = await db().from("calendar_key_dates").select(KEY_DATE).eq("workspace_id", workspaceId).order("starts_on", { ascending: true });
    return unwrapList<Row>(result, "calendar_key_dates.list").map(toKeyDate);
  }
  async createKeyDate(input: CalendarKeyDateInput): Promise<CalendarKeyDate> {
    const result = await db().from("calendar_key_dates").insert({ workspace_id: input.workspaceId, name: input.name, starts_on: input.startsOn, ends_on: input.endsOn, color: input.color, note: input.note }).select(KEY_DATE).single();
    return toKeyDate(unwrap<Row>(result, "calendar_key_dates.create"));
  }
  async updateKeyDate(id: string, patch: CalendarKeyDatePatch): Promise<CalendarKeyDate> {
    const result = await db().from("calendar_key_dates").update(defined({ name: patch.name, starts_on: patch.startsOn, ends_on: patch.endsOn, color: patch.color, note: patch.note })).eq("id", id).select(KEY_DATE).single();
    return toKeyDate(unwrap<Row>(result, "calendar_key_dates.update"));
  }
  async deleteKeyDate(id: string): Promise<void> {
    assertOk(await db().from("calendar_key_dates").delete().eq("id", id), "calendar_key_dates.delete");
  }

  async listTasks(workspaceId: string, from: string, to: string): Promise<CalendarTaskRow[]> {
    const rows = await unwrapAll<Row>((a, b) => db().rpc("calendar_tasks", { p_workspace_id: workspaceId, p_from: from, p_to: to }).range(a, b), "calendar_tasks");
    return rows.map((r) => ({
      id: s(r.id),
      boardId: s(r.board_id),
      groupId: s(r.group_id),
      parentItemId: n(r.parent_item_id),
      name: s(r.name),
      ticket: n(r.ticket),
      createdAt: s(r.created_at),
      values: (r.item_values ?? []) as CalendarTaskRow["values"],
      assets: (r.assets ?? []) as CalendarTaskRow["assets"],
    }));
  }

  async getFeed(workspaceId: string, userId: string): Promise<CalendarFeed | null> {
    const result = await db().from("calendar_feeds").select(FEED).eq("workspace_id", workspaceId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
    const row = unwrapMaybe<Row>(result, "calendar_feeds.get");
    return row ? toFeed(row) : null;
  }
  async createFeed(workspaceId: string, userId: string, token: string): Promise<CalendarFeed> {
    const result = await db().from("calendar_feeds").insert({ workspace_id: workspaceId, user_id: userId, token }).select(FEED).single();
    return toFeed(unwrap<Row>(result, "calendar_feeds.create"));
  }
  async revokeFeed(id: string): Promise<void> {
    assertOk(await db().from("calendar_feeds").update({ revoked_at: new Date().toISOString() }).eq("id", id), "calendar_feeds.revoke");
  }
}

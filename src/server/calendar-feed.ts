import type { CalendarKeyDate, ISODate, LeaveEntry, WorkspaceHoliday } from "@/domain";
import { HOLIDAY_KIND_LABELS, LEAVE_KIND_LABELS, addDaysIso, normaliseAssetRates } from "@/domain";
import { createSupabaseRepositories } from "@/data/supabase";
import { routeRepositoriesThrough } from "@/data/supabase/client";
import { buildTaskEvents, todayInVietnam } from "@/features/calendar/model";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { HttpError } from "./http";

const TOKEN = /^[a-z0-9]{40}$/;

/**
 * A person's private calendar feed (iCalendar), read by the token alone, the
 * way calendar apps fetch: the workspace's holidays and key dates, the team's
 * leave (which the whole team sees, D2), and the dated tasks this person is on.
 * Only tasks they carry, so a feed shows nothing about boards they may not open.
 *
 * Dead the moment the feed is replaced or stopped, or the person leaves the
 * workspace.
 */
export async function calendarFeedIcs(token: string): Promise<string> {
  if (!TOKEN.test(token)) throw new HttpError(404, "No such feed");
  const admin = getSupabaseAdminClient();
  const feed = await admin.from("calendar_feeds").select("workspace_id, user_id").eq("token", token).is("revoked_at", null).maybeSingle();
  const row = feed.data as { workspace_id: string; user_id: string } | null;
  if (feed.error || !row) throw new HttpError(404, "No such feed");
  const seat = await admin.from("workspace_members").select("status").eq("workspace_id", row.workspace_id).eq("user_id", row.user_id).maybeSingle();
  if ((seat.data as { status: string } | null)?.status !== "ACTIVE") throw new HttpError(404, "No such feed");

  routeRepositoriesThrough(admin);
  const repos = createSupabaseRepositories();
  const today = todayInVietnam();
  const from = addDaysIso(today, -60);
  const to = addDaysIso(today, 365);
  const [workspace, holidays, leave, keyDates, boards, rows] = await Promise.all([
    repos.workspaces.getById(row.workspace_id),
    repos.calendar.listHolidays(row.workspace_id),
    repos.calendar.listLeave(row.workspace_id),
    repos.calendar.listKeyDates(row.workspace_id),
    repos.boards.listByWorkspace(row.workspace_id),
    repos.calendar.listTasks(row.workspace_id, from, to),
  ]);
  const named = [...new Set((leave as LeaveEntry[]).flatMap((l) => [l.userId, l.coverUserId]).filter((id): id is string => !!id))];
  const people = named.length ? await admin.from("profiles").select("id, display_name").in("id", named) : { data: [] };
  const live = boards.filter((b) => !b.archivedAt && !b.system);
  const columns = await repos.boards.listColumnsForBoards(live.map((b) => b.id));
  const boardName = new Map(live.map((b) => [b.id, b.name]));
  const nameOf = new Map(((people.data ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name ?? "Someone"]));
  const tasks = buildTaskEvents(rows ?? [], columns, normaliseAssetRates(workspace?.assetRates)).filter((t) => boardName.has(t.boardId) && t.peopleIds.includes(row.user_id));

  const name = `${workspace?.name ?? "Streamline"} calendar`;
  const events: string[] = [];
  for (const h of holidays as WorkspaceHoliday[]) {
    if (h.endsOn < from) continue;
    events.push(vevent(`holiday-${h.id}`, h.startsOn, h.endsOn, `${h.name}${h.halfDay ? (h.halfDay === "AM" ? " (morning)" : " (afternoon)") : ""}`, [HOLIDAY_KIND_LABELS[h.kind], h.note].filter(Boolean).join("\n"), h.updatedAt));
  }
  for (const k of keyDates as CalendarKeyDate[]) {
    if (k.endsOn < from) continue;
    events.push(vevent(`key-${k.id}`, k.startsOn, k.endsOn, k.name, k.note ?? "", k.updatedAt));
  }
  for (const l of leave as LeaveEntry[]) {
    if (l.status !== "PLANNED" || l.endsOn < from) continue;
    const who = l.userId === row.user_id ? "You" : (nameOf.get(l.userId) ?? "Someone");
    const cover = l.coverUserId ? `Cover: ${nameOf.get(l.coverUserId) ?? "someone"}` : "";
    events.push(vevent(`leave-${l.id}`, l.startsOn, l.endsOn, `${who}: ${LEAVE_KIND_LABELS[l.kind]}`, [l.startHalf ? "From midday" : "", l.endHalf ? "Back at midday" : "", cover, l.note ?? ""].filter(Boolean).join("\n"), l.updatedAt));
  }
  for (const t of tasks) {
    if (t.done) continue;
    const day = t.dueOn ?? t.endsOn;
    events.push(vevent(`task-${t.itemId}`, day, day, `${t.ticket ? `${t.ticket} ` : ""}${t.name}`, [boardName.get(t.boardId), t.status?.name].filter(Boolean).join(" · "), null));
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Streamline//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${text(name)}`),
    "X-WR-TIMEZONE:Asia/Ho_Chi_Minh",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

const compact = (day: ISODate) => day.replaceAll("-", "");

/** Text as iCalendar wants it: backslashes, commas, semicolons and line breaks escaped. */
function text(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines past 75 octets continue on the next, after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

function vevent(uid: string, startsOn: ISODate, endsOn: ISODate, summary: string, description: string, updatedAt: string | null): string {
  const stamp = (updatedAt ? new Date(updatedAt) : new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@streamline`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${compact(startsOn)}`,
    // All-day events end the day after their last day.
    `DTEND;VALUE=DATE:${compact(addDaysIso(endsOn, 1))}`,
    fold(`SUMMARY:${text(summary)}`),
    ...(description ? [fold(`DESCRIPTION:${text(description)}`)] : []),
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\r\n");
}

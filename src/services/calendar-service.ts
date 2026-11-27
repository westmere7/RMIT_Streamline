import type { CalendarFeed, CalendarKeyDate, CalendarKeyDateInput, CalendarKeyDatePatch, CalendarTaskRow, EntityId, ISODate, LeaveEntry, LeaveEntryInput, LeaveEntryPatch, WorkspaceHoliday, WorkspaceHolidayInput, WorkspaceHolidayPatch } from "@/domain";
import { VIETNAM_HOLIDAYS, isLunarHoliday } from "@/domain";
import type { Repositories } from "@/data/repositories";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Checks a name and a span the way 0162's constraints do, with words a person can act on. */
function checkSpan(startsOn: ISODate, endsOn: ISODate, maxDays: number, what: string): void {
  if (!ISO.test(startsOn) || !ISO.test(endsOn)) throw new Error("Pick the dates");
  if (endsOn < startsOn) throw new Error("The last day is before the first");
  const days = (Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000;
  if (days > maxDays) throw new Error(`${what} can run ${maxDays + 1} days at most`);
}

function checkName(name: string | undefined): void {
  if (name === undefined) return;
  const t = name.trim();
  if (!t) throw new Error("Give it a name");
  if (t.length > 120) throw new Error("Keep the name to 120 characters");
}

function checkNote(note: string | null | undefined): void {
  if (note && note.length > 500) throw new Error("Keep the note to 500 characters");
}

/** A feed token: 40 lowercase letters and digits. */
function newFeedToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(40);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * The workspace Calendar: holidays, leave, key dates, private feeds and the
 * dated tasks the page shows. Who may write what is the database's to decide
 * (0162's RLS); the checks here only catch what a person typed wrong.
 */
export class CalendarService {
  constructor(private readonly repos: Repositories) {}

  // ---- holidays ----------------------------------------------------------------
  listHolidays(workspaceId: EntityId): Promise<WorkspaceHoliday[]> {
    return this.repos.calendar.listHolidays(workspaceId);
  }
  async createHoliday(input: WorkspaceHolidayInput): Promise<WorkspaceHoliday> {
    checkName(input.name);
    checkSpan(input.startsOn, input.endsOn, 60, "A holiday");
    checkNote(input.note);
    if (input.halfDay && input.startsOn !== input.endsOn) throw new Error("A half day is one day");
    return this.repos.calendar.createHoliday({ ...input, name: input.name.trim(), note: input.note?.trim() || null });
  }
  async updateHoliday(id: EntityId, patch: WorkspaceHolidayPatch, current: WorkspaceHoliday): Promise<WorkspaceHoliday> {
    const next = { ...current, ...patch };
    checkName(patch.name);
    checkSpan(next.startsOn, next.endsOn, 60, "A holiday");
    checkNote(patch.note);
    if (next.halfDay && next.startsOn !== next.endsOn) throw new Error("A half day is one day");
    return this.repos.calendar.updateHoliday(id, { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) });
  }
  deleteHoliday(id: EntityId): Promise<void> {
    return this.repos.calendar.deleteHoliday(id);
  }

  /** Vietnam's public holidays for `year` that the workspace does not have yet (by name and first day). */
  async addVietnamYear(workspaceId: EntityId, year: number): Promise<number> {
    const have = await this.listHolidays(workspaceId);
    const known = new Set(have.map((h) => `${h.name}|${h.startsOn}`));
    const missing = VIETNAM_HOLIDAYS.filter((h) => h.startsOn.startsWith(`${year}-`) && !known.has(`${h.name}|${h.startsOn}`));
    for (const h of missing) await this.repos.calendar.createHoliday({ workspaceId, name: h.name, startsOn: h.startsOn, endsOn: h.endsOn, halfDay: null, kind: "PUBLIC", note: null });
    return missing.length;
  }

  /**
   * Copies `fromYear`'s fixed-date holidays to the next year, a year on; lunar
   * ones (Tết, Hùng Kings) move every year and are left for someone to type in.
   */
  async copyYearForward(workspaceId: EntityId, fromYear: number): Promise<{ copied: number; lunar: string[] }> {
    const have = await this.listHolidays(workspaceId);
    const shift = (d: ISODate) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
    const known = new Set(have.map((h) => `${h.name}|${h.startsOn}`));
    const source = have.filter((h) => h.startsOn.startsWith(`${fromYear}-`));
    const lunar = source.filter((h) => isLunarHoliday(h.name)).map((h) => h.name);
    let copied = 0;
    for (const h of source) {
      if (isLunarHoliday(h.name) || h.startsOn.slice(5) === "02-29" || h.endsOn.slice(5) === "02-29") continue;
      if (known.has(`${h.name}|${shift(h.startsOn)}`)) continue;
      await this.repos.calendar.createHoliday({ workspaceId, name: h.name, startsOn: shift(h.startsOn), endsOn: shift(h.endsOn), halfDay: h.halfDay, kind: h.kind, note: h.note });
      copied++;
    }
    return { copied, lunar: [...new Set(lunar)] };
  }

  // ---- leave ---------------------------------------------------------------------
  listLeave(workspaceId: EntityId): Promise<LeaveEntry[]> {
    return this.repos.calendar.listLeave(workspaceId);
  }
  async createLeave(input: LeaveEntryInput): Promise<LeaveEntry> {
    checkSpan(input.startsOn, input.endsOn, 366, "Leave");
    checkNote(input.note);
    if (input.coverUserId && input.coverUserId === input.userId) throw new Error("Pick someone else to cover");
    if (input.startsOn === input.endsOn && input.startHalf && input.endHalf) throw new Error("Pick the morning or the afternoon, not both");
    return this.repos.calendar.createLeave({ ...input, note: input.note?.trim() || null });
  }
  async updateLeave(id: EntityId, patch: LeaveEntryPatch, current: LeaveEntry): Promise<LeaveEntry> {
    const next = { ...current, ...patch };
    checkSpan(next.startsOn, next.endsOn, 366, "Leave");
    checkNote(patch.note);
    if (next.coverUserId && next.coverUserId === next.userId) throw new Error("Pick someone else to cover");
    return this.repos.calendar.updateLeave(id, patch);
  }
  deleteLeave(id: EntityId): Promise<void> {
    return this.repos.calendar.deleteLeave(id);
  }

  // ---- key dates -------------------------------------------------------------------
  listKeyDates(workspaceId: EntityId): Promise<CalendarKeyDate[]> {
    return this.repos.calendar.listKeyDates(workspaceId);
  }
  async createKeyDate(input: CalendarKeyDateInput): Promise<CalendarKeyDate> {
    checkName(input.name);
    checkSpan(input.startsOn, input.endsOn, 120, "A key date");
    checkNote(input.note);
    return this.repos.calendar.createKeyDate({ ...input, name: input.name.trim(), note: input.note?.trim() || null });
  }
  async updateKeyDate(id: EntityId, patch: CalendarKeyDatePatch, current: CalendarKeyDate): Promise<CalendarKeyDate> {
    const next = { ...current, ...patch };
    checkName(patch.name);
    checkSpan(next.startsOn, next.endsOn, 120, "A key date");
    checkNote(patch.note);
    return this.repos.calendar.updateKeyDate(id, patch);
  }
  deleteKeyDate(id: EntityId): Promise<void> {
    return this.repos.calendar.deleteKeyDate(id);
  }

  // ---- tasks -------------------------------------------------------------------------
  /**
   * Every live task on the workspace's team boards with a date or a timeline
   * meeting [from, to]: one read where the store has it (calendar_tasks), else
   * built from each board's columns, values and deliverables.
   */
  async listTasks(workspaceId: EntityId, from: ISODate, to: ISODate): Promise<CalendarTaskRow[]> {
    const direct = await this.repos.calendar.listTasks(workspaceId, from, to);
    if (direct) return direct;
    const boards = (await this.repos.boards.listByWorkspace(workspaceId)).filter((b) => !b.archivedAt && !b.system);
    const perBoard = await Promise.all(
      boards.map(async (board) => {
        const [columns, items, values, assets] = await Promise.all([this.repos.boards.listColumns(board.id), this.repos.items.listByBoard(board.id), this.repos.items.listValuesByBoard(board.id), this.repos.itemAssets.listByBoard(board.id)]);
        const dateColumns = new Map(columns.filter((c) => !c.removed && (c.type === "DATE" || c.type === "TIMELINE")).map((c) => [c.id, c.type]));
        const dated = new Set<EntityId>();
        for (const v of values) {
          const type = dateColumns.get(v.columnId);
          if (!type) continue;
          const value = v.value as { date?: string; start?: string; end?: string };
          if (type === "DATE" && value.date && ISO.test(value.date) && value.date >= from && value.date <= to) dated.add(v.itemId);
          if (type === "TIMELINE" && value.start && ISO.test(value.start)) {
            const end = value.end && ISO.test(value.end) ? value.end : value.start;
            if (value.start <= to && end >= from) dated.add(v.itemId);
          }
        }
        return items
          .filter((i) => dated.has(i.id) && !i.archivedAt)
          .map(
            (i): CalendarTaskRow => ({
              id: i.id,
              boardId: i.boardId,
              groupId: i.groupId,
              parentItemId: i.parentItemId ?? null,
              name: i.name,
              ticket: i.ticket ?? null,
              createdAt: i.createdAt,
              values: values.filter((v) => v.itemId === i.id).map((v) => ({ columnId: v.columnId, value: v.value })),
              assets: assets.filter((a) => a.itemId === i.id).map((a) => ({ assetType: a.assetType ?? null, quantity: a.quantity ?? null, dueDate: a.dueDate ?? null, completedAt: a.completedAt ?? null, assigneeIds: a.assigneeIds ?? [] })),
            }),
          );
      }),
    );
    return perBoard.flat();
  }

  // ---- feeds -----------------------------------------------------------------------
  getFeed(workspaceId: EntityId, userId: EntityId): Promise<CalendarFeed | null> {
    return this.repos.calendar.getFeed(workspaceId, userId);
  }
  async getOrCreateFeed(workspaceId: EntityId, userId: EntityId): Promise<CalendarFeed> {
    return (await this.repos.calendar.getFeed(workspaceId, userId)) ?? this.repos.calendar.createFeed(workspaceId, userId, newFeedToken());
  }
  /** A new address: the old one stops working at once. */
  async replaceFeed(workspaceId: EntityId, userId: EntityId): Promise<CalendarFeed> {
    const current = await this.repos.calendar.getFeed(workspaceId, userId);
    if (current) await this.repos.calendar.revokeFeed(current.id);
    return this.repos.calendar.createFeed(workspaceId, userId, newFeedToken());
  }
  async stopFeed(workspaceId: EntityId, userId: EntityId): Promise<void> {
    const current = await this.repos.calendar.getFeed(workspaceId, userId);
    if (current) await this.repos.calendar.revokeFeed(current.id);
  }
}

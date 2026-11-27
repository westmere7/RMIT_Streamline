import type { CalendarFeed, CalendarKeyDate, CalendarKeyDateInput, CalendarKeyDatePatch, CalendarTaskRow, LeaveEntry, LeaveEntryInput, LeaveEntryPatch, WorkspaceHoliday, WorkspaceHolidayInput, WorkspaceHolidayPatch } from "@/domain";
import { VIETNAM_HOLIDAYS } from "@/domain";
import type { CalendarRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";

/**
 * The Calendar for the local store and the in-memory one: this browser's own
 * lists (or this process's), seeded with Vietnam's holidays the first time a
 * workspace is read, as migration 0162 seeds them. The dated tasks have no one
 * read here; the service builds them from the boards.
 */
export class LocalCalendarRepository implements CalendarRepository {
  constructor(private readonly store: ListStore = browserStore) {}

  async listHolidays(workspaceId: string): Promise<WorkspaceHoliday[]> {
    const key = `holidays.${workspaceId}`;
    let list = this.store.read<WorkspaceHoliday>(key);
    if (list === null) {
      const at = nowIso();
      list = VIETNAM_HOLIDAYS.map((h) => ({ id: newId(), workspaceId, name: h.name, startsOn: h.startsOn, endsOn: h.endsOn, halfDay: null, kind: "PUBLIC" as const, note: null, createdBy: null, createdAt: at, updatedAt: at }));
      this.store.write(key, list);
    }
    return [...list].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }
  async createHoliday(input: WorkspaceHolidayInput): Promise<WorkspaceHoliday> {
    await this.listHolidays(input.workspaceId);
    return this.add<WorkspaceHoliday>(`holidays.${input.workspaceId}`, { ...input, id: newId(), createdBy: null, createdAt: nowIso(), updatedAt: nowIso() });
  }
  async updateHoliday(id: string, patch: WorkspaceHolidayPatch): Promise<WorkspaceHoliday> {
    return this.patch<WorkspaceHoliday>("holidays.", id, patch, "Holiday");
  }
  async deleteHoliday(id: string): Promise<void> {
    this.remove("holidays.", id);
  }

  async listLeave(workspaceId: string): Promise<LeaveEntry[]> {
    return [...(this.store.read<LeaveEntry>(`leave.${workspaceId}`) ?? [])].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }
  async createLeave(input: LeaveEntryInput): Promise<LeaveEntry> {
    if (input.endsOn < input.startsOn) throw new Error("leave_entries: the last day is before the first");
    return this.add<LeaveEntry>(`leave.${input.workspaceId}`, { ...input, id: newId(), status: "PLANNED", createdBy: null, createdAt: nowIso(), updatedAt: nowIso() });
  }
  async updateLeave(id: string, patch: LeaveEntryPatch): Promise<LeaveEntry> {
    return this.patch<LeaveEntry>("leave.", id, patch, "Leave");
  }
  async deleteLeave(id: string): Promise<void> {
    this.remove("leave.", id);
  }

  async listKeyDates(workspaceId: string): Promise<CalendarKeyDate[]> {
    return [...(this.store.read<CalendarKeyDate>(`keydates.${workspaceId}`) ?? [])].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }
  async createKeyDate(input: CalendarKeyDateInput): Promise<CalendarKeyDate> {
    return this.add<CalendarKeyDate>(`keydates.${input.workspaceId}`, { ...input, id: newId(), createdBy: null, createdAt: nowIso(), updatedAt: nowIso() });
  }
  async updateKeyDate(id: string, patch: CalendarKeyDatePatch): Promise<CalendarKeyDate> {
    return this.patch<CalendarKeyDate>("keydates.", id, patch, "Key date");
  }
  async deleteKeyDate(id: string): Promise<void> {
    this.remove("keydates.", id);
  }

  async listTasks(): Promise<CalendarTaskRow[] | null> {
    return null;
  }

  async getFeed(workspaceId: string, userId: string): Promise<CalendarFeed | null> {
    return (this.store.read<CalendarFeed>(`feeds.${workspaceId}`) ?? []).find((f) => f.userId === userId && !f.revokedAt) ?? null;
  }
  async createFeed(workspaceId: string, userId: string, token: string): Promise<CalendarFeed> {
    return this.add<CalendarFeed>(`feeds.${workspaceId}`, { id: newId(), workspaceId, userId, token, createdAt: nowIso(), revokedAt: null });
  }
  async revokeFeed(id: string): Promise<void> {
    for (const key of this.store.keys("feeds.")) {
      const list = this.store.read<CalendarFeed>(key) ?? [];
      if (list.some((f) => f.id === id)) this.store.write(key, list.map((f) => (f.id === id ? { ...f, revokedAt: nowIso() } : f)));
    }
  }

  private add<T extends { id: string }>(key: string, row: T): T {
    this.store.write(key, [...(this.store.read<T>(key) ?? []), row]);
    return row;
  }
  private patch<T extends { id: string; updatedAt?: string }>(prefix: string, id: string, patch: object, what: string): T {
    for (const key of this.store.keys(prefix)) {
      const list = this.store.read<T>(key) ?? [];
      const found = list.find((r) => r.id === id);
      if (!found) continue;
      const next = { ...found, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: nowIso() } as T;
      this.store.write(key, list.map((r) => (r.id === id ? next : r)));
      return next;
    }
    throw new NotFoundError(what, id);
  }
  private remove(prefix: string, id: string): void {
    for (const key of this.store.keys(prefix)) {
      const list = this.store.read<{ id: string }>(key) ?? [];
      if (list.some((r) => r.id === id)) this.store.write(key, list.filter((r) => r.id !== id));
    }
  }
}

/** Where the lists live: browser storage, or a plain map for tests and the in-memory store. */
export interface ListStore {
  read<T>(key: string): T[] | null;
  write<T>(key: string, list: T[]): void;
  keys(prefix: string): string[];
}

const PREFIX = "streamline.calendar.";

const browserStore: ListStore = {
  read<T>(key: string): T[] | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T[]) : null;
    } catch {
      return null;
    }
  },
  write<T>(key: string, list: T[]): void {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(list));
    } catch {
      // Storage refused: the change lasts as long as the page.
    }
  },
  keys(prefix: string): string[] {
    if (typeof window === "undefined") return [];
    const out: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX + prefix)) out.push(k.slice(PREFIX.length));
    }
    return out;
  },
};

/** A ListStore in a Map, for the in-memory repositories and tests. */
export function memoryListStore(): ListStore {
  const map = new Map<string, unknown[]>();
  return {
    read: <T>(key: string) => (map.get(key) as T[] | undefined) ?? null,
    write: <T>(key: string, list: T[]) => void map.set(key, list),
    keys: (prefix: string) => [...map.keys()].filter((k) => k.startsWith(prefix)),
  };
}

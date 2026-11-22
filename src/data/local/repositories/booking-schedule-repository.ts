import type { BookingFormSchedule, BookingFormScheduleInput, BookingFormSchedulePatch } from "@/domain";
import { overlappingSchedule } from "@/domain";
import type { BookingScheduleRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";

const PREFIX = "streamline.booking-schedules.";
const KEY = (workspaceId: string) => PREFIX + workspaceId;

/**
 * The local store's scheduled forms: this browser's own list per workspace, in
 * storage, like its past forms. Overlaps are refused here as the database's
 * trigger refuses them (migration 0151).
 */
export class LocalBookingScheduleRepository implements BookingScheduleRepository {
  async listByWorkspace(workspaceId: string): Promise<BookingFormSchedule[]> {
    return read(workspaceId).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  }

  async create(input: BookingFormScheduleInput): Promise<BookingFormSchedule> {
    const list = read(input.workspaceId);
    if (overlappingSchedule(list, input.startsOn, input.endsOn)) throw new Error("booking_form_schedules: those days overlap another scheduled form");
    const saved: BookingFormSchedule = { ...input, id: newId(), createdAt: nowIso() };
    write(input.workspaceId, [...list, saved]);
    return saved;
  }

  async update(id: string, patch: BookingFormSchedulePatch): Promise<BookingFormSchedule> {
    const found = locate(id);
    if (!found) throw new NotFoundError("Scheduled form", id);
    const next = { ...found.row, ...patch };
    if (overlappingSchedule(found.list, next.startsOn, next.endsOn, id)) throw new Error("booking_form_schedules: those days overlap another scheduled form");
    write(found.workspaceId, found.list.map((s) => (s.id === id ? next : s)));
    return next;
  }

  async delete(id: string): Promise<void> {
    const found = locate(id);
    if (found) write(found.workspaceId, found.list.filter((s) => s.id !== id));
  }
}

function read(workspaceId: string): BookingFormSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY(workspaceId));
    return raw ? (JSON.parse(raw) as BookingFormSchedule[]) : [];
  } catch {
    return [];
  }
}

function write(workspaceId: string, list: BookingFormSchedule[]): void {
  try {
    window.localStorage.setItem(KEY(workspaceId), JSON.stringify(list));
  } catch {
    // Storage refused: nothing is scheduled in this browser.
  }
}

function locate(id: string): { workspaceId: string; list: BookingFormSchedule[]; row: BookingFormSchedule } | null {
  if (typeof window === "undefined") return null;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const workspaceId = key.slice(PREFIX.length);
    const list = read(workspaceId);
    const row = list.find((s) => s.id === id);
    if (row) return { workspaceId, list, row };
  }
  return null;
}

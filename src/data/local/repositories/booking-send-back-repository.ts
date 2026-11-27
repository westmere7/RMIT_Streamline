import type { BookingSendBack, StoredBookingRequest } from "@/domain";
import { ALREADY_WAITING, RefusedError, isOpenSendBack } from "@/domain";
import type { BookingRequestRepository, BookingSendBackRepository } from "@/data/repositories";
import { NotFoundError } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/** The booking as last sent, one per task. */
export class LocalBookingRequestRepository implements BookingRequestRepository {
  constructor(private readonly conn: LocalConnection) {}

  async get(itemId: string): Promise<StoredBookingRequest | null> {
    const db = await this.conn.getDb();
    return (await db.get("bookingRequests", itemId)) ?? null;
  }

  async put(input: Pick<StoredBookingRequest, "itemId" | "workspaceId" | "request">): Promise<StoredBookingRequest> {
    const db = await this.conn.getDb();
    const existing = await db.get("bookingRequests", input.itemId);
    const now = nowIso();
    const row: StoredBookingRequest = { ...input, request: structuredClone(input.request), createdAt: existing?.createdAt ?? now, updatedAt: now };
    await db.put("bookingRequests", row);
    return row;
  }
}

/** Tasks sent back to their requester: found by the task, or by the token in the requester's link. */
export class LocalBookingSendBackRepository implements BookingSendBackRepository {
  constructor(private readonly conn: LocalConnection) {}

  async openFor(itemId: string): Promise<BookingSendBack | null> {
    const db = await this.conn.getDb();
    const rows = await db.getAllFromIndex("bookingSendBacks", "byItem", itemId);
    return rows.filter(isOpenSendBack).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0] ?? null;
  }

  async getByToken(token: string): Promise<BookingSendBack | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("bookingSendBacks", "byToken", token)) ?? null;
  }

  async create(input: Omit<BookingSendBack, "id" | "sentAt" | "resubmittedAt" | "cancelledAt">): Promise<BookingSendBack> {
    const db = await this.conn.getDb();
    // One open per task, as the database's unique index says on Supabase.
    if ((await this.openFor(input.itemId)) !== null) throw new RefusedError(ALREADY_WAITING);
    const row: BookingSendBack = { ...input, id: newId(), sentAt: nowIso(), resubmittedAt: null, cancelledAt: null };
    await db.put("bookingSendBacks", row);
    return row;
  }

  async update(id: string, patch: Partial<Pick<BookingSendBack, "resubmittedAt" | "cancelledAt">>): Promise<BookingSendBack> {
    const db = await this.conn.getDb();
    const existing = await db.get("bookingSendBacks", id);
    if (!existing) throw new NotFoundError("BookingSendBack", id);
    const updated: BookingSendBack = { ...existing, ...patch, id };
    await db.put("bookingSendBacks", updated);
    return updated;
  }

  async openItemIds(itemIds: readonly string[]): Promise<string[]> {
    const db = await this.conn.getDb();
    const wanted = new Set(itemIds);
    return [...new Set((await db.getAll("bookingSendBacks")).filter((s) => wanted.has(s.itemId) && isOpenSendBack(s)).map((s) => s.itemId))];
  }

  async claimResubmission(id: string, at: string): Promise<boolean> {
    const db = await this.conn.getDb();
    // One transaction: read and write together, as the database's conditional update is.
    const tx = db.transaction("bookingSendBacks", "readwrite");
    const existing = await tx.store.get(id);
    if (!existing || !isOpenSendBack(existing)) {
      await tx.done;
      return false;
    }
    await tx.store.put({ ...existing, resubmittedAt: at });
    await tx.done;
    return true;
  }
}

import type { BookingRequest, BookingSendBack, StoredBookingRequest } from "@/domain";
import type { BookingRequestRepository, BookingSendBackRepository } from "@/data/repositories";
import { db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

const REQUEST = "item_id, workspace_id, request, created_at, updated_at";

interface BookingRequestRow {
  item_id: string;
  workspace_id: string;
  request: BookingRequest;
  created_at: string;
  updated_at: string;
}

const toStored = (row: BookingRequestRow): StoredBookingRequest => ({ itemId: row.item_id, workspaceId: row.workspace_id, request: row.request, createdAt: row.created_at, updatedAt: row.updated_at });

/**
 * The booking as last sent (migrations/0158). It holds the requester's email,
 * so it has no policy at all: only the server's service role (booking, the
 * portal and the send-back routes) reads or writes it.
 */
export class SupabaseBookingRequestRepository implements BookingRequestRepository {
  async get(itemId: string): Promise<StoredBookingRequest | null> {
    const row = unwrapMaybe<BookingRequestRow>(await db().from("booking_requests").select(REQUEST).eq("item_id", itemId).maybeSingle(), "booking_requests.get");
    return row ? toStored(row) : null;
  }

  async put(input: Pick<StoredBookingRequest, "itemId" | "workspaceId" | "request">): Promise<StoredBookingRequest> {
    const result = await db()
      .from("booking_requests")
      .upsert({ item_id: input.itemId, workspace_id: input.workspaceId, request: input.request, updated_at: new Date().toISOString() }, { onConflict: "item_id" })
      .select(REQUEST)
      .single();
    return toStored(unwrap<BookingRequestRow>(result, "booking_requests.put"));
  }
}

const SEND_BACK = "id, workspace_id, item_id, note, token, sent_by, sent_at, expires_at, resubmitted_at, cancelled_at";

interface SendBackRow {
  id: string;
  workspace_id: string;
  item_id: string;
  note: string;
  token: string;
  sent_by: string;
  sent_at: string;
  expires_at: string;
  resubmitted_at: string | null;
  cancelled_at: string | null;
}

const toSendBack = (row: SendBackRow): BookingSendBack => ({
  id: row.id,
  workspaceId: row.workspace_id,
  itemId: row.item_id,
  note: row.note,
  token: row.token,
  sentBy: row.sent_by,
  sentAt: row.sent_at,
  expiresAt: row.expires_at,
  resubmittedAt: row.resubmitted_at,
  cancelledAt: row.cancelled_at,
});

/**
 * Tasks sent back to their requester (migrations/0158, policies/0040). People
 * who can edit the task read the row, token included, to copy the link again;
 * nobody's session writes it: the routes under src/app/api/booking-send-back
 * check the caller and write with the service role, and the requester's own
 * route (src/app/api/booking-resubmit) is answered by the service role alone.
 */
export class SupabaseBookingSendBackRepository implements BookingSendBackRepository {
  async openFor(itemId: string): Promise<BookingSendBack | null> {
    const result = await db().from("booking_sendbacks").select(SEND_BACK).eq("item_id", itemId).is("resubmitted_at", null).is("cancelled_at", null).order("sent_at", { ascending: false }).limit(1);
    const row = unwrapList<SendBackRow>(result, "booking_sendbacks.openFor")[0];
    return row ? toSendBack(row) : null;
  }

  async getByToken(token: string): Promise<BookingSendBack | null> {
    const row = unwrapMaybe<SendBackRow>(await db().from("booking_sendbacks").select(SEND_BACK).eq("token", token).maybeSingle(), "booking_sendbacks.getByToken");
    return row ? toSendBack(row) : null;
  }

  async create(input: Omit<BookingSendBack, "id" | "sentAt" | "resubmittedAt" | "cancelledAt">): Promise<BookingSendBack> {
    const result = await db()
      .from("booking_sendbacks")
      .insert({ workspace_id: input.workspaceId, item_id: input.itemId, note: input.note, token: input.token, sent_by: input.sentBy, expires_at: input.expiresAt })
      .select(SEND_BACK)
      .single();
    return toSendBack(unwrap<SendBackRow>(result, "booking_sendbacks.create"));
  }

  async update(id: string, patch: Partial<Pick<BookingSendBack, "resubmittedAt" | "cancelledAt">>): Promise<BookingSendBack> {
    const payload = pruneUndefined({ resubmitted_at: patch.resubmittedAt, cancelled_at: patch.cancelledAt });
    const result = await db().from("booking_sendbacks").update(payload).eq("id", id).select(SEND_BACK).single();
    return toSendBack(unwrap<SendBackRow>(result, "booking_sendbacks.update"));
  }

  async openItemIds(itemIds: readonly string[]): Promise<string[]> {
    const found = new Set<string>();
    // In slices: a long list of ids in one query string runs past the URL limit.
    for (let at = 0; at < itemIds.length; at += 150) {
      const slice = itemIds.slice(at, at + 150);
      const result = await db().from("booking_sendbacks").select("item_id").in("item_id", slice).is("resubmitted_at", null).is("cancelled_at", null);
      for (const row of unwrapList<{ item_id: string }>(result, "booking_sendbacks.openItemIds")) found.add(row.item_id);
    }
    return [...found];
  }

  async claimResubmission(id: string, at: string): Promise<boolean> {
    // Conditional in the database: only a row still open is changed, so of two at once one wins.
    const result = await db().from("booking_sendbacks").update({ resubmitted_at: at }).eq("id", id).is("resubmitted_at", null).is("cancelled_at", null).select("id");
    return unwrapList<{ id: string }>(result, "booking_sendbacks.claimResubmission").length === 1;
  }
}

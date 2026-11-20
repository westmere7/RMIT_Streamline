import type { BookingFormPublication, BookingFormPublicationInput, BookingFormTemplate } from "@/domain";
import type { BookingPublicationRepository } from "@/data/repositories";
import { db, unwrap, unwrapList } from "../client";

const PUBLICATION = "id, workspace_id, name, template, published_at, published_by";

interface PublicationRow {
  id: string;
  workspace_id: string;
  name: string | null;
  template: BookingFormTemplate | null;
  published_at: string;
  published_by: string | null;
}

function toPublication(row: PublicationRow): BookingFormPublication {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, template: row.template, publishedAt: row.published_at, publishedBy: row.published_by };
}

/** The booking form's past publishes (migration 0127): admins read them and add to them as themselves. */
export class SupabaseBookingPublicationRepository implements BookingPublicationRepository {
  async listByWorkspace(workspaceId: string, limit: number): Promise<BookingFormPublication[]> {
    const result = await db().from("booking_form_publications").select(PUBLICATION).eq("workspace_id", workspaceId).order("published_at", { ascending: false }).limit(limit);
    return unwrapList<PublicationRow>(result, "booking_form_publications.listByWorkspace").map(toPublication);
  }

  async getById(id: string): Promise<BookingFormPublication | null> {
    const result = await db().from("booking_form_publications").select(PUBLICATION).eq("id", id).maybeSingle();
    const row = unwrap<PublicationRow | null>(result, "booking_form_publications.getById");
    return row ? toPublication(row) : null;
  }

  async create(input: BookingFormPublicationInput): Promise<BookingFormPublication> {
    const payload = { workspace_id: input.workspaceId, name: input.name, template: input.template, published_at: input.publishedAt, published_by: input.publishedBy };
    const result = await db().from("booking_form_publications").insert(payload).select(PUBLICATION).single();
    return toPublication(unwrap<PublicationRow>(result, "booking_form_publications.create"));
  }
}

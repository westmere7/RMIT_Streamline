import type { BookingFormTemplate, BookingTemplate, BookingTemplateInput } from "@/domain";
import type { BookingTemplateRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined } from "../rows";

const TEMPLATE = "id, workspace_id, name, description, template, created_by, created_at, updated_at";

interface BookingTemplateRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  template: BookingFormTemplate;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toBookingTemplate(row: BookingTemplateRow): BookingTemplate {
  return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description ?? null, template: row.template, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Saved booking forms. `booking_templates_*` policies let members read and admins write. */
export class SupabaseBookingTemplateRepository implements BookingTemplateRepository {
  async listByWorkspace(workspaceId: string): Promise<BookingTemplate[]> {
    const result = await db().from("booking_templates").select(TEMPLATE).eq("workspace_id", workspaceId).order("name", { ascending: true });
    return unwrapList<BookingTemplateRow>(result, "booking_templates.listByWorkspace").map(toBookingTemplate);
  }

  async getById(id: string): Promise<BookingTemplate | null> {
    const result = await db().from("booking_templates").select(TEMPLATE).eq("id", id).maybeSingle();
    const row = unwrapMaybe<BookingTemplateRow>(result, "booking_templates.getById");
    return row ? toBookingTemplate(row) : null;
  }

  async create(input: BookingTemplateInput): Promise<BookingTemplate> {
    const payload = { workspace_id: input.workspaceId, name: input.name, description: input.description, template: input.template, created_by: input.createdBy };
    const result = await db().from("booking_templates").insert(payload).select(TEMPLATE).single();
    return toBookingTemplate(unwrap<BookingTemplateRow>(result, "booking_templates.create"));
  }

  async update(id: string, patch: Partial<Pick<BookingTemplate, "name" | "description" | "template">>): Promise<BookingTemplate> {
    const payload = pruneUndefined({ name: patch.name, description: patch.description, template: patch.template });
    const result = await db().from("booking_templates").update(payload).eq("id", id).select(TEMPLATE).single();
    return toBookingTemplate(unwrap<BookingTemplateRow>(result, "booking_templates.update"));
  }

  async delete(id: string): Promise<void> {
    assertOk(await db().from("booking_templates").delete().eq("id", id), "booking_templates.delete");
  }
}

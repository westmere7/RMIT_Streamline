import type { BookingFormSchedule, BookingFormScheduleInput, BookingFormSchedulePatch, BookingFormTemplate } from "@/domain";
import type { BookingScheduleRepository } from "@/data/repositories";
import { db, unwrap, unwrapList } from "../client";

const SCHEDULE = "id, workspace_id, template_id, name, form, starts_on, ends_on, created_by, created_at";

interface ScheduleRow {
  id: string;
  workspace_id: string;
  template_id: string | null;
  name: string;
  form: BookingFormTemplate;
  starts_on: string;
  ends_on: string;
  created_by: string | null;
  created_at: string;
}

function toSchedule(row: ScheduleRow): BookingFormSchedule {
  return { id: row.id, workspaceId: row.workspace_id, templateId: row.template_id, name: row.name, template: row.form, startsOn: row.starts_on, endsOn: row.ends_on, createdBy: row.created_by, createdAt: row.created_at };
}

/** Scheduled forms (migration 0151): workspace admins, and the server with the service role. */
export class SupabaseBookingScheduleRepository implements BookingScheduleRepository {
  async listByWorkspace(workspaceId: string): Promise<BookingFormSchedule[]> {
    const result = await db().from("booking_form_schedules").select(SCHEDULE).eq("workspace_id", workspaceId).order("starts_on", { ascending: true });
    return unwrapList<ScheduleRow>(result, "booking_form_schedules.listByWorkspace").map(toSchedule);
  }

  async create(input: BookingFormScheduleInput): Promise<BookingFormSchedule> {
    const payload = { workspace_id: input.workspaceId, template_id: input.templateId, name: input.name, form: input.template, starts_on: input.startsOn, ends_on: input.endsOn, created_by: input.createdBy };
    const result = await db().from("booking_form_schedules").insert(payload).select(SCHEDULE).single();
    return toSchedule(unwrap<ScheduleRow>(result, "booking_form_schedules.create"));
  }

  async update(id: string, patch: BookingFormSchedulePatch): Promise<BookingFormSchedule> {
    const payload = {
      ...(patch.startsOn !== undefined ? { starts_on: patch.startsOn } : {}),
      ...(patch.endsOn !== undefined ? { ends_on: patch.endsOn } : {}),
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.template !== undefined ? { form: patch.template } : {}),
    };
    const result = await db().from("booking_form_schedules").update(payload).eq("id", id).select(SCHEDULE).single();
    return toSchedule(unwrap<ScheduleRow>(result, "booking_form_schedules.update"));
  }

  async delete(id: string): Promise<void> {
    const result = await db().from("booking_form_schedules").delete().eq("id", id);
    if (result.error) throw new Error(`booking_form_schedules.delete: ${result.error.message}`);
  }
}

import type {
  StakeholderPortal,
  StakeholderPortalInput,
  DepartmentStatus,
  PortalRequest,
  PortalRequestInput,
  PortalRequestSource,
  PortalSubmission,
  PortalTheme,
  StakeholderDepartment,
  StakeholderDepartmentInput,
} from "@/domain";
import { asColor, isPortalColumnKey, isPortalView, PORTAL_PAGE_SIZE } from "@/domain";
import type { StakeholderPortalRepository } from "@/data/repositories";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";

const DEPARTMENT = "id, workspace_id, name, color, position, status, created_at, updated_at";
const PORTAL =
  "id, workspace_id, department_id, enabled, token, password_hash, credential_version, default_theme, description, hidden_columns, default_view, allow_booking, show_recap, show_item_groups, created_at, updated_at";
const REQUEST = "id, workspace_id, department_id, item_id, source, public_brief, booked_at, created_at, updated_at";
const SUBMISSION = "id, portal_id, submission_key, request_hash, item_id, receipt, created_at";

interface DepartmentRow {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  position: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface PortalRow {
  id: string;
  workspace_id: string;
  department_id: string;
  enabled: boolean;
  token: string;
  password_hash: string | null;
  credential_version: number;
  default_theme: string;
  description: string | null;
  hidden_columns: unknown;
  default_view: string;
  allow_booking: boolean;
  show_recap: boolean;
  show_item_groups: boolean | null;
  created_at: string;
  updated_at: string;
}

interface RequestRow {
  id: string;
  workspace_id: string;
  department_id: string;
  item_id: string;
  source: string;
  public_brief: string | null;
  booked_at: string;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  id: string;
  portal_id: string;
  submission_key: string;
  request_hash: string;
  item_id: string | null;
  receipt: unknown;
  created_at: string;
}

function toDepartment(row: DepartmentRow): StakeholderDepartment {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    color: asColor(row.color),
    position: row.position,
    status: row.status as DepartmentStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPortal(row: PortalRow): StakeholderPortal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    departmentId: row.department_id,
    enabled: row.enabled,
    token: row.token,
    passwordHash: row.password_hash,
    credentialVersion: row.credential_version,
    defaultTheme: row.default_theme as PortalTheme,
    description: row.description,
    // Read defensively: these arrived in migration 0031 and a row written by an
    // older deployment, or by hand, may carry anything or nothing.
    hiddenColumns: Array.isArray(row.hidden_columns) ? row.hidden_columns.filter(isPortalColumnKey) : [],
    defaultView: isPortalView(row.default_view) ? row.default_view : "table",
    allowBooking: row.allow_booking ?? true,
    showRecap: row.show_recap ?? true,
    showItemGroups: row.show_item_groups ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRequest(row: RequestRow): PortalRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    departmentId: row.department_id,
    itemId: row.item_id,
    source: row.source as PortalRequestSource,
    publicBrief: row.public_brief,
    bookedAt: row.booked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSubmission(row: SubmissionRow): PortalSubmission {
  return {
    id: row.id,
    portalId: row.portal_id,
    submissionKey: row.submission_key,
    requestHash: row.request_hash,
    itemId: row.item_id,
    receipt: row.receipt,
    createdAt: row.created_at,
  };
}

/**
 * Departments, portals and provenance in Postgres.
 *
 * Members read departments; everything else is admin-only, and the policies in
 * policies/0013_stakeholder_portal_policies.sql say so rather than relying on
 * this class. A visitor's reads never come through a browser client at all —
 * they run in src/server/portal.ts with the service role, behind a gate.
 */
export class SupabaseStakeholderPortalRepository implements StakeholderPortalRepository {
  // ---- departments ---------------------------------------------------------

  async listDepartments(workspaceId: string, options: { includeDisabled?: boolean } = {}): Promise<StakeholderDepartment[]> {
    let query = db().from("stakeholder_departments").select(DEPARTMENT).eq("workspace_id", workspaceId);
    if (!options.includeDisabled) query = query.eq("status", "ACTIVE");
    const result = await query.order("position", { ascending: true }).order("name", { ascending: true });
    return unwrapList<DepartmentRow>(result, "stakeholder_departments.listByWorkspace").map(toDepartment);
  }

  async getDepartment(id: string): Promise<StakeholderDepartment | null> {
    const result = await db().from("stakeholder_departments").select(DEPARTMENT).eq("id", id).maybeSingle();
    const row = unwrapMaybe<DepartmentRow>(result, "stakeholder_departments.getById");
    return row ? toDepartment(row) : null;
  }

  async createDepartment(input: StakeholderDepartmentInput): Promise<StakeholderDepartment> {
    const payload = { workspace_id: input.workspaceId, name: input.name, color: input.color, position: input.position };
    const result = await db().from("stakeholder_departments").insert(payload).select(DEPARTMENT).single();
    return toDepartment(unwrap<DepartmentRow>(result, "stakeholder_departments.create"));
  }

  async updateDepartment(id: string, patch: Partial<Pick<StakeholderDepartment, "name" | "color" | "position" | "status">>): Promise<StakeholderDepartment> {
    const payload: Record<string, unknown> = {};
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.color !== undefined) payload.color = patch.color;
    if (patch.position !== undefined) payload.position = patch.position;
    if (patch.status !== undefined) payload.status = patch.status;
    const result = await db().from("stakeholder_departments").update(payload).eq("id", id).select(DEPARTMENT).single();
    return toDepartment(unwrap<DepartmentRow>(result, "stakeholder_departments.update"));
  }

  // ---- portals -------------------------------------------------------------

  async listPortals(workspaceId: string): Promise<StakeholderPortal[]> {
    const result = await db().from("department_portals").select(PORTAL).eq("workspace_id", workspaceId);
    return unwrapList<PortalRow>(result, "department_portals.listByWorkspace").map(toPortal);
  }

  async getUnifiedPortal(workspaceId: string): Promise<StakeholderPortal | null> {
    const result = await db().from("department_portals").select(PORTAL).eq("workspace_id", workspaceId).is("department_id", null).maybeSingle();
    const row = unwrapMaybe<PortalRow>(result, "department_portals.getUnified");
    return row ? toPortal(row) : null;
  }

  async getPortalByDepartment(departmentId: string): Promise<StakeholderPortal | null> {
    const result = await db().from("department_portals").select(PORTAL).eq("department_id", departmentId).maybeSingle();
    const row = unwrapMaybe<PortalRow>(result, "department_portals.byDepartment");
    return row ? toPortal(row) : null;
  }

  async getPortalByToken(token: string): Promise<StakeholderPortal | null> {
    const result = await db().from("department_portals").select(PORTAL).eq("token", token).maybeSingle();
    const row = unwrapMaybe<PortalRow>(result, "department_portals.byToken");
    return row ? toPortal(row) : null;
  }

  async createPortal(input: StakeholderPortalInput): Promise<StakeholderPortal> {
    const payload = {
      workspace_id: input.workspaceId,
      department_id: input.departmentId,
      enabled: input.enabled,
      token: input.token,
      password_hash: input.passwordHash,
      default_theme: input.defaultTheme,
    };
    const result = await db().from("department_portals").insert(payload).select(PORTAL).single();
    return toPortal(unwrap<PortalRow>(result, "department_portals.create"));
  }

  async updatePortal(id: string, patch: Partial<Pick<StakeholderPortal, "enabled" | "token" | "passwordHash" | "defaultTheme" | "credentialVersion" | "description" | "hiddenColumns" | "defaultView" | "allowBooking" | "showRecap" | "showItemGroups">>): Promise<StakeholderPortal> {
    const payload: Record<string, unknown> = {};
    if (patch.enabled !== undefined) payload.enabled = patch.enabled;
    if (patch.token !== undefined) payload.token = patch.token;
    if (patch.passwordHash !== undefined) payload.password_hash = patch.passwordHash;
    if (patch.defaultTheme !== undefined) payload.default_theme = patch.defaultTheme;
    if (patch.credentialVersion !== undefined) payload.credential_version = patch.credentialVersion;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.hiddenColumns !== undefined) payload.hidden_columns = patch.hiddenColumns;
    if (patch.defaultView !== undefined) payload.default_view = patch.defaultView;
    if (patch.allowBooking !== undefined) payload.allow_booking = patch.allowBooking;
    if (patch.showRecap !== undefined) payload.show_recap = patch.showRecap;
    if (patch.showItemGroups !== undefined) payload.show_item_groups = patch.showItemGroups;
    const result = await db().from("department_portals").update(payload).eq("id", id).select(PORTAL).single();
    return toPortal(unwrap<PortalRow>(result, "department_portals.update"));
  }

  // ---- provenance ----------------------------------------------------------

  /**
   * One page, newest first. The cursor is `bookedAt|id`, so a page boundary
   * survives new requests arriving above it — an offset would not.
   */
  async listRequests(departmentId: string, options: { limit?: number; cursor?: string | null } = {}): Promise<{ rows: PortalRequest[]; nextCursor: string | null }> {
    const limit = Math.max(1, Math.min(options.limit ?? PORTAL_PAGE_SIZE, 200));
    let query = db()
      .from("portal_requests")
      .select(REQUEST)
      .eq("department_id", departmentId)
      .order("booked_at", { ascending: false })
      .order("id", { ascending: false })
      // One more than asked for, purely to learn whether another page exists.
      .limit(limit + 1);
    const cursor = parseCursor(options.cursor);
    if (cursor) query = query.or(`booked_at.lt.${cursor.bookedAt},and(booked_at.eq.${cursor.bookedAt},id.lt.${cursor.id})`);
    const rows = unwrapList<RequestRow>(await query, "portal_requests.listByDepartment").map(toRequest);
    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit && page.length > 0 ? `${page[page.length - 1]!.bookedAt}|${page[page.length - 1]!.id}` : null;
    return { rows: page, nextCursor };
  }

  async countRequests(departmentId: string): Promise<number> {
    const result = await db().from("portal_requests").select("id", { count: "exact", head: true }).eq("department_id", departmentId);
    assertOk(result, "portal_requests.countByDepartment");
    return result.count ?? 0;
  }

  async getRequestByItem(workspaceId: string, itemId: string): Promise<PortalRequest | null> {
    const result = await db().from("portal_requests").select(REQUEST).eq("workspace_id", workspaceId).eq("item_id", itemId).maybeSingle();
    const row = unwrapMaybe<RequestRow>(result, "portal_requests.byItem");
    return row ? toRequest(row) : null;
  }

  async listRequestsByItems(workspaceId: string, itemIds: readonly string[]): Promise<PortalRequest[]> {
    if (itemIds.length === 0) return [];
    const result = await db().from("portal_requests").select(REQUEST).eq("workspace_id", workspaceId).in("item_id", itemIds as string[]);
    return unwrapList<RequestRow>(result, "portal_requests.byItems").map(toRequest);
  }

  async createRequest(input: PortalRequestInput): Promise<PortalRequest> {
    const payload = {
      workspace_id: input.workspaceId,
      department_id: input.departmentId,
      item_id: input.itemId,
      source: input.source,
      public_brief: input.publicBrief,
      ...(input.bookedAt ? { booked_at: input.bookedAt } : {}),
    };
    const result = await db().from("portal_requests").insert(payload).select(REQUEST).single();
    return toRequest(unwrap<RequestRow>(result, "portal_requests.create"));
  }

  async updateRequest(id: string, patch: Partial<Pick<PortalRequest, "departmentId" | "publicBrief">>): Promise<PortalRequest> {
    const payload: Record<string, unknown> = {};
    if (patch.departmentId !== undefined) payload.department_id = patch.departmentId;
    if (patch.publicBrief !== undefined) payload.public_brief = patch.publicBrief;
    const result = await db().from("portal_requests").update(payload).eq("id", id).select(REQUEST).single();
    return toRequest(unwrap<RequestRow>(result, "portal_requests.update"));
  }

  async deleteRequest(id: string): Promise<void> {
    assertOk(await db().from("portal_requests").delete().eq("id", id), "portal_requests.delete");
  }

  // ---- submissions ---------------------------------------------------------

  async getSubmission(portalId: string, submissionKey: string): Promise<PortalSubmission | null> {
    const result = await db().from("portal_submissions").select(SUBMISSION).eq("portal_id", portalId).eq("submission_key", submissionKey).maybeSingle();
    const row = unwrapMaybe<SubmissionRow>(result, "portal_submissions.byKey");
    return row ? toSubmission(row) : null;
  }

  async createSubmission(input: Omit<PortalSubmission, "id" | "createdAt">): Promise<PortalSubmission> {
    const payload = {
      portal_id: input.portalId,
      submission_key: input.submissionKey,
      request_hash: input.requestHash,
      item_id: input.itemId,
      receipt: input.receipt,
    };
    // The unique constraint on (portal_id, submission_key) is the arbiter: when
    // two retries race, one insert fails and the caller replays the winner's
    // receipt rather than booking twice.
    const result = await db().from("portal_submissions").insert(payload).select(SUBMISSION).single();
    return toSubmission(unwrap<SubmissionRow>(result, "portal_submissions.create"));
  }

  async completeSubmission(id: string, patch: { itemId: string; receipt: unknown }): Promise<PortalSubmission> {
    const result = await db().from("portal_submissions").update({ item_id: patch.itemId, receipt: patch.receipt }).eq("id", id).select(SUBMISSION).single();
    return toSubmission(unwrap<SubmissionRow>(result, "portal_submissions.complete"));
  }

  async deleteSubmission(id: string): Promise<void> {
    assertOk(await db().from("portal_submissions").delete().eq("id", id), "portal_submissions.delete");
  }
}

/** `bookedAt|id`, or null for anything that is not shaped like one. */
function parseCursor(cursor: string | null | undefined): { bookedAt: string; id: string } | null {
  if (!cursor) return null;
  const at = cursor.lastIndexOf("|");
  if (at <= 0) return null;
  const bookedAt = cursor.slice(0, at);
  const id = cursor.slice(at + 1);
  return /^[0-9T:.+\-Z ]+$/.test(bookedAt) && /^[0-9a-fA-F-]+$/.test(id) ? { bookedAt, id } : null;
}

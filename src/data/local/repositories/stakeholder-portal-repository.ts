import type {
  StakeholderPortal,
  StakeholderPortalInput,
  PortalRequest,
  PortalRequestInput,
  PortalSubmission,
  StakeholderDepartment,
  StakeholderDepartmentInput,
} from "@/domain";
import { PORTAL_PAGE_SIZE } from "@/domain";
import { NotFoundError, type StakeholderPortalRepository } from "@/data/repositories";
import { newId, nowIso } from "@/lib/ids";
import type { LocalConnection } from "../connection";

/**
 * Departments, portals and provenance in the browser store.
 *
 * The same shape the Supabase repository serves, so the portal's services and
 * tests behave identically on either provider. What the database enforces with
 * constraints is enforced here in code and noted where it is: IndexedDB has
 * unique indexes but no cross-store foreign keys, so workspace consistency is
 * the caller's to keep.
 */
export class LocalStakeholderPortalRepository implements StakeholderPortalRepository {
  constructor(private readonly conn: LocalConnection) {}

  // ---- departments ---------------------------------------------------------

  async listDepartments(workspaceId: string, options: { includeDisabled?: boolean } = {}): Promise<StakeholderDepartment[]> {
    const db = await this.conn.getDb();
    const rows = await db.getAllFromIndex("stakeholderDepartments", "byWorkspace", workspaceId);
    return rows
      .filter((row) => options.includeDisabled || row.status === "ACTIVE")
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }

  async getDepartment(id: string): Promise<StakeholderDepartment | null> {
    const db = await this.conn.getDb();
    return (await db.get("stakeholderDepartments", id)) ?? null;
  }

  async createDepartment(input: StakeholderDepartmentInput): Promise<StakeholderDepartment> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const row: StakeholderDepartment = { id: newId(), status: "ACTIVE", createdAt: now, updatedAt: now, ...input };
    await db.put("stakeholderDepartments", row);
    return row;
  }

  async updateDepartment(id: string, patch: Partial<Pick<StakeholderDepartment, "name" | "color" | "position" | "status">>): Promise<StakeholderDepartment> {
    const db = await this.conn.getDb();
    const existing = await db.get("stakeholderDepartments", id);
    if (!existing) throw new NotFoundError("Department", id);
    const row: StakeholderDepartment = { ...existing, ...patch, updatedAt: nowIso() };
    await db.put("stakeholderDepartments", row);
    return row;
  }

  // ---- portals -------------------------------------------------------------

  async listPortals(workspaceId: string): Promise<StakeholderPortal[]> {
    const db = await this.conn.getDb();
    return db.getAllFromIndex("departmentPortals", "byWorkspace", workspaceId);
  }

  /** The workspace's own portal: the one row with no department against it. */
  async getUnifiedPortal(workspaceId: string): Promise<StakeholderPortal | null> {
    const db = await this.conn.getDb();
    const rows = await db.getAllFromIndex("departmentPortals", "byWorkspace", workspaceId);
    return rows.find((row) => row.departmentId === null) ?? null;
  }

  async getPortalByDepartment(departmentId: string): Promise<StakeholderPortal | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("departmentPortals", "byDepartment", departmentId)) ?? null;
  }

  async getPortalByToken(token: string): Promise<StakeholderPortal | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("departmentPortals", "byToken", token)) ?? null;
  }

  async createPortal(input: StakeholderPortalInput): Promise<StakeholderPortal> {
    const db = await this.conn.getDb();
    const now = nowIso();
    // The presentation defaults are the behaviour a portal had before it could
            // be configured, so an existing link is unchanged by the settings arriving.
    const row: StakeholderPortal = {
      id: newId(),
      credentialVersion: 1,
      description: null,
      hiddenColumns: [],
      defaultView: "table",
      allowBooking: true,
      showRecap: true,
      showItemGroups: false,
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    await db.put("departmentPortals", row);
    return row;
  }

  async updatePortal(id: string, patch: Partial<Pick<StakeholderPortal, "enabled" | "token" | "passwordHash" | "defaultTheme" | "credentialVersion" | "description" | "hiddenColumns" | "defaultView" | "allowBooking" | "showRecap" | "showItemGroups">>): Promise<StakeholderPortal> {
    const db = await this.conn.getDb();
    const existing = await db.get("departmentPortals", id);
    if (!existing) throw new NotFoundError("Portal", id);
    const row: StakeholderPortal = { ...existing, ...patch, updatedAt: nowIso() };
    await db.put("departmentPortals", row);
    return row;
  }

  // ---- provenance ----------------------------------------------------------

  /**
   * Newest first, and the cursor is `bookedAt|id` rather than an offset: a page
   * boundary has to stay put while requests are still arriving behind it.
   */
  async listRequests(departmentId: string, options: { limit?: number; cursor?: string | null } = {}): Promise<{ rows: PortalRequest[]; nextCursor: string | null }> {
    const db = await this.conn.getDb();
    const limit = Math.max(1, Math.min(options.limit ?? PORTAL_PAGE_SIZE, 200));
    const all = (await db.getAllFromIndex("portalRequests", "byDepartment", departmentId)).sort(
      (a, b) => b.bookedAt.localeCompare(a.bookedAt) || b.id.localeCompare(a.id),
    );
    const after = options.cursor ? all.findIndex((row) => cursorOf(row) === options.cursor) : -1;
    const start = after >= 0 ? after + 1 : 0;
    const rows = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length && rows.length > 0 ? cursorOf(rows[rows.length - 1]!) : null;
    return { rows, nextCursor };
  }

  async countRequests(departmentId: string): Promise<number> {
    const db = await this.conn.getDb();
    return db.countFromIndex("portalRequests", "byDepartment", departmentId);
  }

  async getRequestByItem(workspaceId: string, itemId: string): Promise<PortalRequest | null> {
    const db = await this.conn.getDb();
    const row = await db.getFromIndex("portalRequests", "byItem", itemId);
    // The workspace is checked rather than trusted: a tampered id must not
    // resolve just because some other workspace happens to publish that item.
    return row && row.workspaceId === workspaceId ? row : null;
  }

  async listRequestsByItems(workspaceId: string, itemIds: readonly string[]): Promise<PortalRequest[]> {
    const db = await this.conn.getDb();
    const wanted = new Set(itemIds);
    const rows = await db.getAllFromIndex("portalRequests", "byWorkspace", workspaceId);
    return rows.filter((row) => wanted.has(row.itemId));
  }

  async createRequest(input: PortalRequestInput): Promise<PortalRequest> {
    const db = await this.conn.getDb();
    const now = nowIso();
    const row: PortalRequest = {
      id: newId(),
      bookedAt: input.bookedAt ?? now,
      createdAt: now,
      updatedAt: now,
      workspaceId: input.workspaceId,
      departmentId: input.departmentId,
      itemId: input.itemId,
      source: input.source,
      publicBrief: input.publicBrief,
    };
    // The unique index on itemId rejects a second request for the same item,
    // which is the point: one canonical origin, one department.
    await db.add("portalRequests", row);
    return row;
  }

  async updateRequest(id: string, patch: Partial<Pick<PortalRequest, "departmentId" | "publicBrief">>): Promise<PortalRequest> {
    const db = await this.conn.getDb();
    const existing = await db.get("portalRequests", id);
    if (!existing) throw new NotFoundError("Portal request", id);
    const row: PortalRequest = { ...existing, ...patch, updatedAt: nowIso() };
    await db.put("portalRequests", row);
    return row;
  }

  async deleteRequest(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("portalRequests", id);
  }

  // ---- submissions ---------------------------------------------------------

  async getSubmission(portalId: string, submissionKey: string): Promise<PortalSubmission | null> {
    const db = await this.conn.getDb();
    return (await db.getFromIndex("portalSubmissions", "byKey", [portalId, submissionKey])) ?? null;
  }

  async createSubmission(input: Omit<PortalSubmission, "id" | "createdAt">): Promise<PortalSubmission> {
    const db = await this.conn.getDb();
    const row: PortalSubmission = { id: newId(), createdAt: nowIso(), ...input };
    // add, not put: the unique index on (portalId, submissionKey) is what makes
    // two parallel retries resolve to one booking.
    await db.add("portalSubmissions", row);
    return row;
  }

  async completeSubmission(id: string, patch: { itemId: string; receipt: unknown }): Promise<PortalSubmission> {
    const db = await this.conn.getDb();
    const existing = await db.get("portalSubmissions", id);
    if (!existing) throw new NotFoundError("Portal submission", id);
    const row: PortalSubmission = { ...existing, itemId: patch.itemId, receipt: patch.receipt };
    await db.put("portalSubmissions", row);
    return row;
  }

  async deleteSubmission(id: string): Promise<void> {
    const db = await this.conn.getDb();
    await db.delete("portalSubmissions", id);
  }
}

/** Sortable and unique: the time a request arrived, then its id to break ties. */
function cursorOf(row: PortalRequest): string {
  return `${row.bookedAt}|${row.id}`;
}

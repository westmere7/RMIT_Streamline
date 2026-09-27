import type { Workspace, WorkspaceMember } from "@/domain";
import type { WorkspaceRepository } from "@/data/repositories";
import { callApi } from "../api-call";
import { assertOk, db, unwrap, unwrapList, unwrapMaybe } from "../client";
import { pruneUndefined, toWorkspace, toWorkspaceMember, WORKSPACE_COLUMNS, type WorkspaceMemberRow, type WorkspaceRow } from "../rows";

const WORKSPACE = WORKSPACE_COLUMNS;
const MEMBER = "id, workspace_id, user_id, role, status, joined_at";

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  async list(): Promise<Workspace[]> {
    const result = await db().from("workspaces").select(WORKSPACE).order("name", { ascending: true });
    return unwrapList<WorkspaceRow>(result, "workspaces.list").map(toWorkspace);
  }

  async getById(id: string): Promise<Workspace | null> {
    const result = await db().from("workspaces").select(WORKSPACE).eq("id", id).maybeSingle();
    const row = unwrapMaybe<WorkspaceRow>(result, "workspaces.getById");
    return row ? toWorkspace(row) : null;
  }

  async getBySlug(slug: string): Promise<Workspace | null> {
    const result = await db().from("workspaces").select(WORKSPACE).eq("slug", slug).maybeSingle();
    const row = unwrapMaybe<WorkspaceRow>(result, "workspaces.getBySlug");
    return row ? toWorkspace(row) : null;
  }

  async update(id: string, patch: Partial<Omit<Workspace, "id" | "createdAt">>): Promise<Workspace> {
    const payload = pruneUndefined({ name: patch.name, slug: patch.slug, logo_url: patch.logoUrl, booking_key: patch.bookingKey, booking_form: patch.bookingForm, booking_form_draft: patch.bookingFormDraft, booking_form_name: patch.bookingFormName, booking_form_published_at: patch.bookingFormPublishedAt, booking_form_bookings: patch.bookingFormBookings, creative_team_name: patch.creativeTeamName, asset_rates: patch.assetRates, ticket_prefix: patch.ticketPrefix, bug_board_id: patch.bugBoardId, join_key: patch.joinKey, show_portal_menu: patch.showPortalMenu ?? undefined });
    const result = await db().from("workspaces").update(payload).eq("id", id).select(WORKSPACE).single();
    return toWorkspace(unwrap<WorkspaceRow>(result, "workspaces.update"));
  }

  /**
   * Inserted without asking for the row back: the Owners are seated by a
   * trigger at the end of the statement, and until then the new row is one the
   * caller may not yet read. Read by slug once it is in.
   */
  async create(input: { name: string; slug: string }): Promise<Workspace> {
    assertOk(await db().from("workspaces").insert({ name: input.name, slug: input.slug }), "workspaces.create");
    const created = await this.getBySlug(input.slug);
    if (!created) throw new Error("workspaces.create: the new workspace could not be read back");
    return created;
  }

  /** Through the server, which takes a snapshot of everything first and then deletes with the service role. */
  async delete(id: string): Promise<void> {
    await callApi(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" }, { auth: "required" });
  }

  async listOwners(): Promise<string[]> {
    const result = await db().from("app_owners").select("user_id");
    return unwrapList<{ user_id: string }>(result, "app_owners.list").map((row) => row.user_id);
  }

  async listDirectory(): Promise<string[]> {
    const result = await db().rpc("directory_people");
    if (result.error) throw new Error(`workspaces.listDirectory: ${result.error.message}`);
    return ((result.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id);
  }

  async addOwner(userId: string, grantedBy: string): Promise<void> {
    assertOk(await db().from("app_owners").insert({ user_id: userId, granted_by: grantedBy }), "app_owners.add");
  }

  async removeOwner(userId: string): Promise<void> {
    assertOk(await db().from("app_owners").delete().eq("user_id", userId), "app_owners.remove");
  }

  /**
   * One statement, one row lock: `next_ticket_numbers` bumps the counter and
   * hands back what it took. The counter is not patchable through `update` on
   * purpose — writing it from a value read a moment ago is exactly the race
   * this exists to close.
   */
  async allocateTicketNumbers(workspaceId: string, count = 1): Promise<number> {
    const result = await db().rpc("next_ticket_numbers", { p_workspace: workspaceId, p_count: count });
    if (result.error) throw new Error(`workspaces.allocateTicketNumbers: ${result.error.message}`);
    const first = Number(result.data);
    if (!Number.isFinite(first) || first < 1) throw new Error("workspaces.allocateTicketNumbers: the database returned no number");
    return first;
  }

  /** The bug series' counter, bumped the same way by `next_bug_ticket_numbers`. */
  async allocateBugTicketNumbers(workspaceId: string, count = 1): Promise<number> {
    const result = await db().rpc("next_bug_ticket_numbers", { p_workspace: workspaceId, p_count: count });
    if (result.error) throw new Error(`workspaces.allocateBugTicketNumbers: ${result.error.message}`);
    const first = Number(result.data);
    if (!Number.isFinite(first) || first < 1) throw new Error("workspaces.allocateBugTicketNumbers: the database returned no number");
    return first;
  }

  /** One statement in the database, so two bookings landing together each count. */
  async countFormBooking(workspaceId: string): Promise<void> {
    const result = await db().rpc("count_form_booking", { p_workspace: workspaceId });
    if (result.error) throw new Error(`workspaces.countFormBooking: ${result.error.message}`);
  }

  async listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const result = await db().from("workspace_members").select(MEMBER).eq("workspace_id", workspaceId);
    return unwrapList<WorkspaceMemberRow>(result, "workspace_members.listMembers").map(toWorkspaceMember);
  }

  async listMembershipsForUser(userId: string): Promise<WorkspaceMember[]> {
    const result = await db().from("workspace_members").select(MEMBER).eq("user_id", userId);
    return unwrapList<WorkspaceMemberRow>(result, "workspace_members.listMembershipsForUser").map(toWorkspaceMember);
  }

  async addMember(input: Omit<WorkspaceMember, "id">): Promise<WorkspaceMember> {
    const payload = {
      workspace_id: input.workspaceId,
      user_id: input.userId,
      role: input.role,
      status: input.status,
      joined_at: input.joinedAt,
    };
    const result = await db().from("workspace_members").insert(payload).select(MEMBER).single();
    return toWorkspaceMember(unwrap<WorkspaceMemberRow>(result, "workspace_members.addMember"));
  }

  async updateMember(id: string, patch: Partial<Omit<WorkspaceMember, "id">>): Promise<WorkspaceMember> {
    const payload = pruneUndefined({
      workspace_id: patch.workspaceId,
      user_id: patch.userId,
      role: patch.role,
      status: patch.status,
      joined_at: patch.joinedAt,
    });
    const result = await db().from("workspace_members").update(payload).eq("id", id).select(MEMBER).single();
    return toWorkspaceMember(unwrap<WorkspaceMemberRow>(result, "workspace_members.updateMember"));
  }

  async removeMember(id: string): Promise<void> {
    assertOk(await db().from("workspace_members").delete().eq("id", id), "workspace_members.removeMember");
  }
}
